const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCgHash, pvKeys, rankArrows, colorForRank, DEFAULTS } = require('../src/logic.js');

test('parseCgHash extracts orig, dest and brush from a chessground hash', () => {
  assert.deepEqual(parseCgHash('512,512,1,e2,e4,paleBlue'), { orig: 'e2', dest: 'e4', brush: 'paleBlue', lineWidth: null });
  assert.deepEqual(parseCgHash('512,512,true,2,g1,f3,paleGrey,12'), { orig: 'g1', dest: 'f3', brush: 'paleGrey', lineWidth: 12 });
  assert.deepEqual(parseCgHash('512,512,pendingErase,1,d2,d4,paleGrey,-,8'), { orig: 'd2', dest: 'd4', brush: 'paleGrey', lineWidth: 8 });
});

test('parseCgHash handles circles (no dest) and junk', () => {
  assert.deepEqual(parseCgHash('512,512,1,e4,paleBlue'), { orig: 'e4', dest: null, brush: 'paleBlue', lineWidth: null });
  assert.equal(parseCgHash('512,512'), null);
  assert.equal(parseCgHash(null), null);
});

test('pvKeys normalises first moves to from+to in rank order', () => {
  assert.deepEqual(pvKeys(['e2e4', 'd2d4', 'e7e8q']), ['e2e4', 'd2d4', 'e7e8']);
  assert.deepEqual(pvKeys(['rnbqkbnr/pppppppp|g1f3', null, '', 'P@e4']), ['g1f3']);
});

test('rankArrows ranks engine arrows by PV order', () => {
  const arrows = [
    { orig: 'e2', dest: 'e4', brush: 'paleBlue' },
    { orig: 'd2', dest: 'd4', brush: 'paleGrey' },
    { orig: 'g1', dest: 'f3', brush: 'paleGrey' },
    { orig: 'c2', dest: 'c4', brush: 'paleGrey' },
  ];
  assert.deepEqual(rankArrows(arrows, ['e2e4', 'g1f3', 'd2d4', 'c2c4']), [0, 2, 1, 3]);
});

test('rankArrows: best-line arrows fall back to rank 0, others ignored', () => {
  const arrows = [
    { orig: 'e2', dest: 'e4', brush: 'paleBlue' },
    { orig: 'e4', dest: 'e5', brush: 'paleBlue' },
    { orig: 'a2', dest: 'a3', brush: 'paleGrey' },
    { orig: 'e7', dest: 'e5', brush: 'paleRed' },
    { orig: 'b1', dest: 'c3', brush: 'green' },
    { orig: 'e4', dest: null, brush: 'paleBlue' },
    { orig: 'h2', dest: 'h4', brush: 'variation' },
  ];
  assert.deepEqual(rankArrows(arrows, []), [0, 0, -1, -1, -1, -1, -1]);
});

test('colorForRank clamps to the last palette entry', () => {
  const p = ['#1', '#2', '#3'];
  assert.equal(colorForRank(0, p), '#1');
  assert.equal(colorForRank(2, p), '#3');
  assert.equal(colorForRank(9, p), '#3');
  assert.equal(colorForRank(-1, p), null);
});

test('DEFAULTS has five colours and a sane opacity', () => {
  assert.equal(DEFAULTS.colors.length, 5);
  assert.ok(DEFAULTS.opacity > 0 && DEFAULTS.opacity <= 1);
  assert.equal(DEFAULTS.enabled, true);
});

// ---- eval mode ---------------------------------------------------------
const { parseEvalText, winningChances, povChances, scoreArrows, colorForShift, shiftFromLineWidth, MAX_SHIFT } = require('../src/logic.js');

test('parseCgHash also reports the lineWidth modifier when present', () => {
  assert.equal(parseCgHash('736,736,1,e2,e4,paleGrey,12').lineWidth, 12);
  assert.equal(parseCgHash('736,736,1,c2,c4,paleBlue').lineWidth, null);
  assert.equal(parseCgHash('736,736,1,e2,e4,paleGrey,-,8').lineWidth, 8);
});

test('parseEvalText reads centipawn and mate strings as lichess renders them', () => {
  assert.deepEqual(parseEvalText('+0.2'), { cp: 20 });
  assert.deepEqual(parseEvalText('-1.5'), { cp: -150 });
  assert.deepEqual(parseEvalText('0.0'), { cp: 0 });
  assert.deepEqual(parseEvalText('#3'), { mate: 3 });
  assert.deepEqual(parseEvalText('#-2'), { mate: -2 });
  assert.equal(parseEvalText(''), null);
  assert.equal(parseEvalText('abc'), null);
  assert.equal(parseEvalText(undefined), null);
});

test('winningChances matches lichess formula and is symmetric', () => {
  assert.equal(winningChances({ cp: 0 }), 0);
  assert.ok(Math.abs(winningChances({ cp: 100 }) - 0.1817) < 0.001);
  assert.ok(Math.abs(winningChances({ cp: -100 }) + 0.1817) < 0.001);
  assert.ok(winningChances({ mate: 1 }) > 0.99);
  assert.ok(winningChances({ mate: -1 }) < -0.99);
  assert.ok(winningChances({ mate: 3 }) > winningChances({ mate: 12 }));
  assert.equal(winningChances(null), null);
});

test('povChances flips sign for black', () => {
  assert.ok(povChances('white', { cp: 100 }) > 0);
  assert.ok(povChances('black', { cp: 100 }) < 0);
});

test('scoreArrows returns loss vs best line per arrow, from the mover POV', () => {
  const arrows = [
    { orig: 'e2', dest: 'e4', brush: 'paleBlue', lineWidth: null },
    { orig: 'd2', dest: 'd4', brush: 'paleGrey', lineWidth: 12 },
    { orig: 'a2', dest: 'a4', brush: 'paleGrey', lineWidth: 6 },
    { orig: 'h2', dest: 'h4', brush: 'paleGrey', lineWidth: 8 }, // not in pv list → width fallback
    { orig: 'b1', dest: 'c3', brush: 'green', lineWidth: null },
  ];
  const pvs = [
    { key: 'e2e4', eval: { cp: 50 } },
    { key: 'd2d4', eval: { cp: 40 } },
    { key: 'a2a4', eval: { cp: -150 } },
  ];
  const s = scoreArrows(arrows, pvs, 'white');
  assert.equal(s[0], 0);
  assert.ok(s[1] > 0 && s[1] < 0.03, `small loss, got ${s[1]}`);
  assert.ok(s[2] > s[1], 'a4 loses more than d4');
  assert.ok(Math.abs(s[3] - shiftFromLineWidth(8)) < 1e-9);
  assert.equal(s[4], null);
});

