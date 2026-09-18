// Pure logic shared by the content script and the Node test suite.
// No DOM access here.

(function (root) {
  'use strict';

  const SQUARE = /^[a-h][1-8]$/;
  const BEST_BRUSH = 'paleBlue';
  const ALT_BRUSH = 'paleGrey';

  // Loss in winning chances (0..1) at which an arrow is fully red. Lichess
  // stops drawing alternative arrows beyond this loss.
  const MAX_SHIFT = 0.2;

  const DEFAULTS = Object.freeze({
    enabled: true,
    // 'eval': green→red by loss vs the best line. 'rank': fixed palette by PV rank.
    mode: 'eval',
    // Rank 1 (best) → rank 5 and beyond (rank mode only).
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
      const hasDest = SQUARE.test(t[i + 1] || '');
      const brushIdx = hasDest ? i + 2 : i + 1;
      // The lineWidth modifier (an integer) follows the brush when present.
      const lw = t.slice(brushIdx + 1).find(x => /^\d+$/.test(x));
      return {
        orig: t[i],
        dest: hasDest ? t[i + 1] : null,
        brush: t[brushIdx] || null,
        lineWidth: lw === undefined ? null : Number(lw),
      };
    }
    return null;
  }

  /** "+0.2" → {cp: 20}, "#-3" → {mate: -3}, anything else → null. */
  function parseEvalText(text) {
    if (typeof text !== 'string') return null;
    const s = text.trim();
    let m = /^#(-?\d+)$/.exec(s);
    if (m) return { mate: Number(m[1]) };
    m = /^([+-]?\d+(?:\.\d+)?)$/.exec(s);
    if (m) return { cp: Math.round(parseFloat(m[1]) * 100) };
    return null;
  }

  // Same curve lichess uses (lib/ceval/winningChances), white POV, -1..1.
  // Note: only the cp path clamps to +-1000; mate scores must stay unclamped
  // or every mate would collapse to the same value.
  function rawWinningChances(cp) {
    return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
  }

  function winningChances(ev) {
    if (!ev) return null;
    if (typeof ev.mate === 'number') {
      const cp = (21 - Math.min(10, Math.abs(ev.mate))) * 100;
      return rawWinningChances(ev.mate > 0 ? cp : -cp);
    }
    if (typeof ev.cp === 'number') return rawWinningChances(Math.min(Math.max(-1000, ev.cp), 1000));
    return null;
  }

  function povChances(color, ev) {
    const w = winningChances(ev);
    return w === null ? null : color === 'white' ? w : -w;
  }

  /** Lichess draws alternatives with lineWidth = round(12 - shift * 50). */
  function shiftFromLineWidth(lw) {
    return (12 - lw) / 50;
  }

  /**
   * For each arrow, how much winning chance the line loses versus the best
   * line (0 = as good as best), or null to leave the arrow alone.
   * pvs: [{ key: 'e2e4', eval: {cp}|{mate}|null }] in rank order.
   */
  function scoreArrows(arrows, pvs, color) {
    const best = pvs[0] && pvs[0].eval ? povChances(color, pvs[0].eval) : null;
    return arrows.map(a => {
      if (!a || !a.dest) return null;
      if (a.brush !== BEST_BRUSH && a.brush !== ALT_BRUSH) return null;
      const pv = pvs.find(p => p.key === a.orig + a.dest);
      // Halved to match lichess's povDiff, the same scale its lineWidth uses.
      if (pv && pv.eval && best !== null) return Math.max(0, (best - povChances(color, pv.eval)) / 2);
      if (a.brush === BEST_BRUSH) return 0;
      if (a.lineWidth !== null && a.lineWidth !== undefined) return shiftFromLineWidth(a.lineWidth);
      return null;
    });
  }

  /** 0 → green, MAX_SHIFT and beyond → red, via yellow. */
  function colorForShift(shift) {
    if (shift === null || shift === undefined) return null;
    const t = Math.min(1, Math.max(0, shift / MAX_SHIFT));
    return `hsl(${Math.round(120 * (1 - t))}, 75%, 42%)`;
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

  const api = {
    parseCgHash, pvKeys, rankArrows, colorForRank,
    parseEvalText, winningChances, povChances, scoreArrows, colorForShift, shiftFromLineWidth,
    DEFAULTS, MAX_SHIFT, BEST_BRUSH, ALT_BRUSH,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
