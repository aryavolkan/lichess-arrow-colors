// Content script: recolours lichess engine arrows by multi-PV rank.
// Relies on src/logic.js (loaded first) exposing globalThis.LAC.
(() => {
  'use strict';
  const { parseCgHash, pvKeys, rankArrows, colorForRank, parseEvalText, scoreArrows, colorForShift, spanOf, DEFAULTS } =
    globalThis.LAC;
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

  /** One arrowhead marker per colour, created on demand. Returns its id. */
  function ensureMarker(svg, boardIdx, color) {
    const id = `lac-${boardIdx}-${color.replace(/[^a-z0-9]/gi, '')}`;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    if (!defs.querySelector(`marker[id="${id}"]`)) {
      // Same geometry chessground uses, so heads line up with the shaft.
      const marker = document.createElementNS(SVG_NS, 'marker');
      for (const [k, v] of Object.entries({ id, cgKey: id, orient: 'auto', overflow: 'visible', markerWidth: 4, markerHeight: 4, refX: 2.05, refY: 2 })) {
        marker.setAttribute(k, v);
      }
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M0,0 V4 L3,2 Z');
      path.setAttribute('fill', color);
      marker.appendChild(path);
      defs.appendChild(marker);
    }
    return id;
  }

  // ---- recolouring -----------------------------------------------------

  const ORIG_ATTRS = ['stroke', 'marker-end', 'opacity'];

  function paint(line, color, markerRef) {
    if (!line.hasAttribute('data-lac-orig')) {
      line.setAttribute('data-lac-orig', JSON.stringify(ORIG_ATTRS.map(a => line.getAttribute(a))));
    }
    line.setAttribute('stroke', color);
    line.setAttribute('marker-end', `url(#${markerRef})`);
    line.setAttribute('opacity', String(settings.opacity));
  }

  function restore(group) {
    group.removeAttribute('data-lac');
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
        const stamp = `${color}:${settings.opacity}`;
        if (g.getAttribute('data-lac') === stamp) return;
        g.setAttribute('data-lac', stamp);
        const marker = ensureMarker(svg, boardIdx, color);
        g.querySelectorAll('line').forEach(line => paint(line, color, marker));
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

  globalThis.__lacApply = apply; // handy for manual testing in devtools
})();
