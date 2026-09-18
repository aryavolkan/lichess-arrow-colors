// Pure logic shared by the content script and the Node test suite.
// No DOM access here.

(function (root) {
  'use strict';

  const SQUARE = /^[a-h][1-8]$/;
  const BEST_BRUSH = 'paleBlue';
  const ALT_BRUSH = 'paleGrey';

  // chessground works in board units where one square is 1, and builds its
  // widths as lineWidth / 64. Its full-strength arrow is 15; thinner arrows
  // come from a per-line modifier, which is what we flatten.
  const CG_WIDTH_UNIT = 1 / 64;

  // Loss in winning chances (0..1) at which an arrow is fully red on the
  // absolute scale. Lichess stops drawing alternative arrows beyond this loss.
  const MAX_SHIFT = 0.2;

  // Smallest span the normalised gradient will stretch over, so a position
  // where every move is equal does not get blown up into a full green-to-red
  // spread over differences that do not matter.
  const MIN_SPAN = 0.05;

  const DEFAULTS = Object.freeze({
    enabled: true,
    // 'eval': green→red by loss vs the best line. 'rank': fixed palette by PV rank.
    mode: 'eval',
    // Stretch the eval gradient across the losses present in this position
    // instead of the fixed 0..MAX_SHIFT scale.
    normalize: true,
    // Outline drawn under each arrow. borderWidth is per side, in board units
    // where one square is 1 (chessground's own stroke-width unit).
    // Give every engine arrow the same width. Colour already says how good a
    // move is, so lichess's thinning of weaker lines only adds noise.
    uniformWidth: true,
    // Thinner than lichess's full-strength arrow, which is 15 units.
    width: 9 * CG_WIDTH_UNIT,
    border: true,
    borderColor: '#000000',
    borderWidth: 0.03,
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

  /**
   * The denominator for the normalised gradient: the worst loss on the board,
   * floored at MIN_SPAN. Nulls (arrows we leave alone) are ignored.
   */
  function spanOf(shifts) {
    let max = 0;
    for (const s of shifts || []) if (typeof s === 'number' && s > max) max = s;
    return Math.max(max, MIN_SPAN);
  }

  /** 0 → green, `span` and beyond → red, via yellow. */
  function colorForShift(shift, span) {
    if (shift === null || shift === undefined) return null;
    const denom = span || MAX_SHIFT;
    const t = Math.min(1, Math.max(0, shift / denom));
    return `hsl(${Math.round(120 * (1 - t))}, 75%, 42%)`;
  }

  /** chessground writes stroke-width as a plain number in board units. */
  function parseStrokeWidth(value) {
    const w = parseFloat(value);
    return Number.isFinite(w) && w > 0 ? w : null;
  }

  /**
   * Width of the outline drawn beneath an arrow: the arrow's own width plus
   * the border on each side. Null when there is nothing to outline.
   */
  function borderStrokeWidth(arrowWidth, borderWidth) {
    if (!arrowWidth || arrowWidth <= 0) return null;
    if (!borderWidth || borderWidth <= 0) return null;
    return arrowWidth + 2 * borderWidth;
  }

  // chessground's arrowhead, in marker units: the triangle (0,0) (0,4) (3,2),
  // anchored at (refX, refY) and multiplied by the line's stroke width.
  const CG_HEAD = Object.freeze({ tipX: 3, refX: 2.05, refY: 2 });

  /** The width to draw an arrow at: one size for all, or lichess's own. */
  function arrowStrokeWidth(currentWidth, uniform, width) {
    if (!uniform) return currentWidth;
    return width > 0 ? width : DEFAULTS.width;
  }

  /**
   * Geometry for the outline's arrowhead.
   *
   * The outline has to sit a constant border width outside the arrow. Simply
   * letting the wider outline stroke scale the head up does not do that: it
   * inflates the triangle about its anchor, so the head's sides and back come
   * out several times thicker than the shaft's edge. Instead the outline draws
   * the *same* triangle and strokes it, half the stroke falling outside the
   * edge, with round joins so even the sharp tip is offset by exactly one
   * border width.
   *
   * Marker geometry is multiplied by the line's stroke width, and the outline
   * line is wider than the arrow, so the triangle is pre-divided by that ratio.
   */
  function borderMarker(arrowWidth, borderWidth) {
    const wide = borderStrokeWidth(arrowWidth, borderWidth);
    if (!wide) return null;
    const scale = arrowWidth / wide;
    return {
      scale,
      path: `M0,0 V${4 * scale} L${3 * scale},${2 * scale} Z`,
      refX: CG_HEAD.refX * scale,
      refY: CG_HEAD.refY * scale,
      strokeWidth: (2 * borderWidth) / wide,
      strokeLinejoin: 'round',
    };
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
    parseEvalText, winningChances, povChances, scoreArrows, colorForShift, shiftFromLineWidth, spanOf,
    parseStrokeWidth, borderStrokeWidth, borderMarker, CG_HEAD, arrowStrokeWidth, CG_WIDTH_UNIT,
    DEFAULTS, MAX_SHIFT, MIN_SPAN, BEST_BRUSH, ALT_BRUSH,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
