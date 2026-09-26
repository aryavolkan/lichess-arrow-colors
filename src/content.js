// Content script: recolours lichess engine arrows by multi-PV rank.
// Relies on src/logic.js (loaded first) exposing globalThis.LAC.
(() => {
  'use strict';
  const { parseCgHash, pvKeys, rankArrows, colorForRank, parseEvalText, scoreArrows, colorForShift, spanOf, drawOrder,
    parseStrokeWidth, borderStrokeWidth, borderMarker, arrowStrokeWidth,
    continuationMoves, lineForArrow, calibrate, arrowEndpoints, labelPoint, LABEL_RADIUS, LABEL_STEP, LABEL_FONT,
    stripePattern, stripeTransform, splitAtHead, headStripes, darker, STRIPE_ANGLE, CG_HEAD, BEST_BRUSH, ALT_BRUSH, shortcutFor,
    DEFAULTS } = globalThis.LAC;
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  let settings = { ...DEFAULTS };
  let scheduled = false;
  // The engine line a digit key has put on the board on its own: which row of
  // the panel, and the position it was picked in, so it lets go by itself
  // when the position moves on.
  let picked = null;

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
   * every row after the hole. A line picked with a digit key names its row
   * outright in `rowIdx`, since its first move need not be on the board.
   */
  function bestLineMoves(key, rowIdx = -1) {
    const rows = pvRows();
    const row = rows[rowIdx >= 0 ? rowIdx : lineForArrow(rows.map(r => pvKeys([rowMove(r)])[0]), key)];
    if (!row) return [];
    const sans = Array.from(row.querySelectorAll('.pv-san')).map(el => el.getAttribute('data-board') || '');
    if (sans.length) return sans;
    const first = rowMove(row);
    return first ? [first] : [];
  }

  /** The position the engine panel is analysing, as lichess writes it on the panel. */
  const panelFen = () => document.querySelector('.pv_box')?.getAttribute('data-fen') || '';

  /** Side to move, from the FEN on the engine panel. Defaults to white. */
  function turnColor() {
    return panelFen().split(' ')[1] === 'b' ? 'black' : 'white';
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
      geom.key || '',
    ].join('-');
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    if (geom.clip) ensureHeadClip(defs, geom.clip);
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
      path.setAttribute('fill', geom.fill === 'none' ? 'none' : color);
      if (geom.clip) path.setAttribute('clip-path', `url(#${geom.clip})`);
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

  /**
   * The arrowhead's own outline, as a clip for the stripes drawn across it.
   * One per board: the stripes are in marker units, so the same clip serves
   * every striped head whatever width it is drawn at.
   */
  function ensureHeadClip(defs, id) {
    if (defs.querySelector(`clipPath[id="${id}"]`)) return;
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', id);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M0,0 V4 L3,2 Z');
    clip.appendChild(path);
    defs.appendChild(clip);
  }

  const bandPath = bands =>
    bands.map(b => `M${b.map(p => `${p.x},${p.y}`).join(' L')} Z`).join(' ');

  /**
   * A striped arrowhead: the same stripes the shaft carries, on the same
   * rhythm and the same lean, drawn across the head and clipped to its
   * outline. The outline comes from the border marker, which is why that one
   * is drawn unfilled for these arrows -- a filled black head underneath
   * would show through the gaps instead of the board.
   */
  const stripedHead = boardIdx => ({
    key: 'st',
    path: bandPath(headStripes(STRIPE_ANGLE)),
    refX: CG_HEAD.refX,
    refY: CG_HEAD.refY,
    clip: `lac-head-${boardIdx}`,
  });

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
   *
   * Where the move tree branches, lichess wraps the lines of the arrow the
   * branch goes on with in a group of their own, faded again by the brush.
   * That left the arrow for the move played, when the engine agrees with it,
   * the faintest on the board, so the inner group is drawn at full strength
   * and the arrow faded once, like every other.
   */
  function setGroupOpacity(group, opacity = settings.opacity) {
    if (!group.hasAttribute('data-lac-gop')) {
      group.setAttribute('data-lac-gop', group.getAttribute('opacity') ?? '');
    }
    group.setAttribute('opacity', String(opacity));
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
   *
   * The outline goes immediately beneath the line it outlines, not at the
   * front of the group, so an arrow drawn in several pieces paints each piece
   * whole before starting the next. It matters at the join: the shear slides
   * the shaft's last stripe along the arrow by half a width, so the stripe
   * overshoots the arrowhead's back edge on one side, and with every outline
   * underneath everything the overshooting stripe painted over the head's own
   * outline and bit a notch out of its back corner. Painted in pieces, the
   * head lands whole on top of whatever the shaft does there.
   *
   * Beneath it in whatever group holds the line, which is not always the
   * arrow's own: where the move tree branches, lichess marks the move the
   * branch goes on with by wrapping that arrow's lines in a group of their
   * own, and putting the outline in the outer one threw and stopped the pass
   * part way through the board.
   */
  function addBorder(svg, boardIdx, line, head = true, outlineOnly = false) {
    const arrowWidth = parseStrokeWidth(line.getAttribute('stroke-width'));
    const width = borderStrokeWidth(arrowWidth, settings.borderWidth);
    if (!width) return;
    const border = line.cloneNode(false);
    border.removeAttribute('data-lac-orig');
    border.setAttribute('data-lac-border', '');
    border.setAttribute('stroke', settings.borderColor);
    border.setAttribute('stroke-width', String(width));
    border.setAttribute('opacity', '1');
    if (head) {
      const geom = borderMarker(arrowWidth, settings.borderWidth);
      if (outlineOnly) Object.assign(geom, { fill: 'none', key: 'o' });
      border.setAttribute('marker-end', `url(#${ensureMarker(svg, boardIdx, settings.borderColor, geom)})`);
    } else {
      border.removeAttribute('marker-end');
    }
    line.parentNode.insertBefore(border, line);
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
    group.querySelectorAll('g[data-lac-gop]').forEach(restoreGroupOpacity);
    group.removeAttribute('visibility');
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
   * The line the board follows. Left alone, that is the line lichess draws
   * with the best brush: its own best line, or the one under the pointer. A
   * digit key picks a row of the panel instead, whose first move may or may
   * not have an arrow on the board -- lichess draws no arrow for a line much
   * worse than the best -- so `idx` is -1 when the extension has to draw it.
   *
   * `colors` is read for the arrow's own colour when it is on the board; a
   * missing arrow's colour is worked out by the caller, which scores it as one
   * more alternative arrow so it lands where the panel's numbers put it.
   */
  function focusFor(parsed, colors) {
    if (picked) {
      const rows = pvRows();
      const key = rows[picked.index] ? pvKeys([rowMove(rows[picked.index])])[0] : null;
      if (!key) return null;
      const idx = hostArrow(parsed, key);
      return { key, idx, row: picked.index, picked: true, color: idx >= 0 ? colors[idx] : colors[parsed.length] };
    }
    const idx = parsed.findIndex((p, i) => p && p.dest && p.brush === BEST_BRUSH && colors[i]);
    if (idx < 0) return null;
    return { key: parsed[idx].orig + parsed[idx].dest, idx, row: -1, picked: false, color: colors[idx] };
  }

  /** The arrow a picked line's first move would be, for scoring when lichess has not drawn it. */
  function pickedArrow(parsed) {
    if (!picked) return null;
    const row = pvRows()[picked.index];
    const key = row ? pvKeys([rowMove(row)])[0] : null;
    if (!key || hostArrow(parsed, key) >= 0) return null;
    return { orig: key.slice(0, 2), dest: key.slice(2, 4), brush: ALT_BRUSH, lineWidth: null };
  }

  /**
   * Draw the continuation arrows, and return them so they take part in the
   * longest-first ordering with lichess's own. Rebuilt only when something
   * about them has actually changed: the observer sees every arrow we add,
   * and rebuilding on each pass would never settle.
   *
   * With a line picked from the keyboard, the line's first move is drawn here
   * too when lichess has no arrow for it: solid and at full strength, as the
   * arrow lichess would have drawn, since it is the move to play and not a
   * move further down the line.
   */
  function syncExtras(svg, boardIdx, groups, parsed, colors, focus) {
    const none = { groups: [], parsed: [] };
    const parent = groups.length ? groups[0].parentNode : null;
    const wanted = focus && (settings.lineDepth > 0 || focus.picked);
    const ref = parent && wanted && focus.color ? calibrateFrom(groups, parsed, focus.idx) : null;
    if (!ref) {
      clearExtras(svg);
      return none;
    }
    // A darker shade of the best move's own colour: still plainly the best
    // line, still plainly not the move lichess is pointing at.
    const color = darker(focus.color);
    const bestKey = focus.key;
    // A picked line has every other arrow hidden, so only its own first move
    // counts as already on the board -- and it does whether lichess drew it or
    // this pass is about to, so a line that plays the move again later does
    // not lay a second arrow over it.
    const onBoard = focus.picked ? [bestKey] : parsed.filter(p => p && p.dest).map(p => p.orig + p.dest);
    // Every move of the line, whether or not it needs an arrow of its own:
    // all of them are numbered, and `host` says which arrow already on the
    // board a move that does not need one belongs to.
    const place = m => ({ ...m, at: arrowEndpoints(m.orig, m.dest, ref.cal), host: m.drawn ? hostArrow(parsed, m.key) : -1 });
    const moves = continuationMoves(bestLineMoves(bestKey, focus.row), settings.lineDepth, onBoard)
      .map(place)
      .filter(m => m.at);
    // The line's first move, lichess's own arrow when there is one.
    const first = place({ orig: bestKey.slice(0, 2), dest: bestKey.slice(2, 4), key: bestKey, ply: 0, drawn: focus.idx >= 0 });
    if (!first.drawn && !first.at) {
      clearExtras(svg);
      return none;
    }
    const mine = [first, ...moves].filter(m => !m.drawn);

    const stamp = [
      focus.color, focus.picked ? 'p' : '', focus.idx, settings.opacity, settings.lineDepth, settings.lineOpacity, settings.uniformWidth, settings.width,
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
    // Each arrow is matched back to its move by the key it carries, not by
    // where it sits: sorted longest first, the arrows no longer stand in the
    // order the line plays them, and pairing them up by position handed each
    // one another's length, so every pass sorted them into a new order and
    // the next pass sorted them back.
    const existing = Array.from(parent.querySelectorAll(`:scope > g[${EXTRA}]`));
    const kept = mine.map(m => existing.find(g => g.getAttribute(EXTRA) === m.key));
    if (svg.getAttribute(LINE_STAMP) === stamp && existing.length === mine.length && kept.every(Boolean)) {
      return withLabels(kept, Array.from(parent.querySelectorAll(`:scope > g[${LABEL}]`)));
    }

    clearExtras(svg);
    svg.setAttribute(LINE_STAMP, stamp);
    // As wide as any other arrow, outline and all: where the head ends, how
    // long a stripe runs and how big the arrowhead comes out all follow from
    // it. The stripes and the darker shade are what mark these as ours, so
    // there is nothing for a thinner line to say that they do not.
    const width = drawnWidth(ref.line) || parseStrokeWidth(ref.line.getAttribute('stroke-width')) || DEFAULTS.width;
    const marker = ensureMarker(svg, boardIdx, color, stripedHead(boardIdx));
    const made = mine.map(m => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute(EXTRA, m.key);
      parent.appendChild(g);

      // The first move of a picked line, which lichess drew no arrow for:
      // the arrow it would have drawn, solid, in the line's own bright colour
      // and at a regular arrow's strength, since it is the move to play.
      if (m.ply === 0) {
        g.setAttribute('opacity', String(settings.opacity));
        const line = newLine(ref.line, m.at, focus.color, width);
        line.setAttribute('marker-end', `url(#${ensureMarker(svg, boardIdx, focus.color)})`);
        g.appendChild(line);
        if (settings.border) addBorder(svg, boardIdx, line);
        return g;
      }

      // Faded by the group, as with lichess's arrows, so the outline does not
      // show through the shaft.
      g.setAttribute('opacity', String(settings.opacity * settings.lineOpacity));

      // Striped, so an arrow the extension drew is never mistaken for one
      // lichess drew. The arrow is split where the arrowhead's back edge
      // falls: the shaft takes the stripes and the shear, the other piece
      // takes the head, whose stripes carry on the shaft's rhythm. Both are
      // cut square at the ends, so the shear leaves a clean diagonal and no
      // cap rounds out past the head. The outlines are cloned off the two,
      // stripes, shear and all.
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
      if (settings.border) lines.forEach(([line, withHead]) => addBorder(svg, boardIdx, line, withHead, true));
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
    for (const m of moves.length ? [first, ...moves] : []) {
      const back = stepBack(m.key);
      // The line's own colour throughout: bright for the move to play, darker
      // for what follows. A numeral riding on another line's arrow keeps the
      // darker shade rather than taking that arrow's, which would read as a
      // remark on how good the move is instead of where it falls in the line.
      const label = m.host >= 0
        ? labelOnArrow(groups[m.host], m.ply, m.ply ? color : focus.color, back)
        : makeLabel(shaftOf(m.at, width), m.ply, m.ply ? color : focus.color, width, back);
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
    // That means the order they stand in on the page, not the order `groups`
    // lists them in: our own arrows come after lichess's there, but sort in
    // among them, and checking against the list moved every group on every
    // pass.
    const members = new Set(groups);
    const current = Array.from(parent.children).filter(el => members.has(el));
    if (sorted.every((g, i) => g === current[i])) return;
    sorted.forEach(g => parent.appendChild(g));
  }

  // ---- a line picked from the keyboard ----------------------------------

  const PICKED = 'data-lac-picked';

  /**
   * Whether the picked line still stands: the position it was picked in is
   * still the one on the panel, and its row still shows a line. Otherwise it
   * is let go, which is how playing the move, or stepping through the game,
   * puts the board back to all its arrows.
   */
  function checkPicked() {
    if (!picked) return;
    const row = pvRows()[picked.index];
    if (!settings.enabled || !settings.shortcuts || picked.fen !== panelFen() || !row || !rowMove(row)) picked = null;
  }

  /** Mark the picked row in the panel; src/content.css styles it as lichess styles the row under the pointer. */
  function markRows() {
    pvRows().forEach((row, i) => {
      if (picked && i === picked.index) row.setAttribute(PICKED, '');
      else row.removeAttribute(PICKED);
    });
  }

  /**
   * Take an engine arrow off the board, or put it back. Pointing at a line
   * has lichess draw that line alone; picking one from the keyboard hides the
   * others instead, since lichess only listens to the pointer. chessground
   * never sets this attribute, so removing it is the whole restore.
   */
  function setHidden(group, hidden) {
    if (hidden) group.setAttribute('visibility', 'hidden');
    else group.removeAttribute('visibility');
  }

  function apply() {
    checkPicked();
    markRows();
    boardSvgs().forEach((svg, boardIdx) => {
      const groups = Array.from(svg.querySelectorAll(':scope > g > g[cgHash]'));
      const parsed = groups.map(g => parseCgHash(g.getAttribute('cgHash')));
      // A picked move lichess drew no arrow for is scored as one more arrow,
      // after the real ones, so its colour is the one the panel's numbers
      // give it; colors[parsed.length] is then that colour and nothing else.
      const ghost = settings.enabled ? pickedArrow(parsed) : null;
      const colors = settings.enabled ? colorsFor(ghost ? parsed.concat([ghost]) : parsed) : groups.map(() => null);
      const focus = settings.enabled ? focusFor(parsed, colors) : null;
      if (settings.enabled) {
        const extra = syncExtras(svg, boardIdx, groups, parsed, colors, focus);
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
        // With a line picked, every other engine arrow leaves the board.
        const hidden = !!(focus && focus.picked && i !== focus.idx);
        const stamp = [color, hidden, settings.opacity, settings.uniformWidth, settings.width, settings.border, settings.borderColor, settings.borderWidth].join(':');
        if (g.getAttribute('data-lac') === stamp) return;
        g.setAttribute('data-lac', stamp);
        clearBorders(g);
        setGroupOpacity(g);
        g.querySelectorAll('g').forEach(inner => setGroupOpacity(inner, 1));
        setHidden(g, hidden);
        const marker = ensureMarker(svg, boardIdx, color);
        ownLines(g).forEach(line => {
          paint(line, color, marker);
          if (settings.border) addBorder(svg, boardIdx, line);
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

  // ---- keyboard --------------------------------------------------------

  const typing = el => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ''));

  function pick(index) {
    picked = index === null ? null : { index, fen: panelFen() };
    schedule();
  }

  /**
   * Play the picked line's first move. The row is given the pointerdown a
   * click on it would raise, and lichess's own handler for that plays the
   * move, exactly as clicking the line does; the position moves on and the
   * pick lets go with it.
   */
  function playPicked() {
    const row = pvRows()[picked.index];
    pick(null);
    if (!row) return;
    row.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0,
    }));
  }

  /**
   * Digits pick a line, Space plays it, Escape lets it go. Heard on the way
   * down, before lichess's own shortcuts, so that Space reaches lichess only
   * while no line is picked and goes on playing the best move then. Keys
   * typed into a field, or with a modifier held, are not touched.
   */
  function onKeyDown(e) {
    if (!settings.enabled || !settings.shortcuts) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing || e.repeat) return;
    if (typing(document.activeElement)) return;
    checkPicked();
    const rows = pvRows();
    // The digit row by its physical key, so a layout that puts the digits
    // behind Shift still has them; the numeric keypad by what it types, since
    // with Num Lock off its keys are Home, End and the arrows.
    const digit = /^Digit([1-9])$/.exec(e.code || '');
    const action = shortcutFor(digit ? digit[1] : e.key, rows.length, picked ? picked.index : null);
    if (!action) return;
    // A row with no line in it yet is nothing to pick.
    if (action.type === 'pick' && !rowMove(rows[action.index])) return;
    if (!action.passive) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (action.type === 'pick') pick(action.index);
    else if (action.type === 'play') playPicked();
    else pick(null);
  }

  /** The pointer wins: moving it onto the panel hands the board back to lichess's own hover. */
  function onMouseOver(e) {
    if (picked && e.target instanceof Element && e.target.closest('.pv_box .pv')) pick(null);
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
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mouseover', onMouseOver, true);
    apply();
    // The pass runs in the observer's own callback, not on the next animation
    // frame. chessground redraws inside an animation frame of its own, so a
    // pass put off to the next one came a frame late, and that frame went to
    // the screen with lichess's pale arrows and none of ours. The callback
    // runs before the browser paints. What the pass changes itself is taken
    // off the observer's queue afterwards, so a pass never sets off another:
    // run straight away, one that did would lock up the page rather than
    // cost a frame.
    const observer = new MutationObserver(() => {
      try {
        apply();
      } finally {
        observer.takeRecords();
      }
    });
    observer.observe(document.documentElement, {
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
