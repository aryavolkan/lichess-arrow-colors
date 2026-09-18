// Content script: recolours lichess engine arrows by multi-PV rank.
// Relies on src/logic.js (loaded first) exposing globalThis.LAC.
(() => {
  'use strict';
  const { parseCgHash, pvKeys, rankArrows, colorForRank, parseEvalText, scoreArrows, colorForShift, spanOf,
    parseStrokeWidth, borderStrokeWidth, borderMarker, DEFAULTS } = globalThis.LAC;
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

  const ORIG_ATTRS = ['stroke', 'marker-end', 'opacity'];

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
   * Draw the outline as a wider copy of the arrow sitting beneath it. Because
   * markers scale with stroke-width, the wider line also gets a wider
   * arrowhead, so the head is outlined along with the shaft.
   */
  function addBorder(svg, boardIdx, group, line) {
    const arrowWidth = parseStrokeWidth(line.getAttribute('stroke-width'));
    const width = borderStrokeWidth(arrowWidth, settings.borderWidth);
    if (!width) return;
    const border = line.cloneNode(false);
    border.removeAttribute('data-lac-orig');
    border.setAttribute('data-lac-border', '');
    border.setAttribute('stroke', settings.borderColor);
    border.setAttribute('stroke-width', String(width));
    border.setAttribute('opacity', '1');
    const head = borderMarker(arrowWidth, settings.borderWidth);
    border.setAttribute('marker-end', `url(#${ensureMarker(svg, boardIdx, settings.borderColor, head)})`);
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

  /** Colour per arrow group, or null to leave it alone. */
  function colorsFor(parsed) {
    if (settings.mode === 'rank') {
      return rankArrows(parsed, readPvKeys()).map(rank => colorForRank(rank, settings.colors));
    }
    const shifts = scoreArrows(parsed, readPvs(), turnColor());
    const span = settings.normalize ? spanOf(shifts) : undefined;
    return shifts.map(s => colorForShift(s, span));
  }

  function apply() {
    boardSvgs().forEach((svg, boardIdx) => {
      const groups = Array.from(svg.querySelectorAll(':scope > g > g[cgHash]'));
      const colors = settings.enabled
        ? colorsFor(groups.map(g => parseCgHash(g.getAttribute('cgHash'))))
        : groups.map(() => null);
      groups.forEach((g, i) => {
        const color = colors[i];
        if (!color) {
          if (g.hasAttribute('data-lac')) restore(g);
          return;
        }
        const stamp = [color, settings.opacity, settings.border, settings.borderColor, settings.borderWidth].join(':');
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
