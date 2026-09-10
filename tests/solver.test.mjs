import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/solver.js');

const { analyze, chooseOpening } = globalThis.MineCheaterSolver;

test('direct clue rules mark guaranteed safe cells and mines', () => {
  const safeResult = analyze({
    width: 2,
    height: 1,
    cells: [[0, 'covered']]
  });
  assert.equal(safeResult.status, 'progress');
  assert.deepEqual(safeResult.safe, ['1,0']);
  assert.deepEqual(safeResult.mines, []);

  const mineResult = analyze({
    width: 2,
    height: 1,
    cells: [[1, 'covered']]
  });
  assert.equal(mineResult.status, 'progress');
  assert.deepEqual(mineResult.safe, []);
  assert.deepEqual(mineResult.mines, ['1,0']);
  assert.equal(mineResult.diagnostics.techniques.direct, 1);
});

test('pre-existing flags remain unknown and a wrong flag can be proven safe', () => {
  const result = analyze({
    width: 2,
    height: 1,
    cells: [[0, 'flagged']]
  });

  assert.equal(result.status, 'progress');
  assert.deepEqual(result.safe, ['1,0']);
  assert.deepEqual(result.mines, []);
});

test('total mine count performs direct whole-board deductions', () => {
  const result = analyze({
    width: 3,
    height: 1,
    totalMines: 0,
    cells: ['covered', 'covered', 'covered']
  });

  assert.equal(result.status, 'progress');
  assert.deepEqual(result.safe, ['0,0', '1,0', '2,0']);
  assert.deepEqual(result.mines, []);
  assert.equal(result.diagnostics.techniques.total, 3);
});

test('global mine count does not explode subset closure on a wide frontier', () => {
  const width = 60;
  const minePattern = Array.from({ length: width }, (_, x) => x % 2 === 0);
  const clues = minePattern.map((_, x) => [x - 1, x, x + 1]
    .filter((neighborX) => neighborX >= 0 && neighborX < width && minePattern[neighborX])
    .length);

  const result = analyze({
    width,
    height: 2,
    totalMines: minePattern.filter(Boolean).length,
    cells: [clues, Array(width).fill('covered')]
  }, { enableExact: false });

  assert.equal(result.status, 'progress');
  assert.equal(result.safe.length, 30);
  assert.equal(result.mines.length, 30);
  assert.equal(result.diagnostics.constraints.closureBudgetExceeded, false);
  assert.ok(result.diagnostics.constraints.derived < 200);
});

test('repeated subset-difference closure solves overlapping clue sets', () => {
  // The bottom clues express A+B=1, A+B+C=1, and B+C=1.  No direct
  // rule applies initially; subset differences prove A/C safe, then B mined.
  const result = analyze({
    width: 3,
    height: 2,
    cells: [
      ['covered', 'covered', 'covered'],
      [1, 1, 1]
    ]
  }, { enableExact: false });

  assert.equal(result.status, 'progress');
  assert.deepEqual(result.safe, ['0,0', '2,0']);
  assert.deepEqual(result.mines, ['1,0']);
  assert.ok(result.diagnostics.constraints.closurePasses >= 2);
  assert.equal(result.diagnostics.techniques.subset, 3);
  assert.equal(result.diagnostics.techniques.exact, 0);
});

test('exact CSP fallback finds a backbone that direct and subset rules miss', () => {
  const board = {
    width: 4,
    height: 4,
    cells: [
      ['covered', 'covered', 'covered', 2],
      [1, 2, 'covered', 'covered'],
      ['covered', 'covered', 'covered', 'covered'],
      ['covered', 'covered', 'covered', 1]
    ]
  };

  const logicalOnly = analyze(board, { enableExact: false, useTotalConstraint: false });
  assert.equal(logicalOnly.status, 'stalled');
  assert.deepEqual(logicalOnly.safe, []);
  assert.deepEqual(logicalOnly.mines, []);

  const exact = analyze(board, {
    useTotalConstraint: false,
    maxCspMs: 1000,
    maxCspNodes: 10000
  });
  assert.equal(exact.status, 'progress');
  assert.deepEqual(exact.safe, ['2,2']);
  assert.deepEqual(exact.mines, ['3,1']);
  assert.equal(exact.diagnostics.techniques.exact, 2);
  assert.equal(exact.diagnostics.exact.solvedComponents, 1);

  // An interrupted enumeration must never turn its partial sample into a move.
  const budgeted = analyze(board, {
    useTotalConstraint: false,
    maxCspNodes: 1,
    maxCspMs: 1000
  });
  assert.equal(budgeted.status, 'stalled');
  assert.deepEqual(budgeted.safe, []);
  assert.deepEqual(budgeted.mines, []);
  assert.equal(budgeted.diagnostics.exact.budgetExceeded, true);
});

test('impossible visible clues return contradiction diagnostics and no moves', () => {
  const result = analyze({
    width: 2,
    height: 1,
    cells: [[2, 'covered']]
  });

  assert.equal(result.status, 'contradiction');
  assert.deepEqual(result.safe, []);
  assert.deepEqual(result.mines, []);
  assert.equal(result.diagnostics.reason, 'invalid-clue-balance');
  assert.match(result.diagnostics.contradictions[0].message, /cannot be satisfied/);
});

test('a pristine board requests an opening without claiming it is logically safe', () => {
  const board = {
    width: 3,
    height: 3,
    cells: Array.from({ length: 9 }, () => ({ state: 'covered' }))
  };
  const result = analyze(board);

  assert.equal(result.status, 'pristine');
  assert.deepEqual(result.safe, []);
  assert.deepEqual(result.mines, []);
  assert.equal(result.opening, '1,1');
  assert.equal(chooseOpening(board), '1,1');
});

test('an ambiguous non-pristine position stalls instead of guessing', () => {
  const result = analyze({
    width: 3,
    height: 1,
    cells: [['covered', 1, 'covered']]
  });

  assert.equal(result.status, 'stalled');
  assert.deepEqual(result.safe, []);
  assert.deepEqual(result.mines, []);
  assert.equal(result.opening, null);
  assert.equal(result.diagnostics.reason, 'no-forced-move');
});
