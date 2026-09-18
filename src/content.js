// Content script: recolours lichess engine arrows by multi-PV rank.
// Relies on src/logic.js (loaded first) exposing globalThis.LAC.
(() => {
  'use strict';
  const { parseCgHash, pvKeys, rankArrows, colorForRank, parseEvalText, scoreArrows, colorForShift, spanOf, drawOrder,
    parseStrokeWidth, borderStrokeWidth, borderMarker, arrowStrokeWidth,
    continuationMoves, lineForArrow, calibrate, arrowEndpoints, labelPoint, LABEL_RADIUS, LABEL_STEP, LABEL_FONT,
    stripePattern, stripeTransform, splitAtHead, darker, STRIPE_ANGLE, BEST_BRUSH, DEFAULTS } = globalThis.LAC;
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  let settings = { ...DEFAULTS };
  let scheduled = false;

  // ---- reading lichess state -------------------------------------------

  const rowMove = row =>
    row.getAttribute('data-uci') || row.querySelector('.pv-san')?.getAttribute('data-board') || '';

  function pvRows() {
    return Array.from(document.querySelectorAll('.pv_box .pv'));
  }

  function readPvKeys() {
    return pvKeys(pvRows().map(rowMove));
  }

  /** [{ key, eval }] in rank order. The eval is white POV, as lichess renders it. */
  function readPvs() {
    return pvRows()
      .map(row => ({
        key: pvKeys([rowMove(row)])[0],
        eval: parseEvalText(row.querySelector('strong')?.textContent || ''),
      }))
      .filter(pv => pv.key);
  }

  /**
   * Every move of the line lichess is pointing at, in order, as it writes
   * them: the panel gives each move of a PV its own .pv-san carrying
   * "fen|uci" for the board it previews on hover.
   *
   * `key` is the move lichess is drawing with the best brush, which is its
   * own best line most of the time and the line under the pointer while the
   * engine panel is being read. Rows are mapped one at a time rather than
   * through readPvKeys, which drops the ones it cannot read and would shift
   * every row after the hole.
   */
  function bestLineMoves(key) {
    const rows = pvRows();
    const row = rows[lineForArrow(rows.map(r => pvKeys([rowMove(r)])[0]), key)];
    if (!row) return [];
    const sans = Array.from(row.querySelectorAll('.pv-san')).map(el => el.getAttribute('data-board') || '');
    if (sans.length) return sans;
    const first = rowMove(row);
    return first ? [first] : [];
  }

  /** Side to move, from the FEN on the engine panel. Defaults to white. */
  function turnColor() {
    const fen = document.querySelector('.pv_box')?.getAttribute('data-fen') || '';
    return fen.split(' ')[1] === 'b' ? 'black' : 'white';
  }

  function boardSvgs() {
    const main = document.querySelectorAll('.main-board svg.cg-shapes');
    return main.length ? main : document.querySelectorAll('svg.cg-shapes');
  }

  // ---- svg markers (arrowheads) ----------------------------------------

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Create an arrowhead marker on demand and return its id. With no `spec`
   * this is chessground's own head filled in `color`; with one it is the
   * outline's head, which draws the same triangle stroked outwards.
   */
  function ensureMarker(svg, boardIdx, color, spec) {
    const geom = spec || { path: 'M0,0 V4 L3,2 Z', refX: 2.05, refY: 2 };
    const id = [
      'lac',
      boardIdx,
      color.replace(/[^a-z0-9]/gi, ''),
      geom.refX.toFixed(4),
      (geom.strokeWidth || 0).toFixed(4),
    ].join('-');
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    if (!defs.querySelector(`marker[id="${id}"]`)) {
      const marker = document.createElementNS(SVG_NS, 'marker');
      for (const [k, v] of Object.entries({
        id, cgKey: id, orient: 'auto', overflow: 'visible',
        markerWidth: 4, markerHeight: 4, refX: geom.refX, refY: geom.refY,
      })) {
        marker.setAttribute(k, v);
      }
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', geom.path);
      path.setAttribute('fill', color);
      if (geom.strokeWidth) {
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', String(geom.strokeWidth));
        path.setAttribute('stroke-linejoin', geom.strokeLinejoin || 'round');
      }
      marker.appendChild(path);
      defs.appendChild(marker);
    }
    return id;
  }

  const ORIG_ATTRS = ['stroke', 'marker-end', 'opacity', 'stroke-width'];

  /** What lichess had on the line before we touched it. */
  function origAttr(line, attr) {
    const raw = line.getAttribute('data-lac-orig');
    return raw ? JSON.parse(raw)[ORIG_ATTRS.indexOf(attr)] : null;
  }

  /**
   * Fade the whole arrow via its group rather than per line. Painting a
   * translucent arrow over its own outline would let the outline show through
   * the body and muddy the colour; an opaque arrow inside a faded group keeps
   * the outline at the edges where it belongs.
   */
  function setGroupOpacity(group) {
    if (!group.hasAttribute('data-lac-gop')) {
      group.setAttribute('data-lac-gop', group.getAttribute('opacity') ?? '');
    }
    group.setAttribute('opacity', String(settings.opacity));
  }

  function restoreGroupOpacity(group) {
    if (!group.hasAttribute('data-lac-gop')) return;
    const orig = group.getAttribute('data-lac-gop');
    if (orig) group.setAttribute('opacity', orig);
    else group.removeAttribute('opacity');
    group.removeAttribute('data-lac-gop');
  }

  /**
   * Draw the outline as a wider copy of the arrow sitting beneath it. That
   * handles the shaft; the head needs its own marker, built by borderMarker,
   * because a wider stroke would inflate the head rather than outline it.
   */
  function addBorder(svg, boardIdx, group, line, head = true, borderWidth = settings.borderWidth) {
    const arrowWidth = parseStrokeWidth(line.getAttribute('stroke-width'));
    const width = borderStrokeWidth(arrowWidth, borderWidth);
    if (!width) return;
    const border = line.cloneNode(false);
    border.removeAttribute('data-lac-orig');
    border.setAttribute('data-lac-border', '');
    border.setAttribute('stroke', settings.borderColor);
    border.setAttribute('stroke-width', String(width));
    border.setAttribute('opacity', '1');
    if (head) {
      const geom = borderMarker(arrowWidth, borderWidth);
      border.setAttribute('marker-end', `url(#${ensureMarker(svg, boardIdx, settings.borderColor, geom)})`);
    } else {
      border.removeAttribute('marker-end');
    }
    group.insertBefore(border, group.firstChild);
  }

  const ownLines = group => Array.from(group.querySelectorAll('line:not([data-lac-border])'));

  function clearBorders(group) {
    group.querySelectorAll('line[data-lac-border]').forEach(el => el.remove());
  }

  function paint(line, color, markerRef) {
    if (!line.hasAttribute('data-lac-orig')) {
      line.setAttribute('data-lac-orig', JSON.stringify(ORIG_ATTRS.map(a => line.getAttribute(a))));
    }
    line.setAttribute('stroke', color);
    line.setAttribute('marker-end', `url(#${markerRef})`);
    line.setAttribute('opacity', '1');
    // Measure from lichess's own width, not from a width we already set, or
    // turning this off would leave the arrows at the size we gave them.
    const width = arrowStrokeWidth(parseStrokeWidth(origAttr(line, 'stroke-width')), settings.uniformWidth, settings.width);
    if (width) line.setAttribute('stroke-width', String(width));
  }

  function restore(group) {
    group.removeAttribute('data-lac');
    clearBorders(group);
    restoreGroupOpacity(group);
    group.querySelectorAll('line[data-lac-orig]').forEach(line => {
      const orig = JSON.parse(line.getAttribute('data-lac-orig'));
      ORIG_ATTRS.forEach((a, i) => (orig[i] == null ? line.removeAttribute(a) : line.setAttribute(a, orig[i])));
      line.removeAttribute('data-lac-orig');
    });
  }

  // ---- the rest of the best line ---------------------------------------

  // Arrows we draw ourselves, for the moves of the best line that lichess
  // does not draw. chessground removes any group whose cgHash it does not
  // recognise, so these go when it redraws the board and are put back by the
  // apply() the same mutation triggers.
  const EXTRA = 'data-lac-extra';
  const LABEL = 'data-lac-label';
  const LINE_STAMP = 'data-lac-line';

  function clearExtras(svg) {
    svg.querySelectorAll(`g[${EXTRA}], g[${LABEL}]`).forEach(el => el.remove());
    svg.removeAttribute(LINE_STAMP);
  }

  /**
   * An arrow already on the board to take the geometry from: where its
   * squares sit and how far short of the destination chessground stops the
   * line. `prefer` is tried first so the copy inherits the best line's own
   * width rather than a thinner alternative's.
   */
  function calibrateFrom(groups, parsed, prefer) {
    const order = [prefer, ...groups.map((_, i) => i)];
    for (const i of order) {
      const p = parsed[i];
      if (!p || !p.dest) continue;
      const line = ownLines(groups[i])[0];
      if (!line) continue;
      const at = a => parseFloat(line.getAttribute(a));
      const cal = calibrate({ orig: p.orig, dest: p.dest, x1: at('x1'), y1: at('y1'), x2: at('x2'), y2: at('y2') });
      if (cal) return { cal, line };
    }
    return null;
  }

  const lengthOf = at => Math.hypot(at.x2 - at.x1, at.y2 - at.y1);

  /** The shaft of an arrow, which is what a numeral is placed against. */
  function shaftOf(at, width) {
    const cut = splitAtHead(at.x1, at.y1, at.x2, at.y2, width);
    return (cut && cut.shaft) || at;
  }

  /**
   * The width one of lichess's own arrows ends up drawn at: its own width, or
   * the one width every arrow is given. Measured from what lichess had before
   * we touched it, as paint() does, so reading it back off an arrow we have
   * already painted gives the same answer.
   */
  function drawnWidth(line) {
    const own = parseStrokeWidth(origAttr(line, 'stroke-width') ?? line.getAttribute('stroke-width'));
    return arrowStrokeWidth(own, settings.uniformWidth, settings.width);
  }

  /**
   * The move's place in the best line, as a disc beside the shaft. Lichess's
   * own arrow is the line's first move, so it is 1 and the one after it is 2.
   *
   * It goes in a group of its own rather than the arrow's, because the added
   * arrows are drawn faded and a faded number cannot be read.
   */
  function makeLabel(at, ply, color, width, back) {
    // Clear of the arrow's own edge, outline included.
    const clear = width / 2 + (settings.border ? settings.borderWidth : 0);
    const point = labelPoint(at, back, LABEL_RADIUS + clear);
    if (!point) return null;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute(LABEL, '');
    // Solid, where the arrows are faded. A translucent numeral takes on
    // whatever it happens to be over — a lichess arrow crossing underneath,
    // a piece, a dark square — and stops being readable.
    group.setAttribute('opacity', '1');
    const disc = document.createElementNS(SVG_NS, 'circle');
    for (const [k, v] of Object.entries({ cx: point.x, cy: point.y, r: LABEL_RADIUS, fill: color })) {
      disc.setAttribute(k, String(v));
    }
    if (settings.border && settings.borderWidth > 0) {
      disc.setAttribute('stroke', settings.borderColor);
      disc.setAttribute('stroke-width', String(settings.borderWidth));
    }
    const text = document.createElementNS(SVG_NS, 'text');
    for (const [k, v] of Object.entries({
      x: point.x, y: point.y, fill: '#ffffff', 'font-size': LABEL_FONT, 'font-weight': 'bold',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    })) {
      text.setAttribute(k, String(v));
    }
    text.textContent = String(ply + 1);
    group.appendChild(disc);
    group.appendChild(text);
    return group;
  }

  /**
   * A numeral beside one of lichess's own arrows: the line's first move,
   * which is the arrow lichess draws, and any later move of the line that
   * another line happens to start with. The geometry is read off the arrow
   * itself rather than worked out, since lichess drew it and not us, and the
   * clearance is a full-width arrow's, not a halved one's.
   */
  function labelOnArrow(group, ply, color, back) {
    const line = group && ownLines(group)[0];
    if (!line) return null;
    const at = {};
    for (const a of ['x1', 'y1', 'x2', 'y2']) {
      at[a] = parseFloat(line.getAttribute(a));
      if (!Number.isFinite(at[a])) return null;
    }
    const width = drawnWidth(line) || parseStrokeWidth(line.getAttribute('stroke-width')) || DEFAULTS.width;
    const cut = splitAtHead(at.x1, at.y1, at.x2, at.y2, width);
    return makeLabel((cut && cut.shaft) || at, ply, color, width, back);
  }

  /** Which of lichess's arrows is the move `key`, or -1 if none of them is. */
  const hostArrow = (parsed, key) => parsed.findIndex(p => p && p.dest && p.orig + p.dest === key);

  /**
   * A copy of a real lichess arrow, moved onto `at` and painted. Copied
   * rather than built so it keeps whatever chessground puts on an arrow
   * beyond the attributes set here.
   */
  function newLine(template, at, color, width) {
    const line = template.cloneNode(false);
    line.removeAttribute('data-lac-orig');
    for (const [k, v] of Object.entries(at)) line.setAttribute(k, String(v));
    line.setAttribute('stroke', color);
    line.setAttribute('opacity', '1');
    if (width) line.setAttribute('stroke-width', String(width));
    return line;
  }

  /**
   * Draw the continuation arrows, and return them so they take part in the
   * longest-first ordering with lichess's own. Rebuilt only when something
   * about them has actually changed: the observer sees every arrow we add,
   * and rebuilding on each pass would never settle.
   */
  function syncExtras(svg, boardIdx, groups, parsed, colors) {
    const none = { groups: [], parsed: [] };
    const parent = groups.length ? groups[0].parentNode : null;
    const bestIdx = parsed.findIndex((p, i) => p && p.dest && p.brush === BEST_BRUSH && colors[i]);
    const ref = parent && settings.lineDepth > 0 && bestIdx >= 0 ? calibrateFrom(groups, parsed, bestIdx) : null;
    if (!ref) {
      clearExtras(svg);
      return none;
    }
    // A darker shade of the best move's own colour: still plainly the best
    // line, still plainly not the move lichess is pointing at.
    const color = darker(colors[bestIdx]);
    const bestKey = parsed[bestIdx].orig + parsed[bestIdx].dest;
    const onBoard = parsed.filter(p => p && p.dest).map(p => p.orig + p.dest);
    // Every move of the line, whether or not it needs an arrow of its own:
    // all of them are numbered, and `host` says which arrow already on the
    // board a move that does not need one belongs to.
    const moves = continuationMoves(bestLineMoves(bestKey), settings.lineDepth, onBoard)
      .map(m => ({ ...m, at: arrowEndpoints(m.orig, m.dest, ref.cal), host: m.drawn ? hostArrow(parsed, m.key) : -1 }))
      .filter(m => m.at);
    const mine = moves.filter(m => !m.drawn);

    const stamp = [
      colors[bestIdx], settings.opacity, settings.lineDepth, settings.lineOpacity, settings.uniformWidth, settings.width,
      settings.border, settings.borderColor, settings.borderWidth,
      ref.cal.flipped, ref.cal.margin,
      bestKey, moves.map(m => m.key + (m.drawn ? '=' : '')).join(' '),
    ].join(':');
    // The labels ride along in the ordering with a length of nothing, which
    // leaves them on top of every arrow.
    const withLabels = (arrows, labels) => ({
      groups: arrows.concat(labels),
      parsed: mine.concat(labels.map(() => ({ label: true }))),
    });
    const existing = Array.from(parent.querySelectorAll(`:scope > g[${EXTRA}]`));
    if (svg.getAttribute(LINE_STAMP) === stamp && existing.length === mine.length) {
      return withLabels(existing, Array.from(parent.querySelectorAll(`:scope > g[${LABEL}]`)));
    }

    clearExtras(svg);
    svg.setAttribute(LINE_STAMP, stamp);
    // As wide as any other arrow, outline and all: where the head ends, how
    // long a stripe runs and how big the arrowhead comes out all follow from
    // it. The stripes and the darker shade are what mark these as ours, so
    // there is nothing for a thinner line to say that they do not.
    const width = drawnWidth(ref.line) || parseStrokeWidth(ref.line.getAttribute('stroke-width')) || DEFAULTS.width;
    // The same filled head lichess's own arrows get. The shaft's stripes run
    // the whole length of the arrow and say plainly enough that the extension
    // drew it; a head only three stroke widths long cannot carry a stripe and
    // still read as an arrowhead, since a single gap, leaning, takes a bite
    // out of it corner to corner.
    const marker = ensureMarker(svg, boardIdx, color);
    const made = mine.map(m => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute(EXTRA, '');
      // Faded by the group, as with lichess's arrows, so the outline does not
      // show through the shaft.
      g.setAttribute('opacity', String(settings.opacity * settings.lineOpacity));

      // Striped, so an arrow the extension drew is never mistaken for one
      // lichess drew. The arrow is split where the arrowhead's back edge
      // falls: the shaft takes the stripes and the shear, the other piece
      // takes the head, which is left solid. Both are cut square at the ends,
      // so the shear leaves a clean diagonal and no cap rounds out past the
      // head. The outlines are cloned off the two, stripes, shear and all.
      const cut = splitAtHead(m.at.x1, m.at.y1, m.at.x2, m.at.y2, width);
      const lines = [];
      if (cut && cut.shaft) {
        const shaft = newLine(ref.line, cut.shaft, color, width);
        shaft.removeAttribute('marker-end');
        shaft.setAttribute('stroke-linecap', 'butt');
        const stripes = stripePattern(width, lengthOf(cut.shaft));
        if (stripes) shaft.setAttribute('stroke-dasharray', stripes.join(' '));
        const skew = stripeTransform(cut.shaft.x1, cut.shaft.y1, cut.shaft.x2, cut.shaft.y2, STRIPE_ANGLE);
        if (skew) shaft.setAttribute('transform', skew);
        lines.push([shaft, false]);
      }
      const head = newLine(ref.line, cut ? cut.head : m.at, color, width);
      head.setAttribute('stroke-linecap', 'butt');
      head.setAttribute('marker-end', `url(#${marker})`);
      lines.push([head, true]);

      lines.forEach(([line]) => g.appendChild(line));
      parent.appendChild(g);
      if (settings.border) lines.forEach(([line, withHead]) => addBorder(svg, boardIdx, g, line, withHead));
      return g;
    });

    // Now number the line, every move of it and in order. A move already on
    // the board is numbered beside the arrow that is there, so the numbers
    // run 1, 2, 3 whether or not we had to draw the arrow ourselves.
    //
    // A lone 1 on a board with nothing after it says nothing, so the move
    // lichess draws is numbered only once the line carries on past it.
    const carried = new Map();
    const labels = [];
    // Two numerals on one arrow — a line that plays a move twice — step back
    // along the shaft rather than landing on each other.
    const stepBack = key => {
      const n = carried.get(key) || 0;
      carried.set(key, n + 1);
      return LABEL_RADIUS + n * LABEL_STEP;
    };
    const first = { ply: 0, key: bestKey, host: bestIdx };
    for (const m of moves.length ? [first, ...moves] : []) {
      const back = stepBack(m.key);
      // The line's own colour throughout: bright for the move to play, darker
      // for what follows. A numeral riding on another line's arrow keeps the
      // darker shade rather than taking that arrow's, which would read as a
      // remark on how good the move is instead of where it falls in the line.
      const label = m.host >= 0
        ? labelOnArrow(groups[m.host], m.ply, m.ply ? color : colors[bestIdx], back)
        : makeLabel(shaftOf(m.at, width), m.ply, color, width, back);
      if (label) {
        parent.appendChild(label);
        labels.push(label);
      }
    }
    return withLabels(made, labels);
  }

  /** Colour per arrow group, or null to leave it alone. */
  function colorsFor(parsed) {
    if (settings.mode === 'rank') {
      return rankArrows(parsed, readPvKeys()).map(rank => colorForRank(rank, settings.colors));
    }
    const shifts = scoreArrows(parsed, readPvs(), turnColor());
    const span = settings.normalize ? spanOf(shifts) : undefined;
    return shifts.map(s => colorForShift(s, span));
  }

  /**
   * An SVG paints in document order, so the arrow lichess lists last covers
   * every arrow it crosses. Redraw longest first instead: a long arrow has
   * plenty of shaft left to read, a short one has almost none, so the short
   * one wins the overlap. chessground diffs its shapes by cgHash rather than
   * by position, so moving the groups about does not confuse it.
   */
  function reorder(groups, parsed) {
    const parent = groups[0].parentNode;
    if (groups.some(g => g.parentNode !== parent)) return;
    const sorted = drawOrder(parsed).map(i => groups[i]);
    // Moving nodes is itself a mutation, and the observer would send us
    // straight back here, so only touch the DOM when the order really changes.
    if (sorted.every((g, i) => g === groups[i])) return;
    sorted.forEach(g => parent.appendChild(g));
  }

  function apply() {
    boardSvgs().forEach((svg, boardIdx) => {
      const groups = Array.from(svg.querySelectorAll(':scope > g > g[cgHash]'));
      const parsed = groups.map(g => parseCgHash(g.getAttribute('cgHash')));
      const colors = settings.enabled ? colorsFor(parsed) : groups.map(() => null);
      if (settings.enabled) {
        const extra = syncExtras(svg, boardIdx, groups, parsed, colors);
        const all = groups.concat(extra.groups);
        if (all.length > 1) reorder(all, parsed.concat(extra.parsed));
      } else {
        clearExtras(svg);
      }
      groups.forEach((g, i) => {
        const color = colors[i];
        if (!color) {
          if (g.hasAttribute('data-lac')) restore(g);
          return;
        }
        const stamp = [color, settings.opacity, settings.uniformWidth, settings.width, settings.border, settings.borderColor, settings.borderWidth].join(':');
        if (g.getAttribute('data-lac') === stamp) return;
        g.setAttribute('data-lac', stamp);
        clearBorders(g);
        setGroupOpacity(g);
        const marker = ensureMarker(svg, boardIdx, color);
        ownLines(g).forEach(line => {
          paint(line, color, marker);
          if (settings.border) addBorder(svg, boardIdx, g, line);
        });
      });
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  // ---- wiring ----------------------------------------------------------

  function loadSettings(cb) {
    if (!hasStorage) return cb();
    chrome.storage.sync.get(DEFAULTS, stored => {
      settings = { ...DEFAULTS, ...stored };
      if (!Array.isArray(settings.colors) || !settings.colors.length) settings.colors = DEFAULTS.colors;
      cb();
    });
  }

  loadSettings(() => {
    apply();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-uci'],
    });
    if (hasStorage) {
      chrome.storage.onChanged.addListener((_changes, area) => {
        if (area === 'sync') loadSettings(apply);
      });
    }
  });

  // Debug hooks, for poking at the extension from devtools.
  globalThis.__lacApply = apply;
  globalThis.__lacSettings = settings;
})();
