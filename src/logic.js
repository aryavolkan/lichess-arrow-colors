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

  // The numeral each added arrow carries, as a disc beside the shaft behind
  // the arrowhead. Radius and type size are in board units, where a square
  // is 1.
  const LABEL_RADIUS = 0.13;
  const LABEL_FONT = 0.19;

  // How far back along the shaft the next numeral sits when a move is drawn
  // once but numbered twice, as a line that repeats a move is. A diameter and
  // a little, so the two read as two discs rather than one blob.
  const LABEL_STEP = 2.4 * LABEL_RADIUS;

  // Half a square: chessground's board units put the centre of the board at
  // (0, 0), so a1's centre is 3.5 squares out along both axes.
  const HALF_BOARD = 3.5;

  const DEFAULTS = Object.freeze({
    enabled: true,
    // 'eval': green→red by loss vs the best line. 'rank': fixed palette by PV rank.
    mode: 'eval',
    // Stretch the eval gradient across the losses present in this position
    // instead of the fixed 0..MAX_SHIFT scale.
    normalize: true,
    // How many moves of the best line to draw past the one lichess draws
    // itself, which numbers them 2 to 5. 0 leaves the board as lichess has it.
    lineDepth: 4,
    // What an added arrow's opacity is, as a fraction of a regular arrow's.
    // Width is not scaled with it: an added arrow is as wide as any other, and
    // its stripes and its darker shade already say that the extension drew it.
    // Below 1 it keeps the move you actually have to play the strongest thing
    // on the board; at 1 the whole line is drawn as solidly as lichess's own.
    lineOpacity: 0.8,
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
    // Keys 1 to 9 put an engine line on the board on its own, as pointing at
    // it does; Space plays the line's first move while one is picked.
    shortcuts: true,
    // Where the move tree branches and the engine prefers another move, draw
    // the move that was played as a solid white or black arrow.
    playedMove: true,
    // Draw every arrow behind the pieces rather than over them. The numbers
    // on the best line stay over the pieces, where they can be read.
    underPieces: true,
    // After a move from one of the engine's lines, keep the depth readout at
    // how deep that line was searched until the new search gets there,
    // rather than starting again from zero.
    keepDepth: true,
  });

  // How many positions a carried depth is kept for. Every engine update files
  // one per move of each line it shows, so this is a few hundred positions'
  // worth of lines; the ones filed longest ago go first.
  const DEPTH_MEMO = 5000;

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

  /** How far an arrow travels, in squares squared. Circles count as 0. */
  function arrowLength(a) {
    if (!a || !a.dest || !SQUARE.test(a.orig) || !SQUARE.test(a.dest)) return 0;
    const dx = a.dest.charCodeAt(0) - a.orig.charCodeAt(0);
    const dy = a.dest.charCodeAt(1) - a.orig.charCodeAt(1);
    return dx * dx + dy * dy;
  }

  /**
   * The order to paint arrows in: longest first, so a short arrow is never
   * buried under a long one crossing it. Ties keep lichess's own order, and
   * circles (length 0) end up on top of every arrow.
   * Returns indices into `arrows`.
   */
  function drawOrder(arrows) {
    return (arrows || [])
      .map((a, i) => i)
      .sort((i, j) => arrowLength(arrows[j]) - arrowLength(arrows[i]));
  }

  /**
   * Which engine line the board is pointing at: the row whose first move
   * lichess is drawing as the best arrow.
   *
   * Pointing at a line in the engine panel makes lichess clear every other
   * arrow and draw that line's first move, and only it, with the best brush.
   * So the arrow on the board already says which line to follow, and reading
   * it beats watching for the pointer: there is no hover state to keep, it
   * rights itself when the pointer leaves, and it goes on working whatever
   * else makes lichess single a line out.
   *
   * Falls back to the best line when no row owns the arrow, which covers a
   * board with no engine arrow yet and a row whose move cannot be read.
   */
  function lineForArrow(keys, key) {
    const i = key === undefined || key === null ? -1 : (keys || []).indexOf(key);
    return i < 0 ? 0 : i;
  }

  /**
   * The best line past the move lichess draws itself, from its second move
   * on: `raw` is the line's moves in order, as plain UCI or lichess's own
   * "fen|uci" data-board values, starting with the move lichess already has
   * an arrow for.
   *
   * A move whose arrow is on the board already comes back marked `drawn`
   * rather than being dropped: either another line starts with that move, or
   * the line plays it twice. It is still the line's nth move and still has to
   * carry that number, so that the numbers run 1, 2, 3 without a hole in
   * them; all it does not want is a second arrow laid over the one there.
   *
   * A move we cannot read ends the line rather than being stepped over, since
   * everything after it would be numbered at the wrong depth.
   */
  function continuationMoves(raw, depth, taken) {
    const out = [];
    if (!Array.isArray(raw) || !(depth > 0)) return out;
    const seen = new Set(taken || []);
    for (let ply = 1; ply < raw.length && ply <= depth; ply++) {
      const key = pvKeys([raw[ply]])[0];
      if (!key) break;
      const drawn = seen.has(key);
      seen.add(key);
      out.push({ orig: key.slice(0, 2), dest: key.slice(2, 4), key, ply, drawn });
    }
    return out;
  }

  /**
   * The centre of a square in chessground's board units, where a square is 1
   * and the centre of the board is (0, 0). y grows downwards, as in any SVG,
   * so rank 8 is negative. A flipped board is the same map negated.
   */
  function squarePoint(square, flipped) {
    if (!SQUARE.test(square || '')) return null;
    const file = square.charCodeAt(0) - 97;
    const rank = square.charCodeAt(1) - 49;
    const x = file - HALF_BOARD;
    const y = HALF_BOARD - rank;
    return flipped ? { x: -x, y: -y } : { x, y };
  }

  // Board units of slack when matching an arrow's start against a square
  // centre. The two orientations put it 1 to 7 squares apart, so this only
  // has to absorb rounding.
  const CALIBRATE_TOL = 0.01;

  /**
   * Work out how to place an arrow from one lichess has already drawn:
   * which way round the board is, and how far short of the destination
   * chessground stops the line to leave room for the arrowhead.
   *
   * Reading both off a real arrow means the arrows we add line up with
   * lichess's own even if chessground changes its geometry.
   */
  function calibrate(ref) {
    if (!ref || !ref.dest) return null;
    for (const flipped of [false, true]) {
      const from = squarePoint(ref.orig, flipped);
      const to = squarePoint(ref.dest, flipped);
      if (!from || !to) return null;
      if (Math.abs(from.x - ref.x1) > CALIBRATE_TOL || Math.abs(from.y - ref.y1) > CALIBRATE_TOL) continue;
      const full = Math.hypot(to.x - from.x, to.y - from.y);
      const drawn = Math.hypot(ref.x2 - ref.x1, ref.y2 - ref.y1);
      // Rounded off: the difference is a fixed fraction of a square, and the
      // coordinates it comes from carry float noise.
      const margin = Math.max(0, Math.round((full - drawn) * 1e6) / 1e6);
      return { flipped, margin };
    }
    return null;
  }

  /**
   * Where to draw an arrow between two squares, shortened at the destination
   * by the arrowhead margin. Null when the arrow would be no longer than its
   * own head.
   */
  function arrowEndpoints(orig, dest, cal) {
    if (!cal) return null;
    const from = squarePoint(orig, cal.flipped);
    const to = squarePoint(dest, cal.flipped);
    if (!from || !to) return null;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (!(len > cal.margin)) return null;
    return {
      x1: from.x,
      y1: from.y,
      x2: to.x - (dx / len) * cal.margin,
      y2: to.y - (dy / len) * cal.margin,
    };
  }

  // A stripe is this many times as long as the gap that follows it.
  const STRIPE_RATIO = 2;

  // Gap length as a fraction of the arrow's width, before the stripes are
  // stretched to fit the shaft. Fine stripes: several to a one-square arrow.
  const STRIPE_UNIT = 0.5;

  // How much of its lightness a continuation arrow keeps against the move
  // lichess draws itself. Dark enough to tell the two apart at a glance,
  // not so dark that it stops reading as the same green.
  const DARKEN = 0.6;

  // How far the stripes lean off square, in degrees. A shear this size cuts
  // plainly on the diagonal while still crossing the shaft rather than
  // running away down it.
  const STRIPE_ANGLE = 25;


  /**
   * Stripes for one shaft: as many whole stripes as fit at about one stripe
   * per arrow width, stretched so that n stripes and the n-1 gaps between
   * them span the shaft exactly. Fitting them to the shaft rather than
   * repeating a fixed dash is what keeps a stripe from being cut off partway
   * at the arrowhead, which reads as an arrow that failed to draw.
   */
  function stripePattern(width, length) {
    if (!(width > 0) || !(length > 0)) return null;
    const unit = STRIPE_UNIT * width;
    const n = Math.max(1, Math.round((length + unit) / ((STRIPE_RATIO + 1) * unit)));
    const gap = length / ((STRIPE_RATIO + 1) * n - 1);
    return [STRIPE_RATIO * gap, gap];
  }

  /**
   * A transform that leans an arrow's stripes over.
   *
   * Dashes always cut square across a line, so the cut is sheared instead:
   * a shear along the arrow's own axis slides each point sideways in
   * proportion to how far off the axis it lies. Points on the axis do not
   * move and neither does the distance off it, so the arrow keeps its place,
   * its length and its width, and only the ends of each stripe lean over.
   *
   * Written out as a matrix rather than a rotate/skew/rotate list, because
   * SVG's skewX shears about the origin: composed with rotations about the
   * arrow's start, it would still shear about a point the arrow's own
   * distance from the origin and slide the whole shaft along itself.
   */
  function stripeTransform(x1, y1, x2, y2, angle) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (!len) return null;
    const c = dx / len, s = dy / len;
    const k = Math.tan((angle * Math.PI) / 180);
    // Shear about the arrow's own direction, with the start point fixed.
    const a = 1 - k * c * s, b = -k * s * s;
    const cc = k * c * c, d = 1 + k * c * s;
    const e = x1 - (a * x1 + cc * y1);
    const f = y1 - (b * x1 + d * y1);
    // Unrounded: rounding the matrix would nudge the arrow off its own
    // squares by a fraction of the rounding, for nothing saved.
    return `matrix(${[a, b, cc, d, e, f].join(' ')})`;
  }

  // The arrowhead is striped on the same rhythm the shaft works out at, which
  // is 1.5 stroke widths to a stripe and its gap. Marker geometry is already
  // in stroke widths, so these are constants rather than a calculation.
  const HEAD_STRIPE_ON = 1;
  const HEAD_STRIPE_GAP = 0.5;

  // The head itself spans 0 to 4 across. The bands run past it on both sides,
  // to be clipped to its outline when drawn.
  const HEAD_BACK = -0.5;
  const HEAD_FRONT = 4.5;

  /**
   * The stripes across an arrowhead, as parallelograms in marker units. They
   * lean the way the shaft's stripes do and carry on its rhythm, so the head
   * reads as cut from the same striped material as the arrow it ends.
   *
   * A band that leans travels sideways as it crosses the head, by as much as
   * `lean` over the head's height, so the range has to start that far back and
   * end that far on: a band beginning outside the head still crosses it, and
   * leaving those out is what used to leave the head's back corner and its tip
   * unpainted and the whole head reading as a chevron. The phase is kept, in
   * whole periods from the head's back edge, so the first gap still falls
   * where the shaft's last stripe ends.
   */
  function headStripes(angle) {
    const k = Math.tan((angle * Math.PI) / 180);
    const at = (p, y) => ({ x: p + (y - CG_HEAD.refY) * k, y });
    const lean = Math.abs(k) * Math.max(CG_HEAD.refY - HEAD_BACK, HEAD_FRONT - CG_HEAD.refY);
    const period = HEAD_STRIPE_ON + HEAD_STRIPE_GAP;
    const bands = [];
    for (let x = HEAD_STRIPE_GAP - Math.ceil((lean + HEAD_STRIPE_ON) / period) * period;
         x < CG_HEAD.tipX + lean; x += period) {
      bands.push([at(x, HEAD_BACK), at(x + HEAD_STRIPE_ON, HEAD_BACK),
                  at(x + HEAD_STRIPE_ON, HEAD_FRONT), at(x, HEAD_FRONT)]);
    }
    return bands;
  }

  /**
   * Split an arrow where the arrowhead's back edge falls: the shaft, which
   * carries the stripes, and the piece the head covers, which carries the
   * marker.
   *
   * The two are drawn separately for two reasons. The shear that leans the
   * stripes over would lean the head with them if they shared a line; and
   * stripes running on under the head would be cut off by it wherever they
   * happened to fall. chessground anchors the head refX stroke widths back
   * from the line's end, so that is where the shaft stops.
   *
   * An arrow with no room for a shaft is left to the head alone.
   */
  function splitAtHead(x1, y1, x2, y2, width) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (!len) return null;
    const head = Math.min(CG_HEAD.refX * (width > 0 ? width : 0), len);
    const t = (len - head) / len;
    const at = { x: x1 + dx * t, y: y1 + dy * t };
    return {
      shaft: t > 0 ? { x1, y1, x2: at.x, y2: at.y } : null,
      head: { x1: at.x, y1: at.y, x2, y2 },
    };
  }

  /**
   * A darker shade of a colour, for the arrows the extension adds itself.
   * Understands the two forms the colours come in: the gradient's `hsl()`,
   * whose lightness comes down directly, and the rank palette's hex, whose
   * channels are dimmed. Anything else is handed back untouched.
   */
  function darker(color, factor) {
    const f = factor === undefined ? DARKEN : factor;
    if (typeof color !== 'string') return color;
    let m = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(color);
    if (m) return `hsl(${m[1]}, ${m[2]}%, ${Math.round(Number(m[3]) * f)}%)`;
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
    if (m) {
      const hex = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
      const ch = i => Math.round(parseInt(hex.slice(i * 2, i * 2 + 2), 16) * f);
      return '#' + [0, 1, 2].map(i => ch(i).toString(16).padStart(2, '0')).join('');
    }
    return color;
  }

  /**
   * Where an added arrow's numeral goes: `back` along the shaft from the
   * arrowhead and `side` off to one side of it, so it sits next to the arrow
   * rather than over it. Always the same side of the arrow's own direction,
   * so a board of them looks ordered rather than scattered, and two moves
   * arriving at the same square from different directions do not stack their
   * numbers on top of each other. On a shaft with no room to sit back that
   * far, it moves in to the middle.
   */
  function labelPoint(at, back, side) {
    if (!at) return null;
    const dx = at.x2 - at.x1, dy = at.y2 - at.y1;
    const len = Math.hypot(dx, dy);
    if (!len) return null;
    const along = Math.min(back, len / 2);
    return {
      x: at.x2 - (dx / len) * along - (dy / len) * side,
      y: at.y2 - (dy / len) * along + (dx / len) * side,
    };
  }

  /**
   * What a key press asks of the engine panel, or null to leave the key to
   * lichess. `rows` is how many lines the panel shows and `picked` the index
   * of the one a digit has put on the board, or null.
   *
   *   1..9   pick that line; the same digit again lets it go
   *   Space  play the picked line's first move (lichess's own Space plays the
   *          best move, so it is only taken while a line is picked)
   *   Escape let the picked line go, without taking the key from lichess
   *
   * A digit past the last line is left alone, so it keeps whatever lichess
   * does with it.
   */
  function shortcutFor(key, rows, picked) {
    const has = picked !== null && picked !== undefined && picked >= 0;
    if (/^[1-9]$/.test(key || '')) {
      const index = Number(key) - 1;
      if (index >= (rows || 0)) return null;
      return has && picked === index ? { type: 'clear' } : { type: 'pick', index };
    }
    if (key === ' ') return has ? { type: 'play' } : null;
    if (key === 'Escape') return has ? { type: 'clear', passive: true } : null;
    return null;
  }

  // Lichess names every move in its move tree by two characters, scalachess's
  // UciCharPair: each square is its index from a1 shifted up to '#', and a
  // promotion's second character counts on past the 64 squares, eight to a
  // piece, to say both the file it lands on and what it becomes. Drops count
  // on past those.
  const PAIR_SHIFT = 35;
  const PROMOTION_CHARS = 8 * 5;

  const squareName = i => String.fromCharCode(97 + (i % 8)) + String.fromCharCode(49 + Math.floor(i / 8));

  /**
   * The move a lichess move-tree path ends with, as "e2e4", or null. A path
   * is every move from the start of the tree, two characters each, which is
   * what lichess puts in the `p` attribute of each move in its move list.
   * Drops draw no arrow and come back as null.
   */
  function moveFromPath(path) {
    if (typeof path !== 'string' || path.length < 2 || path.length % 2) return null;
    const from = path.charCodeAt(path.length - 2) - PAIR_SHIFT;
    const to = path.charCodeAt(path.length - 1) - PAIR_SHIFT;
    if (!(from >= 0 && from < 64) || !(to >= 0)) return null;
    if (to < 64) return squareName(from) + squareName(to);
    if (to >= 64 + PROMOTION_CHARS) return null;
    // A promotion lands on the last rank on the promoting side, which is
    // whichever end of the board the pawn is next to.
    const rank = Math.floor(from / 8) >= 4 ? 7 : 0;
    return squareName(from) + squareName(rank * 8 + ((to - 64) % 8));
  }

  /**
   * The move the move tree goes on with from the position at `path`, when
   * that is worth drawing as the move that was played: the tree branches
   * here, which is where lichess marks the played move among the others, and
   * the engine's best move `best` is a different one. Null otherwise.
   *
   * `paths` are the paths of the moves in the move list in the order lichess
   * lists them, which puts the move the line goes on with first.
   */
  function playedMove(path, paths, best) {
    if (!best) return null;
    const here = typeof path === 'string' ? path : '';
    const next = (paths || []).filter(p => typeof p === 'string' && p.length === here.length + 2 && p.startsWith(here));
    if (next.length < 2) return null;
    const key = moveFromPath(next[0]);
    return key && key !== best ? key : null;
  }

  /** The played move's arrow: the mover's own colour, outlined in the other one so it shows on any square. */
  function playedStyle(turn) {
    return turn === 'black'
      ? { color: '#000000', outline: '#ffffff' }
      : { color: '#ffffff', outline: '#000000' };
  }

  /** The depth in lichess's engine readout ("Depth 23"), or 0 when it shows none. */
  function depthIn(text) {
    const m = /\d+/.exec(typeof text === 'string' ? text : '');
    return m ? Number(m[0]) : 0;
  }

  /**
   * A depth readout in lichess's own words, made from one it has shown:
   * "Depth 30" and 29 make "Depth 29", in whatever language the page is in.
   * Null when `sample` has no number in it to replace.
   */
  function withDepth(sample, depth) {
    if (typeof sample !== 'string' || !/\d/.test(sample)) return null;
    return sample.replace(/\d+/, String(depth));
  }

  /**
   * A position as carried depths are filed: the board and whose move it is,
   * which is all the engine panel says about a position a line goes through.
   */
  function positionKey(fen) {
    const [board, turn] = typeof fen === 'string' ? fen.split(' ') : [];
    return board ? `${board} ${turn === 'b' ? 'b' : 'w'}` : null;
  }

  /**
   * How deep the engine has looked into each position along the lines it
   * shows. `fen` is the position the lines start from, each line is its moves
   * as the engine panel writes them, "board|uci" with the board after the
   * move, and `depth` is the depth the panel shows. Stockfish searches every
   * line of a multi-line search to that depth, so the position one move into
   * a line has been looked at one less deep, two moves in two less, and so on.
   *
   * Returns [positionKey, depth] pairs.
   */
  function lineDepths(fen, lines, depth) {
    const key = positionKey(fen);
    if (!key || !(depth > 1)) return [];
    const out = [];
    for (const line of lines || []) {
      let side = key.slice(-1);
      for (let ply = 0; ply < (line || []).length && depth - ply - 1 > 0; ply++) {
        side = side === 'w' ? 'b' : 'w';
        const board = typeof line[ply] === 'string' ? line[ply].split('|')[0] : '';
        if (board) out.push([`${board} ${side}`, depth - ply - 1]);
      }
    }
    return out;
  }

  /**
   * File `entries` from lineDepths in `memo`, a Map, keeping the deeper of
   * the old and the new depth for each position. A position that gets deeper
   * moves to the back, and past `cap` positions the ones at the front go.
   */
  function rememberDepths(memo, entries, cap = DEPTH_MEMO) {
    for (const [key, depth] of entries || []) {
      if ((memo.get(key) || 0) >= depth) continue;
      memo.delete(key);
      memo.set(key, depth);
    }
    for (const key of memo.keys()) {
      if (memo.size <= cap) break;
      memo.delete(key);
    }
    return memo;
  }

  /**
   * The depth to show for the position `fen` in place of `live`, the one
   * lichess shows: how deep a line through it was searched, while that is
   * deeper. Null once lichess's own search has caught up, and for a position
   * no line has come through.
   */
  function carriedDepth(memo, fen, live) {
    const key = positionKey(fen);
    const carried = (key && memo.get(key)) || 0;
    return carried > (live || 0) ? carried : null;
  }

  function colorForRank(rank, palette) {
    if (rank < 0 || !palette || !palette.length) return null;
    return palette[Math.min(rank, palette.length - 1)];
  }

  const api = {
    parseCgHash, pvKeys, rankArrows, colorForRank, arrowLength, drawOrder,
    parseEvalText, winningChances, povChances, scoreArrows, colorForShift, shiftFromLineWidth, spanOf,
    parseStrokeWidth, borderStrokeWidth, borderMarker, CG_HEAD, arrowStrokeWidth, CG_WIDTH_UNIT,
    continuationMoves, lineForArrow, squarePoint, calibrate, arrowEndpoints, labelPoint,
    stripePattern, stripeTransform, splitAtHead, headStripes, darker, STRIPE_ANGLE, shortcutFor,
    moveFromPath, playedMove, playedStyle,
    depthIn, withDepth, positionKey, lineDepths, rememberDepths, carriedDepth, DEPTH_MEMO,
    DEFAULTS, MAX_SHIFT, MIN_SPAN, LABEL_RADIUS, LABEL_STEP, LABEL_FONT, BEST_BRUSH, ALT_BRUSH,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