test('scoreArrows for black: a lower white-POV eval is better', () => {
  const arrows = [
    { orig: 'e7', dest: 'e5', brush: 'paleBlue', lineWidth: null },
    { orig: 'a7', dest: 'a5', brush: 'paleGrey', lineWidth: 12 },
  ];
  const s = scoreArrows(arrows, [{ key: 'e7e5', eval: { cp: 20 } }, { key: 'a7a5', eval: { cp: 120 } }], 'black');
  assert.equal(s[0], 0);
  assert.ok(s[1] > 0.05, `a5 is clearly worse for black, got ${s[1]}`);
  // A far worse line must score strictly higher still.
  const worse = scoreArrows(arrows, [{ key: 'e7e5', eval: { cp: 20 } }, { key: 'a7a5', eval: { cp: 400 } }], 'black');
  assert.ok(worse[1] > s[1]);
});

test('scoreArrows: best arrow without evals is 0, alternatives use width, else null', () => {
  const arrows = [
    { orig: 'e2', dest: 'e4', brush: 'paleBlue', lineWidth: null },
    { orig: 'd2', dest: 'd4', brush: 'paleGrey', lineWidth: 2 },
    { orig: 'c2', dest: 'c4', brush: 'paleGrey', lineWidth: null },
  ];
  assert.deepEqual(scoreArrows(arrows, [], 'white'), [0, shiftFromLineWidth(2), null]);
});

test('shiftFromLineWidth inverts lichess width formula', () => {
  assert.equal(shiftFromLineWidth(12), 0);
  assert.ok(Math.abs(shiftFromLineWidth(2) - 0.2) < 1e-9);
});

test('colorForShift goes green → yellow → red and clamps', () => {
  assert.equal(colorForShift(0), 'hsl(120, 75%, 42%)');
  assert.equal(colorForShift(MAX_SHIFT / 2), 'hsl(60, 75%, 42%)');
  assert.equal(colorForShift(MAX_SHIFT), 'hsl(0, 75%, 42%)');
  assert.equal(colorForShift(5), 'hsl(0, 75%, 42%)');
  assert.equal(colorForShift(-1), 'hsl(120, 75%, 42%)');
  assert.equal(colorForShift(null), null);
});

test('DEFAULTS mode is eval', () => {
  assert.equal(DEFAULTS.mode, 'eval');
});

// ---- per-position normalisation ---------------------------------------
const { spanOf, MIN_SPAN } = require('../src/logic.js');

test('spanOf stretches to the worst loss present', () => {
  assert.equal(spanOf([0, 0.05, 0.18]), 0.18);
  assert.equal(spanOf([0, 0.2]), 0.2);
});

test('spanOf floors at MIN_SPAN so near-equal moves stay green', () => {
  assert.equal(spanOf([0, 0.001, 0.004]), MIN_SPAN);
  assert.equal(spanOf([0, 0]), MIN_SPAN);
  assert.equal(spanOf([]), MIN_SPAN);
  assert.equal(spanOf([null, undefined, 0]), MIN_SPAN);
  assert.ok(MIN_SPAN > 0 && MIN_SPAN < MAX_SHIFT);
});

test('colorForShift takes an optional span and defaults to MAX_SHIFT', () => {
  assert.equal(colorForShift(0.09, 0.18), 'hsl(60, 75%, 42%)');
  assert.equal(colorForShift(0.18, 0.18), 'hsl(0, 75%, 42%)');
  assert.equal(colorForShift(0.5, 0.18), 'hsl(0, 75%, 42%)');
  assert.equal(colorForShift(0, 0.18), 'hsl(120, 75%, 42%)');
  assert.equal(colorForShift(0.1), colorForShift(0.1, MAX_SHIFT));
});

test('normalised: the worst arrow is fully red, the best fully green', () => {
  const shifts = [0, 0.02, 0.07];
  const span = spanOf(shifts);
  const colors = shifts.map(s => colorForShift(s, span));
  assert.equal(colors[0], 'hsl(120, 75%, 42%)');
  assert.equal(colors[2], 'hsl(0, 75%, 42%)');
  assert.ok(colors[1] !== colors[0] && colors[1] !== colors[2]);
});

