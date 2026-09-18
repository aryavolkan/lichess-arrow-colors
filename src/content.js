// Content script: recolours lichess engine arrows by multi-PV rank.
// Relies on src/logic.js (loaded first) exposing globalThis.LAC.
(() => {
  'use strict';
  const { parseCgHash, pvKeys, rankArrows, colorForRank, DEFAULTS } = globalThis.LAC;
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  let settings = { ...DEFAULTS };
  let scheduled = false;

  // ---- reading lichess state -------------------------------------------

  function readPvKeys() {
    const rows = document.querySelectorAll('.pv_box .pv');
    return pvKeys(
      Array.from(rows, row => row.getAttribute('data-uci') || row.querySelector('.pv-san')?.getAttribute('data-board') || ''),
    );
  }

  function boardSvgs() {
    const main = document.querySelectorAll('.main-board svg.cg-shapes');
    return main.length ? main : document.querySelectorAll('svg.cg-shapes');
  }

  // ---- svg markers (arrowheads) ----------------------------------------

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const markerId = (boardIdx, rank) => `lac-${boardIdx}-${Math.min(rank, settings.colors.length - 1)}`;

  function ensureMarkers(svg, boardIdx) {
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    settings.colors.forEach((color, rank) => {
      const id = markerId(boardIdx, rank);
      let marker = defs.querySelector(`marker[id="${id}"]`);
      if (!marker) {
        // Same geometry chessground uses, so heads line up with the shaft.
        marker = document.createElementNS(SVG_NS, 'marker');
        for (const [k, v] of Object.entries({ id, cgKey: id, orient: 'auto', overflow: 'visible', markerWidth: 4, markerHeight: 4, refX: 2.05, refY: 2 })) {
          marker.setAttribute(k, v);
        }
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M0,0 V4 L3,2 Z');
        marker.appendChild(path);
        defs.appendChild(marker);
      }
      marker.firstChild.setAttribute('fill', color);
    });
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

  function apply() {
    const keys = settings.enabled ? readPvKeys() : [];
    boardSvgs().forEach((svg, boardIdx) => {
      if (settings.enabled) ensureMarkers(svg, boardIdx);
      const groups = Array.from(svg.querySelectorAll(':scope > g > g[cgHash]'));
      const ranks = settings.enabled
        ? rankArrows(groups.map(g => parseCgHash(g.getAttribute('cgHash'))), keys)
        : groups.map(() => -1);
      groups.forEach((g, i) => {
        const color = colorForRank(ranks[i], settings.colors);
        if (!color) {
          if (g.hasAttribute('data-lac')) restore(g);
          return;
        }
        const stamp = `${ranks[i]}:${color}:${settings.opacity}`;
        if (g.getAttribute('data-lac') === stamp) return;
        g.setAttribute('data-lac', stamp);
        g.querySelectorAll('line').forEach(line => paint(line, color, markerId(boardIdx, ranks[i])));
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
