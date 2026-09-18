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