test('normalised: two near-equal winning moves stay close to green', () => {
  const shifts = [0, 0.004];
  const colors = shifts.map(s => colorForShift(s, spanOf(shifts)));
  assert.equal(colors[0], 'hsl(120, 75%, 42%)');
  const hue = Number(/hsl\((\d+)/.exec(colors[1])[1]);
  assert.ok(hue > 100, `tiny gap should stay green, got hue ${hue}`);
});

test('DEFAULTS normalize is on', () => {
  assert.equal(DEFAULTS.normalize, true);
});

// ---- arrow borders -----------------------------------------------------
const { parseStrokeWidth, borderStrokeWidth } = require('../src/logic.js');

test('parseStrokeWidth reads chessground stroke widths', () => {
  assert.equal(parseStrokeWidth('0.1875'), 0.1875);
  assert.equal(parseStrokeWidth('0.234375'), 0.234375);
  assert.equal(parseStrokeWidth(null), null);
  assert.equal(parseStrokeWidth(''), null);
  assert.equal(parseStrokeWidth('none'), null);
  assert.equal(parseStrokeWidth('0'), null);
});

test('borderStrokeWidth widens the arrow by the border on each side', () => {
  assert.ok(Math.abs(borderStrokeWidth(0.1875, 0.03) - 0.2475) < 1e-9);
  assert.ok(Math.abs(borderStrokeWidth(0.05, 0.02) - 0.09) < 1e-9);
});

test('borderStrokeWidth returns null when there is nothing to outline', () => {
  assert.equal(borderStrokeWidth(0.1875, 0), null);
  assert.equal(borderStrokeWidth(0.1875, -1), null);
  assert.equal(borderStrokeWidth(null, 0.03), null);
  assert.equal(borderStrokeWidth(0, 0.03), null);
});

test('DEFAULTS carry a sane border', () => {
  assert.equal(DEFAULTS.border, true);
  assert.match(DEFAULTS.borderColor, /^#[0-9a-f]{6}$/i);
  assert.ok(DEFAULTS.borderWidth > 0 && DEFAULTS.borderWidth < 0.2);
});

const { borderMarker, CG_HEAD } = require('../src/logic.js');

// The outline must sit a constant `b` outside the arrow everywhere: along the
// shaft, round the tail, and all the way round the head. Scaling the head
// triangle up by the wider stroke does NOT do that -- it inflates the triangle
// about its anchor, leaving the head's sides and back several times too thick.
// So the outline's head is the SAME triangle, stroked with width 2b (half of
// which falls outside the edge) and round joins.
test('borderMarker draws the same head triangle as the arrow, not a bigger one', () => {
  const [w, b] = [0.1875, 0.03];
  const wb = borderStrokeWidth(w, b);
  const m = borderMarker(w, b);
  // Marker geometry is multiplied by the line's stroke width when drawn.
  assert.ok(Math.abs(m.scale * wb - w) < 1e-12, 'rendered head must match the arrow head');
});

test('borderMarker keeps the head anchored exactly where the arrow head is', () => {
  for (const [w, b] of [[0.1875, 0.03], [0.234375, 0.03], [0.171875, 0.05]]) {
    const wb = borderStrokeWidth(w, b);
    const m = borderMarker(w, b);
    // Tip and centre line must land in the same place as the arrow's own head;
    // the outline comes from the stroke, not from shifting the triangle.
    // The triangle is pre-scaled in marker units, so its tip sits at tipX * scale.
    const tipOffset = (CG_HEAD.tipX * m.scale - m.refX) * wb;
    assert.ok(Math.abs(tipOffset - (CG_HEAD.tipX - CG_HEAD.refX) * w) < 1e-12, `tip w=${w}`);
    assert.ok(Math.abs(m.refY * wb - CG_HEAD.refY * w) < 1e-12, `centre w=${w}`);
  }
});

test('borderMarker strokes exactly one border width outside the head edge', () => {
  for (const [w, b] of [[0.1875, 0.03], [0.046875, 0.02]]) {
    const wb = borderStrokeWidth(w, b);
    const m = borderMarker(w, b);
    // Half of a centred stroke falls outside the edge.
    assert.ok(Math.abs((m.strokeWidth * wb) / 2 - b) < 1e-12, `outset w=${w}`);
    assert.equal(m.strokeLinejoin, 'round');
  }
});

test('borderMarker path is the head triangle at the marker scale', () => {
  const m = borderMarker(0.1875, 0.03);
  const k = m.scale;
  assert.equal(m.path, `M0,0 V${4 * k} L${3 * k},${2 * k} Z`);
});

test('the outline never makes the arrow head bigger', () => {
  for (const [w, b] of [[0.1875, 0.03], [0.234375, 0.06], [0.046875, 0.02]]) {
    const m = borderMarker(w, b);
    const drawn = m.scale * borderStrokeWidth(w, b);
    assert.ok(Math.abs(drawn - w) < 1e-12, `head grew: ${drawn} vs ${w}`);
  }
});

test('borderMarker returns null when there is nothing to outline', () => {
  assert.equal(borderMarker(null, 0.03), null);
  assert.equal(borderMarker(0.1875, 0), null);
});

// ---- one width for every arrow ----------------------------------------
const { arrowStrokeWidth } = require('../src/logic.js');

test('arrowStrokeWidth gives every arrow the chosen width', () => {
  assert.equal(arrowStrokeWidth(0.1875, true, 0.15625), 0.15625);
  assert.equal(arrowStrokeWidth(0.03125, true, 0.15625), 0.15625);
  assert.equal(arrowStrokeWidth(null, true, 0.15625), 0.15625);
});

test('arrowStrokeWidth keeps lichess widths when not asked', () => {
  assert.equal(arrowStrokeWidth(0.1875, false, 0.15625), 0.1875);
  assert.equal(arrowStrokeWidth(0.03125, false, 0.15625), 0.03125);
  assert.equal(arrowStrokeWidth(null, false, 0.15625), null);
});

test('arrowStrokeWidth falls back to the default width if given a bad one', () => {
  assert.equal(arrowStrokeWidth(0.1875, true, 0), DEFAULTS.width);
  assert.equal(arrowStrokeWidth(0.1875, true, null), DEFAULTS.width);
});

test('same width in, same outline out', () => {
  const b = 0.03;
  const widths = [0.1875, 0.03125, 0.234375].map(w => arrowStrokeWidth(w, true, DEFAULTS.width));
  const outlines = widths.map(w => borderStrokeWidth(w, b));
  const heads = widths.map(w => borderMarker(w, b).scale * borderStrokeWidth(w, b));
  assert.equal(new Set(widths).size, 1);
  assert.equal(new Set(outlines).size, 1);
  assert.equal(new Set(heads.map(h => h.toFixed(12))).size, 1);
});

test('the default arrow is thinner than lichess\'s full-strength one', () => {
  assert.equal(DEFAULTS.uniformWidth, true);
  assert.ok(DEFAULTS.width < 15 / 64, 'should be thinner than lichess');
  assert.ok(DEFAULTS.width > 4 / 64, 'but still clearly visible');
});

// ---- draw order --------------------------------------------------------
const { drawOrder } = require('../src/logic.js');

test('drawOrder draws the longest arrow first, so shorter ones land on top', () => {
  const arrows = [
    { orig: 'e2', dest: 'e3' },   // 1 square
    { orig: 'a1', dest: 'h8' },   // 7 squares diagonally
    { orig: 'd2', dest: 'd4' },   // 2 squares
  ];
  assert.deepEqual(drawOrder(arrows), [1, 2, 0]);
});

test('drawOrder keeps equally long arrows in the order lichess gave them', () => {
  const arrows = [
    { orig: 'b1', dest: 'c3' },
    { orig: 'g1', dest: 'f3' },
    { orig: 'e2', dest: 'e4' },
  ];
  assert.deepEqual(drawOrder(arrows), [0, 1, 2]);
});

test('drawOrder puts circles and unreadable shapes on top of every arrow', () => {
  const arrows = [
    { orig: 'e4', dest: null },
    { orig: 'e2', dest: 'e4' },
    null,
  ];
  assert.deepEqual(drawOrder(arrows), [1, 0, 2]);
});

// ---- the rest of the best line -----------------------------------------
const { continuationMoves, lineForArrow, squarePoint, calibrate, arrowEndpoints, labelPoint,
  LABEL_RADIUS, LABEL_STEP, LABEL_FONT } = require('../src/logic.js');

test('continuationMoves returns the line after the move lichess already draws', () => {
  const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
  assert.deepEqual(continuationMoves(line, 3, []), [
    { orig: 'e7', dest: 'e5', key: 'e7e5', ply: 1, drawn: false },
    { orig: 'g1', dest: 'f3', key: 'g1f3', ply: 2, drawn: false },
    { orig: 'b8', dest: 'c6', key: 'b8c6', ply: 3, drawn: false },
  ]);
});

test('continuationMoves reads lichess\'s fen|uci form and promotions', () => {
  const line = ['8/4P3/8|e2e4', 'rn/pp|e7e8q'];
  assert.deepEqual(continuationMoves(line, 2, []), [{ orig: 'e7', dest: 'e8', key: 'e7e8', ply: 1, drawn: false }]);
});

test('continuationMoves draws nothing at depth 0, and nothing for a one-move line', () => {
  assert.deepEqual(continuationMoves(['e2e4', 'e7e5'], 0, []), []);
  assert.deepEqual(continuationMoves(['e2e4'], 3, []), []);
  assert.deepEqual(continuationMoves([], 3, []), []);
  assert.deepEqual(continuationMoves(null, 3, []), []);
});

test('continuationMoves marks a move already on the board instead of dropping it', () => {
  const line = ['e2e4', 'g8f6', 'b1c3', 'd7d5'];
  // g8f6 is an alternative line's own arrow, so lichess draws it already. It
  // is still the line's second move and still has to carry that number; all
  // it does not want is a second arrow laid over the one already there.
  assert.deepEqual(continuationMoves(line, 3, ['e2e4', 'g8f6']), [
    { orig: 'g8', dest: 'f6', key: 'g8f6', ply: 1, drawn: true },
    { orig: 'b1', dest: 'c3', key: 'b1c3', ply: 2, drawn: false },
    { orig: 'd7', dest: 'd5', key: 'd7d5', ply: 3, drawn: false },
  ]);
});

test('continuationMoves keeps one arrow when a piece shuffles back, and numbers both plies', () => {
  const line = ['e2e4', 'b8c6', 'g1f3', 'c6b8', 'b8c6'];
  assert.deepEqual(continuationMoves(line, 4, []).map(m => [m.key, m.drawn]), [
    ['b8c6', false], ['g1f3', false], ['c6b8', false], ['b8c6', true],
  ]);
});

test('lineForArrow follows the line whose first move the board is pointing at', () => {
  // Hovering a line in the engine panel makes lichess draw that line's first
  // move, and only it, with the best brush. The arrow is what says which line
  // to follow, so the panel row it belongs to is the line to draw.
  const keys = ['d7d5', 'f8c5', 'd8e7', 'f6e4'];
  assert.equal(lineForArrow(keys, 'd7d5'), 0);
  assert.equal(lineForArrow(keys, 'd8e7'), 2);
  assert.equal(lineForArrow(keys, 'f6e4'), 3);
});

test('lineForArrow falls back to the best line when no row owns the arrow', () => {
  assert.equal(lineForArrow(['d7d5', 'f8c5'], 'a2a3'), 0);
  // A row whose move cannot be read leaves a hole, which must not match.
  assert.equal(lineForArrow(['d7d5', undefined, 'd8e7'], undefined), 0);
  assert.equal(lineForArrow([], 'd7d5'), 0);
  assert.equal(lineForArrow(null, 'd7d5'), 0);
});

test('continuationMoves stops at a move it cannot read, rather than skipping it', () => {
  const line = ['e2e4', 'e7e5', 'P@d4', 'g1f3'];
  assert.deepEqual(continuationMoves(line, 4, []).map(m => m.key), ['e7e5']);
});

test('LABEL_STEP sets two numerals on one arrow a clear disc apart', () => {
  assert.ok(LABEL_STEP > 2 * LABEL_RADIUS);
});

test('squarePoint maps squares onto chessground\'s board units', () => {
  assert.deepEqual(squarePoint('a1', false), { x: -3.5, y: 3.5 });
  assert.deepEqual(squarePoint('h8', false), { x: 3.5, y: -3.5 });
  assert.deepEqual(squarePoint('e2', false), { x: 0.5, y: 2.5 });
  assert.deepEqual(squarePoint('a1', true), { x: 3.5, y: -3.5 });
  assert.deepEqual(squarePoint('e2', true), { x: -0.5, y: -2.5 });
  assert.equal(squarePoint('j9', false), null);
});

test('calibrate reads board orientation and arrowhead margin off a drawn arrow', () => {
  // e2->e4 white POV: (0.5, 2.5) to (0.5, 0.5), drawn 0.2 short for the head.
  assert.deepEqual(calibrate({ orig: 'e2', dest: 'e4', x1: 0.5, y1: 2.5, x2: 0.5, y2: 0.7 }), { flipped: false, margin: 0.2 });
});

test('calibrate spots a flipped board', () => {
  const c = calibrate({ orig: 'e2', dest: 'e4', x1: -0.5, y1: -2.5, x2: -0.5, y2: -0.7 });
  assert.equal(c.flipped, true);
  assert.ok(Math.abs(c.margin - 0.2) < 1e-9);
});

test('calibrate rejects an arrow that matches neither orientation', () => {
  assert.equal(calibrate({ orig: 'e2', dest: 'e4', x1: 99, y1: 0, x2: 0, y2: 0 }), null);
  assert.equal(calibrate({ orig: 'e2', dest: null, x1: 0.5, y1: 2.5, x2: 0.5, y2: 0.7 }), null);
  assert.equal(calibrate(null), null);
});

test('arrowEndpoints draws from square to square, less the arrowhead margin', () => {
  const e = arrowEndpoints('e2', 'e4', { flipped: false, margin: 0.2 });
  assert.deepEqual(e, { x1: 0.5, y1: 2.5, x2: 0.5, y2: 0.7 });
});

test('arrowEndpoints takes the margin along the arrow, whatever its angle', () => {
  const e = arrowEndpoints('a1', 'c2', { flipped: false, margin: 0.5 });
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  assert.ok(Math.abs(Math.hypot(dx, dy) - (Math.hypot(2, 1) - 0.5)) < 1e-9);
  // Same direction as the full move: down-board and to the right.
  assert.ok(dx > 0 && dy < 0);
});

test('arrowEndpoints survives an arrow shorter than the margin', () => {
  assert.equal(arrowEndpoints('e2', 'e3', { flipped: false, margin: 2 }), null);
  assert.equal(arrowEndpoints('e2', 'e2', { flipped: false, margin: 0.2 }), null);
  assert.equal(arrowEndpoints('e2', 'e4', null), null);
});

test('an added arrow is as wide as a regular one, and a little less solid', () => {
  assert.equal(DEFAULTS.lineOpacity, 0.8);
  assert.ok(DEFAULTS.lineOpacity < 1, 'the move to play stays the strongest arrow');
  assert.ok(DEFAULTS.opacity * DEFAULTS.lineOpacity > 0.4, 'but is still plainly there');
});

test('labelPoint sits beside the shaft, just behind the arrowhead', () => {
  const p = labelPoint({ x1: 0, y1: 0, x2: 2, y2: 0 }, 0.1, 0.2);
  assert.ok(Math.abs(p.x - 1.9) < 1e-9, 'behind the head, along the arrow');
  assert.ok(Math.abs(Math.abs(p.y) - 0.2) < 1e-9, 'and off to the side of it');
});

test('labelPoint keeps to the same side of the arrow whichever way it points', () => {
  // Which side of the arrow the label fell on, from the sign of the cross
  // product of the arrow with the offset.
  const side = (x1, y1, x2, y2) => {
    const p = labelPoint({ x1, y1, x2, y2 }, 0.1, 0.2);
    return Math.sign((x2 - x1) * (p.y - y2) - (y2 - y1) * (p.x - x2));
  };
  const want = side(0, 0, 2, 0);
  assert.notEqual(want, 0);
  for (const a of [[0, 0, 0, 2], [3, 3, -1, -2], [1.5, 1.5, 3.36, 0.57]]) {
    assert.equal(side(...a), want);
  }
});

test('labelPoint never slides past the middle of a short shaft', () => {
  const p = labelPoint({ x1: 0, y1: 0, x2: 0.2, y2: 0 }, 0.5, 0);
  assert.ok(Math.abs(p.x - 0.1) < 1e-9, 'stays within the shaft');
});

test('labelPoint follows a diagonal shaft', () => {
  const p = labelPoint({ x1: 0, y1: 0, x2: 3, y2: 4 }, 0.5, 0);
  assert.ok(Math.abs(Math.hypot(3 - p.x, 4 - p.y) - 0.5) < 1e-9);
  assert.ok(Math.abs(p.y / p.x - 4 / 3) < 1e-9);
});

test('labelPoint has nowhere to sit on a shaft of no length', () => {
  assert.equal(labelPoint({ x1: 1, y1: 1, x2: 1, y2: 1 }, 0.2, 0.2), null);
  assert.equal(labelPoint(null, 0.2, 0.2), null);
});

test('the numeral is small enough to sit beside a half-width arrow', () => {
  assert.ok(LABEL_RADIUS < 0.18, 'a disc, not a badge over the board');
  assert.ok(LABEL_FONT < 2 * LABEL_RADIUS, 'the numeral fits its disc');
});


const { stripePattern } = require('../src/logic.js');

test('stripePattern fits whole stripes to the shaft, flush at both ends', () => {
  const len = 1.2;
  const [on, off] = stripePattern(0.14, len);
  // n stripes and n-1 gaps span the shaft exactly.
  const n = (len + off) / (on + off);
  assert.ok(Math.abs(n - Math.round(n)) < 1e-9, `whole number of stripes, got ${n}`);
  assert.ok(Math.round(n) >= 2, 'more than one stripe on a shaft this long');
  assert.ok(on > off, 'stripes, not dots');
});

test('stripePattern paints a shaft too short to stripe solid instead', () => {
  const [on] = stripePattern(0.14, 0.2);
  assert.ok(on >= 0.2, 'one stripe, covering the whole shaft');
});

test('stripePattern scales the stripes with the arrow width', () => {
  assert.ok(stripePattern(0.3, 2)[0] > stripePattern(0.1, 2)[0]);
});

test('stripePattern has nothing to stripe without a width or a length', () => {
  assert.equal(stripePattern(0, 1), null);
  assert.equal(stripePattern(0.14, 0), null);
  assert.equal(stripePattern(null, null), null);
});

const { stripeTransform, splitAtHead, STRIPE_ANGLE } = require('../src/logic.js');

test('STRIPE_ANGLE cuts across the arrow, neither square to it nor along it', () => {
  assert.ok(STRIPE_ANGLE > 10 && STRIPE_ANGLE < 60);
});

const applyTransform = (t, x, y) => {
  const [a, b, c, d, e, f] = t.match(/matrix\(([^)]*)\)/)[1].trim().split(/[\s,]+/).map(Number);
  return { x: a * x + c * y + e, y: b * x + d * y + f };
};

test('stripeTransform leaves the arrow itself exactly where it was', () => {
  for (const [x1, y1, x2, y2] of [[1.5, 1.5, 3.36, 0.57], [0.5, 2.5, 0.5, 0.5], [-3.5, -0.5, 1, 2], [0, 0, 2, 0]]) {
    const t = stripeTransform(x1, y1, x2, y2, STRIPE_ANGLE);
    const tail = applyTransform(t, x1, y1), head = applyTransform(t, x2, y2);
    assert.ok(Math.abs(tail.x - x1) < 1e-9 && Math.abs(tail.y - y1) < 1e-9, `tail moved to ${tail.x},${tail.y}`);
    assert.ok(Math.abs(head.x - x2) < 1e-9 && Math.abs(head.y - y2) < 1e-9, `head moved to ${head.x},${head.y}`);
  }
});

test('stripeTransform slides the shaft edge along the arrow, which leans the cut', () => {
  // Pointing along +x. A point half a unit off the arrow's side slides along
  // the arrow by that much times tan(angle), and stays the same distance off
  // it: that is what turns a square cut into a diagonal one without moving
  // the shaft's long edges.
  const t = stripeTransform(1, 2, 3, 2, 25);
  const p = applyTransform(t, 1, 2.5);
  assert.ok(Math.abs(p.y - 2.5) < 1e-9, 'edge stays where it was');
  assert.ok(Math.abs(p.x - (1 + 0.5 * Math.tan((25 * Math.PI) / 180))) < 1e-9, 'edge slides along the arrow');
});

test('stripeTransform leans every arrow by the same angle, whatever its direction', () => {
  const lean = (x1, y1, x2, y2) => {
    const t = stripeTransform(x1, y1, x2, y2, STRIPE_ANGLE);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = { x: -(y2 - y1) / len, y: (x2 - x1) / len };   // half a unit off the side
    const p = applyTransform(t, x1 + n.x * 0.5, y1 + n.y * 0.5);
    // How far it slid along the arrow.
    return ((p.x - x1 - n.x * 0.5) * (x2 - x1) + (p.y - y1 - n.y * 0.5) * (y2 - y1)) / len;
  };
  const slide = 0.5 * Math.tan((STRIPE_ANGLE * Math.PI) / 180);
  for (const a of [[0, 0, 2, 0], [0.5, 2.5, 0.5, 0.5], [1.5, 1.5, 3.36, 0.57], [3, 3, -1, -2]]) {
    assert.ok(Math.abs(lean(...a) - slide) < 1e-9, `leaned by ${lean(...a)}, wanted ${slide}`);
  }
});

test('stripeTransform has nothing to shear without an arrow', () => {
  assert.equal(stripeTransform(1, 1, 1, 1, 20), null);
});

test('splitAtHead hands the arrowhead the piece of line it covers', () => {
  // chessground's head reaches CG_HEAD.refX stroke widths back from the tip.
  const back = CG_HEAD.refX * 0.2;
  const s = splitAtHead(0, 0, 3, 0, 0.2);
  assert.ok(Math.abs(s.head.x1 - (3 - back)) < 1e-9);
  assert.equal(s.head.x2, 3);
  assert.equal(s.shaft.x1, 0);
  assert.ok(Math.abs(s.shaft.x2 - s.head.x1) < 1e-9, 'shaft ends where the head starts');
});

test('splitAtHead keeps a diagonal arrow\'s direction', () => {
  const s = splitAtHead(0, 0, 3, 4, 0.2);
  const len = Math.hypot(s.head.x2 - s.head.x1, s.head.y2 - s.head.y1);
  assert.ok(Math.abs(len - CG_HEAD.refX * 0.2) < 1e-9);
  assert.ok(Math.abs(s.head.y1 / s.head.x1 - 4 / 3) < 1e-9);
});

test('splitAtHead leaves no shaft on an arrow the head fills by itself', () => {
  const s = splitAtHead(0, 0, 0.3, 0, 0.2);
  assert.equal(s.shaft, null);
  assert.deepEqual(s.head, { x1: 0, y1: 0, x2: 0.3, y2: 0 });
});

test('splitAtHead has nothing to split without an arrow', () => {
  assert.equal(splitAtHead(1, 1, 1, 1, 0.2), null);
  assert.equal(stripeTransform(0, 0, 0, 0, 20), null);
});

test('DEFAULTS draws four moves of the best line, numbered 2 to 5', () => {
  assert.equal(DEFAULTS.lineDepth, 4);
});

const { darker } = require('../src/logic.js');

test('darker keeps an hsl colour\'s hue and saturation and takes its lightness down', () => {
  const [h, s, l] = darker('hsl(120, 75%, 42%)')
    .match(/^hsl\(([\d.]+), ([\d.]+)%, ([\d.]+)%\)$/).slice(1).map(Number);
  assert.equal(h, 120);
  assert.equal(s, 75);
  assert.ok(l > 0 && l < 42, `lightness ${l}`);
});

test('darker dims every channel of a hex colour, and keeps it green', () => {
  const out = darker('#22c55e');
  assert.match(out, /^#[0-9a-f]{6}$/);
  const ch = i => parseInt(out.slice(1 + i * 2, 3 + i * 2), 16);
  assert.ok(ch(0) < 0x22 && ch(1) < 0xc5 && ch(2) < 0x5e);
  assert.ok(ch(1) > ch(0) && ch(1) > ch(2), 'green still dominates');
});

test('darker writes a short hex out in full', () => {
  assert.match(darker('#fff'), /^#[0-9a-f]{6}$/);
});

test('darker leaves a colour it cannot read alone', () => {
  assert.equal(darker('rebeccapurple'), 'rebeccapurple');
  assert.equal(darker(null), null);
});

test('stripePattern puts several stripes on a one-square shaft', () => {
  const [on, off] = stripePattern(DEFAULTS.width, 0.85);
  const n = Math.round((0.85 + off) / (on + off));
  assert.ok(n >= 3, `only ${n} stripes on a one-square arrow`);
});

const { headStripes } = require('../src/logic.js');

test('headStripes stripe the arrowhead on the same lean as the shaft', () => {
  const k = Math.tan((STRIPE_ANGLE * Math.PI) / 180);
  const bands = headStripes(STRIPE_ANGLE);
  assert.ok(bands.length >= 2, 'more than one stripe across the head');
  for (const b of bands) {
    assert.equal(b.length, 4, 'a parallelogram');
    // Each cut leans: the far corner sits further along the arrow than the
    // near one, in proportion to how far across the head it is.
    assert.ok(Math.abs(b[3].x - b[0].x - (b[3].y - b[0].y) * k) < 1e-9);
    assert.ok(b[1].x > b[0].x, 'and has width along the arrow');
  }
});

test('headStripes keep the shaft\'s phase, a gap at the head\'s back edge', () => {
  // Unleaned, a stripe starts half a unit in, so the shaft's last stripe is
  // followed by a gap before the head's first.
  assert.ok(headStripes(0).some(b => Math.abs(b[0].x - 0.5) < 1e-9));
});

test('headStripes run past the head on both sides, for it to be clipped to', () => {
  for (const b of headStripes(STRIPE_ANGLE)) {
    assert.ok(b[0].y < 0 && b[3].y > 4, 'clears the head, which spans 0 to 4');
  }
});

test('headStripes cover the head at every height, not only across its middle', () => {
  // A leaning band travels sideways as it crosses the head, so bands that
  // start outside it still cross it. Leaving those out left the back corner
  // and the point bare, and the head read as a chevron rather than an arrow.
  const k = Math.tan((STRIPE_ANGLE * Math.PI) / 180);
  const bands = headStripes(STRIPE_ANGLE);
  for (let y = 0; y <= 4; y += 0.25) {
    const spans = bands
      .map(b => { const x = b[0].x + (y - b[0].y) * k; return [x, x + (b[1].x - b[0].x)]; })
      .sort((a, b) => a[0] - b[0]);
    assert.ok(spans[0][0] <= 0, `reaches the back edge at y=${y}`);
    assert.ok(spans[spans.length - 1][1] >= CG_HEAD.tipX, `reaches the point at y=${y}`);
    for (let i = 1; i < spans.length; i++) {
      assert.ok(spans[i][0] - spans[i - 1][1] < 0.51, `no hole beyond a gap at y=${y}`);
    }
  }
});

test('shortcutFor: digits pick a line, the same digit again lets it go', () => {
  const { shortcutFor } = require('../src/logic.js');
  assert.deepEqual(shortcutFor('1', 5, null), { type: 'pick', index: 0 });
  assert.deepEqual(shortcutFor('5', 5, null), { type: 'pick', index: 4 });
  assert.deepEqual(shortcutFor('2', 5, 0), { type: 'pick', index: 1 });
  assert.deepEqual(shortcutFor('3', 5, 2), { type: 'clear' });
});

test('shortcutFor: a digit past the last line is left to lichess', () => {
  const { shortcutFor } = require('../src/logic.js');
  assert.equal(shortcutFor('4', 3, null), null);
  assert.equal(shortcutFor('1', 0, null), null);
  assert.equal(shortcutFor('0', 5, null), null);
});

test('shortcutFor: Space plays only while a line is picked, Escape clears without taking the key', () => {
  const { shortcutFor } = require('../src/logic.js');
  assert.equal(shortcutFor(' ', 5, null), null);
  assert.deepEqual(shortcutFor(' ', 5, 1), { type: 'play' });
  assert.equal(shortcutFor('Escape', 5, null), null);
  assert.deepEqual(shortcutFor('Escape', 5, 1), { type: 'clear', passive: true });
  assert.equal(shortcutFor('a', 5, 1), null);
  assert.equal(shortcutFor(undefined, 5, 1), null);
});

// Lichess's move tree names each move by two characters, one per square
// counted from a1 and shifted up to '#' (scalachess's UciCharPair). A path is
// those pairs one after another, and the last pair is the move it leads to.
const pair = (from, to) => String.fromCharCode(35 + from, 35 + to);

test('moveFromPath reads the last move of a lichess move-tree path', () => {
  const { moveFromPath } = require('../src/logic.js');
  assert.equal(moveFromPath('/?'), 'e2e4');
  assert.equal(moveFromPath('/?WG)8XP'), 'f7f6');
  // Backslash is b8: a path is raw text, whatever characters it holds.
  assert.equal(moveFromPath('/?WG)8\\M'), 'b8c6');
  assert.equal(moveFromPath(pair(4, 7)), 'e1h1');
});

test('moveFromPath reads a promotion, whose second character names the file and the piece', () => {
  const { moveFromPath } = require('../src/logic.js');
  // 35 + 64 + 8 * piece + file, the pieces in the order queen, rook, bishop, knight, king.
  assert.equal(moveFromPath('W' + String.fromCharCode(35 + 64 + 0 + 4)), 'e7e8');
  assert.equal(moveFromPath('W' + String.fromCharCode(35 + 64 + 0 + 3)), 'e7d8');
  assert.equal(moveFromPath('.' + String.fromCharCode(35 + 64 + 24 + 3)), 'd2d1');
});

test('moveFromPath has no move for a drop, an empty path or junk', () => {
  const { moveFromPath } = require('../src/logic.js');
  assert.equal(moveFromPath('?' + String.fromCharCode(35 + 64 + 40)), null);
  assert.equal(moveFromPath(''), null);
  assert.equal(moveFromPath('/'), null);
  assert.equal(moveFromPath('!!'), null);
  assert.equal(moveFromPath(null), null);
});

// 1. e4 e5 2. Nf3 f6 (2... Nc6) 3. Nxe5, as lichess lists it.
const TREE = ['/?', '/?WG', '/?WG)8', '/?WG)8XP', '/?WG)8\\M', '/?WG)8XP8G'];

test('playedMove is the move the tree goes on with where it branches and the engine prefers another', () => {
  const { playedMove } = require('../src/logic.js');
  assert.equal(playedMove('/?WG)8', TREE, 'b8c6'), 'f7f6');
  assert.equal(playedMove('/?WG)8', TREE, 'g8f6'), 'f7f6');
});

test('playedMove has nothing to add where the engine plays the same move', () => {
  const { playedMove } = require('../src/logic.js');
  assert.equal(playedMove('/?WG)8', TREE, 'f7f6'), null);
});

test('playedMove leaves a position alone where the tree does not branch', () => {
  const { playedMove } = require('../src/logic.js');
  assert.equal(playedMove('/?WG', TREE, 'b1c3'), null);
  assert.equal(playedMove('/?WG)8XP8G', TREE, 'd8e7'), null);
});

test('playedMove needs an engine move to compare with', () => {
  const { playedMove } = require('../src/logic.js');
  assert.equal(playedMove('/?WG)8', TREE, null), null);
  assert.equal(playedMove('/?WG)8', TREE, ''), null);
});

test('playedMove counts only the moves straight after this one, from the start of the game too', () => {
  const { playedMove } = require('../src/logic.js');
  const tree = ['/?', '0@', '/?WG', '0@WG'];
  assert.equal(playedMove('', tree, 'g1f3'), 'e2e4');
  assert.equal(playedMove('/?', tree, 'c7c5'), null);
});

test('playedStyle draws the played move in the mover\'s colour, outlined in the other', () => {
  const { playedStyle } = require('../src/logic.js');
  assert.deepEqual(playedStyle('white'), { color: '#ffffff', outline: '#000000' });
  assert.deepEqual(playedStyle('black'), { color: '#000000', outline: '#ffffff' });
});

test('DEFAULTS show the played move', () => {
  assert.equal(DEFAULTS.playedMove, true);
});

test('DEFAULTS draw the arrows behind the pieces', () => {
  assert.equal(DEFAULTS.underPieces, true);
});

test('depthIn reads the depth from lichess\'s readout, in any wording', () => {
  const { depthIn } = require('../src/logic.js');
  assert.equal(depthIn('Depth 23'), 23);
  assert.equal(depthIn('Profondeur 7'), 7);
  assert.equal(depthIn('Depth 23/99'), 23);
  assert.equal(depthIn('Calculating moves…'), 0);
  assert.equal(depthIn(''), 0);
  assert.equal(depthIn(null), 0);
});

test('withDepth writes another depth into a readout lichess has shown', () => {
  const { withDepth } = require('../src/logic.js');
  assert.equal(withDepth('Depth 30', 29), 'Depth 29');
  assert.equal(withDepth('Profondeur 8', 12), 'Profondeur 12');
  assert.equal(withDepth('Calculating moves…', 29), null);
  assert.equal(withDepth('', 29), null);
  assert.equal(withDepth(undefined, 29), null);
});

// 1. e4 e5 2. Nf3 from the start, as the engine panel writes a line.
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR';
const E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';
const NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R';
const LINE = [`${E4}|e2e4`, `${E5}|e7e5`, `${NF3}|g1f3`];

test('lineDepths: each move into a line has been looked at one less deep', () => {
  const { lineDepths } = require('../src/logic.js');
  assert.deepEqual(lineDepths(START, [LINE], 20), [[`${E4} b`, 19], [`${E5} w`, 18], [`${NF3} b`, 17]]);
});

test('lineDepths files every line of a multi-line search at the depth shown', () => {
  const { lineDepths } = require('../src/logic.js');
  const D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR';
  assert.deepEqual(lineDepths(START, [[LINE[0]], [`${D4}|d2d4`]], 20), [[`${E4} b`, 19], [`${D4} b`, 19]]);
});

test('lineDepths starts from whoever is to move', () => {
  const { lineDepths, positionKey } = require('../src/logic.js');
  const black = `${E4} b KQkq - 0 1`;
  assert.deepEqual(lineDepths(black, [[`${E5}|e7e5`]], 20), [[`${E5} w`, 19]]);
  assert.equal(positionKey(black), `${E4} b`);
});

test('lineDepths stops where the depth runs out, and skips a move it cannot read', () => {
  const { lineDepths } = require('../src/logic.js');
  assert.deepEqual(lineDepths(START, [LINE], 3), [[`${E4} b`, 2], [`${E5} w`, 1]]);
  assert.deepEqual(lineDepths(START, [LINE], 1), []);
  assert.deepEqual(lineDepths(START, [['', LINE[1]]], 20), [[`${E5} w`, 18]]);
  assert.deepEqual(lineDepths('', [LINE], 20), []);
});

test('rememberDepths keeps the deeper look at each position', () => {
  const { rememberDepths } = require('../src/logic.js');
  const memo = new Map();
  rememberDepths(memo, [['a', 20], ['b', 10]]);
  rememberDepths(memo, [['a', 12], ['b', 15]]);
  assert.deepEqual([...memo], [['a', 20], ['b', 15]]);
});

test('rememberDepths lets the positions filed longest ago go first', () => {
  const { rememberDepths } = require('../src/logic.js');
  const memo = rememberDepths(new Map(), [['a', 5], ['b', 5], ['c', 5]], 3);
  // a gets deeper, which files it again, so b is now the oldest.
  rememberDepths(memo, [['a', 6], ['d', 5]], 3);
  assert.deepEqual([...memo.keys()], ['c', 'a', 'd']);
});

test('carriedDepth shows the line\'s depth until this position\'s own search gets there', () => {
  const { carriedDepth, lineDepths, rememberDepths } = require('../src/logic.js');
  const memo = rememberDepths(new Map(), lineDepths(START, [LINE], 20));
  const afterE4 = `${E4} b KQkq - 0 1`;
  assert.equal(carriedDepth(memo, afterE4, 0), 19);
  assert.equal(carriedDepth(memo, afterE4, 12), 19);
  assert.equal(carriedDepth(memo, afterE4, 19), null);
  assert.equal(carriedDepth(memo, afterE4, 23), null);
});

test('carriedDepth knows only positions a line came through, with the same side to move', () => {
  const { carriedDepth, lineDepths, rememberDepths } = require('../src/logic.js');
  const memo = rememberDepths(new Map(), lineDepths(START, [LINE], 20));
  assert.equal(carriedDepth(memo, START, 0), null);
  assert.equal(carriedDepth(memo, `${E4} w KQkq - 0 1`, 0), null);
  assert.equal(carriedDepth(memo, '', 0), null);
});

test('DEFAULTS keep the depth while the engine catches up', () => {
  assert.equal(DEFAULTS.keepDepth, true);
});
