const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCgHash, pvKeys, rankArrows, colorForRank, DEFAULTS } = require('../src/logic.js');

test('parseCgHash extracts orig, dest and brush from a chessground hash', () => {
  assert.deepEqual(parseCgHash('512,512,1,e2,e4,paleBlue'), { orig: 'e2', dest: 'e4', brush: 'paleBlue' });
  assert.deepEqual(parseCgHash('512,512,true,2,g1,f3,paleGrey,12'), { orig: 'g1', dest: 'f3', brush: 'paleGrey' });
  assert.deepEqual(parseCgHash('512,512,pendingErase,1,d2,d4,paleGrey,-,8'), { orig: 'd2', dest: 'd4', brush: 'paleGrey' });
});

test('parseCgHash handles circles (no dest) and junk', () => {
  assert.deepEqual(parseCgHash('512,512,1,e4,paleBlue'), { orig: 'e4', dest: null, brush: 'paleBlue' });
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
