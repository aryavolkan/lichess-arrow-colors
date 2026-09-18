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
