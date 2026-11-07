import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/planner.js');

const { plan } = globalThis.MineCheaterPlanner;

/** Build a flat board from rows such as ['c1c']: digits are open clues, c covered, f flagged. */
function board(rows) {
  const cells = [];
  rows.forEach((row, y) => {
    [...row].forEach((code, x) => {
      if (code === 'c') cells.push({ x, y, state: 'covered' });
      else if (code === 'f') cells.push({ x, y, state: 'flagged' });
      else cells.push({ x, y, state: 'open', clue: Number(code) });
    });
  });
  return { width: rows[0].length, height: rows.length, cells };
}

const sorted = (keys) => [...keys].sort();
const ringAround11 = ['0,0', '1,0', '2,0', '0,1', '2,1', '0,2', '1,2', '2,2'];

test('nf style lists every covered safe cell and never flags or chords', () => {
  const result = plan(board(['ccc', 'c1c', 'ccc']), { safe: ringAround11.slice(1), mines: ['0,0'] }, { style: 'nf' });
  assert.deepEqual(sorted(result.open), sorted(ringAround11.slice(1)));
  assert.deepEqual(result.flag, []);
  assert.deepEqual(result.chord, []);
  assert.equal(result.saved, 0);
});

test('efficient style flags a mine and chords when it opens more than it costs', () => {
  const result = plan(board(['ccc', 'c1c', 'ccc']), { safe: ringAround11.slice(1), mines: ['0,0'] });
  assert.equal(result.style, 'efficient');
  assert.deepEqual(result.flag, ['0,0']);
  assert.deepEqual(result.chord, ['1,1']);
  assert.deepEqual(sorted(result.viaChord), sorted(ringAround11.slice(1)));
  assert.deepEqual(result.open, []);
  assert.equal(result.saved, 5, '7 cells for 1 flag + 1 chord');
});

test('a mine the player already flagged costs nothing', () => {
  const result = plan(board(['fcc', 'c1c', 'ccc']), { safe: ringAround11.slice(1), mines: ['0,0'] });
  assert.deepEqual(result.flag, []);
  assert.deepEqual(result.chord, ['1,1']);
  assert.equal(result.saved, 6);
});

test('an unprofitable chord falls back to direct clicks', () => {
  const result = plan(board(['2c', 'cc']), { safe: ['1,1'], mines: ['1,0', '0,1'] });
  assert.deepEqual(result.chord, []);
  assert.deepEqual(result.flag, []);
  assert.deepEqual(result.open, ['1,1']);
});

test('a chord is never suggested next to an undecided cell', () => {
  const result = plan(board(['ccc', 'c1c', 'ccc']), { safe: ringAround11.slice(1, 6), mines: ['0,0'] });
  assert.deepEqual(result.chord, []);
  assert.deepEqual(sorted(result.open), sorted(ringAround11.slice(1, 6)));
});

test('a wrong flag is reported for removal and blocks chords around it', () => {
  const result = plan(board(['ccc', 'c1c', 'ccf']), { safe: ringAround11.slice(1), mines: ['0,0'] });
  assert.deepEqual(result.unflag, ['2,2']);
  assert.deepEqual(result.chord, []);
  assert.ok(!result.open.includes('2,2'), 'a flagged cell must be unflagged before it can be opened');
});

test('greedy chords reuse flags planned for earlier chords', () => {
  const rows = ['ccccc', 'c1c1c', 'ccccc'];
  const mines = ['2,1'];
  const safe = board(rows).cells
    .filter((cell) => cell.state === 'covered' && `${cell.x},${cell.y}` !== '2,1')
    .map((cell) => `${cell.x},${cell.y}`);
  const result = plan(board(rows), { safe, mines });
  assert.deepEqual(result.flag, ['2,1']);
  assert.deepEqual(sorted(result.chord), ['1,1', '3,1']);
  assert.deepEqual(result.open, []);
  assert.equal(result.saved, 9, '5 + 4: the second chord pays no flag');
});
