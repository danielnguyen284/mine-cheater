/*
 * MineCheaterPlanner
 * ------------------
 * Turns a solver result into a click plan for the player.  Loading this file
 * installs `globalThis.MineCheaterPlanner`; CommonJS callers also receive the
 * API from `require()`.
 *
 *   plan(board, analysis, { style: 'nf' | 'efficient' })
 *
 * `board` uses the solver's flat cell form ({ x, y, state, clue }) and
 * `analysis` is the solver result ({ safe, mines } as "x,y" keys).  Every list
 * in the returned plan holds "x,y" keys:
 *
 *   open     covered safe cells to left-click directly
 *   unflag   flagged cells the solver proved safe (wrong flags)
 *   flag     proven mines worth flagging because a chord pays for them
 *   chord    open number cells to chord once their flags are placed
 *   viaChord safe cells those chords will open
 *   saved    clicks saved compared with left-clicking every safe cell
 *
 * The efficient style is a greedy ZiNi pass restricted to what is already
 * proven: a chord is worth it when the cells it opens outnumber the flags it
 * still needs plus the chord click itself.
 */
(function installMineCheaterPlanner(root, factory) {
  'use strict';

  const api = factory();
  root.MineCheaterPlanner = api;

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlanner() {
  'use strict';

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function neighborKeys(cell, cellsByKey) {
    const keys = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const key = cellKey(cell.x + dx, cell.y + dy);
        if (cellsByKey.has(key)) keys.push(key);
      }
    }
    return keys;
  }

  function isClosed(cell) {
    return cell.state === 'covered' || cell.state === 'flagged';
  }

  /**
   * Price one chord against the current simulated state.  Returns null when
   * chording there is not provably safe: every closed neighbour must be
   * decided, and no wrong flag may skew the site's flag count.
   */
  function priceChord(number, context) {
    const { cellsByKey, safe, mines, flagged, willFlag, toOpen, viaChord } = context;
    const closed = neighborKeys(number, cellsByKey).filter((key) => isClosed(cellsByKey.get(key)));
    if (!closed.length) return null;
    if (closed.some((key) => !safe.has(key) && !mines.has(key))) return null;
    if (closed.some((key) => flagged.has(key) && safe.has(key))) return null;

    const mineKeys = closed.filter((key) => mines.has(key));
    if (mineKeys.length !== number.clue) return null;

    const opens = closed.filter((key) => toOpen.has(key) && !viaChord.has(key));
    const newFlags = mineKeys.filter((key) => !flagged.has(key) && !willFlag.has(key));
    return { opens, newFlags, premium: opens.length - newFlags.length - 1 };
  }

  function plan(board, analysis, options) {
    const style = options && options.style === 'nf' ? 'nf' : 'efficient';
    const cells = Array.isArray(board && board.cells) ? board.cells : [];
    const cellsByKey = new Map(cells.map((cell) => [cellKey(cell.x, cell.y), cell]));
    const safe = new Set(((analysis && analysis.safe) || []).filter((key) => cellsByKey.has(key)));
    const mines = new Set(((analysis && analysis.mines) || []).filter((key) => cellsByKey.has(key)));
    const flagged = new Set(cells.filter((cell) => cell.state === 'flagged').map((cell) => cellKey(cell.x, cell.y)));

    const unflag = [...safe].filter((key) => flagged.has(key));
    const toOpen = new Set([...safe].filter((key) => cellsByKey.get(key).state === 'covered'));
    const result = { style, open: [], unflag, flag: [], chord: [], viaChord: [], saved: 0 };

    if (style === 'nf') {
      result.open = [...toOpen];
      return result;
    }

    const context = { cellsByKey, safe, mines, flagged, willFlag: new Set(), toOpen, viaChord: new Set() };
    const numbers = cells.filter((cell) => cell.state === 'open' && cell.clue > 0);
    const chosen = new Set();

    for (;;) {
      let best = null;
      for (const number of numbers) {
        const key = cellKey(number.x, number.y);
        if (chosen.has(key)) continue;
        const price = priceChord(number, context);
        if (price && price.premium > 0 && (!best || price.premium > best.price.premium)) {
          best = { key, price };
        }
      }
      if (!best) break;

      chosen.add(best.key);
      result.chord.push(best.key);
      result.saved += best.price.premium;
      for (const key of best.price.newFlags) context.willFlag.add(key);
      for (const key of best.price.opens) context.viaChord.add(key);
    }

    result.flag = [...context.willFlag];
    result.viaChord = [...context.viaChord];
    result.open = [...toOpen].filter((key) => !context.viaChord.has(key));
    return result;
  }

  return Object.freeze({
    plan,
    version: '1.0.0'
  });
});
