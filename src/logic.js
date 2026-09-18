// Pure logic shared by the content script and the Node test suite.
// No DOM access here.

(function (root) {
  'use strict';

  const SQUARE = /^[a-h][1-8]$/;
  const BEST_BRUSH = 'paleBlue';
  const ALT_BRUSH = 'paleGrey';

  const DEFAULTS = Object.freeze({
    enabled: true,
    // Rank 1 (best) → rank 5 and beyond.
    colors: ['#22c55e', '#eab308', '#f97316', '#ef4444', '#9ca3af'],
    opacity: 0.65,
  });

  /**
   * chessground stores a comma-joined hash on every shape <g>, e.g.
   * "512,512,true,1,e2,e4,paleBlue,12". Falsy fields are dropped, so
   * positions vary; orig/dest/brush are always adjacent though.
   */
  function parseCgHash(hash) {
    if (typeof hash !== 'string') return null;
    const t = hash.split(',');
    for (let i = 0; i < t.length; i++) {
      if (!SQUARE.test(t[i])) continue;
      if (SQUARE.test(t[i + 1] || '')) {
        return { orig: t[i], dest: t[i + 1], brush: t[i + 2] || null };
      }
      return { orig: t[i], dest: null, brush: t[i + 1] || null };
    }
    return null;
  }

  /**
   * Turn the raw first-move strings from the PV box into "e2e4"-style keys
   * in rank order. Accepts plain UCI ("e7e8q") or "fen|uci" data-board
   * values. Drops (crazyhouse) and junk are skipped.
   */
  function pvKeys(raw) {
    const keys = [];
    for (const item of raw || []) {
      if (typeof item !== 'string' || !item) continue;
      const uci = item.includes('|') ? item.slice(item.lastIndexOf('|') + 1) : item;
      const from = uci.slice(0, 2), to = uci.slice(2, 4);
      if (SQUARE.test(from) && SQUARE.test(to)) keys.push(from + to);
    }
    return keys;
  }

  /**
   * For each parsed arrow, return its 0-based PV rank, or -1 to leave it
   * untouched. Best-line arrows (paleBlue) default to rank 0 even when
   * unmatched so maneuver continuation arrows share the best colour.
   */
  function rankArrows(arrows, keys) {
    return arrows.map(a => {
      if (!a || !a.dest) return -1;
      const idx = keys.indexOf(a.orig + a.dest);
      if (a.brush === BEST_BRUSH) return idx >= 0 ? idx : 0;
      if (a.brush === ALT_BRUSH) return idx;
      return -1;
    });
  }

  function colorForRank(rank, palette) {
    if (rank < 0 || !palette || !palette.length) return null;
    return palette[Math.min(rank, palette.length - 1)];
  }

  const api = { parseCgHash, pvKeys, rankArrows, colorForRank, DEFAULTS, BEST_BRUSH, ALT_BRUSH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
