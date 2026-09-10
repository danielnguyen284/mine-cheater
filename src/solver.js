/*
 * MineCheaterSolver
 * -----------------
 * A side-effect-only, browser-compatible Minesweeper solver.  Loading this file
 * installs `globalThis.MineCheaterSolver`; CommonJS callers also receive the API
 * from `require()`.
 *
 * Board input accepted by `analyze(board, options)`:
 *
 *   {
 *     width: 9,
 *     height: 9,
 *     totalMines: 10,                 // optional
 *     cells: [                        // flat, preferred form
 *       { x: 0, y: 0, state: 'open', clue: 1 },
 *       { x: 1, y: 0, state: 'covered' },
 *       { x: 2, y: 0, state: 'flagged' }
 *     ]
 *   }
 *
 * `cells` may instead be a height-by-width matrix.  Matrix entries may use the
 * same objects, the strings "covered"/"flagged", or numbers 0..8 for open
 * clues.  Every coordinate must be represented exactly once in the flat form.
 *
 * The result's `safe` and `mines` arrays contain stable "x,y" keys.  Matching
 * coordinate objects are available as `safeCells` and `mineCells`.  A flagged
 * cell remains an unknown variable: flags are UI annotations, not trusted facts,
 * so a mistaken flag can appear in `safe` and be removed by the controller.
 * `opening` is only a bootstrap suggestion for a pristine board; it is
 * deliberately not included in `safe`, because it is not a logical deduction.
 */
(function installMineCheaterSolver(root, factory) {
  'use strict';

  const api = factory();
  root.MineCheaterSolver = api;

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSolver() {
  'use strict';

  const DEFAULT_OPTIONS = Object.freeze({
    enableExact: true,
    useTotalConstraint: true,
    maxLogicPasses: 100,
    maxDerivedConstraints: 2500,
    maxCspVariables: 28,
    maxCspNodes: 300000,
    maxCspSolutions: 200000,
    maxCspMs: 120,
    openingStrategy: 'center'
  });

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function coordinatesFor(id, width) {
    return { x: id % width, y: Math.floor(id / width) };
  }

  function canonicalState(value) {
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= 0 && value <= 8) {
        return { state: 'open', clue: value };
      }
      throw new TypeError(`Invalid numeric cell value: ${value}`);
    }

    if (value == null) return { state: 'covered' };

    if (typeof value === 'string') {
      const state = value.toLowerCase();
      if (state === 'covered' || state === 'hidden' || state === 'unknown' || state === 'closed') {
        return { state: 'covered' };
      }
      if (state === 'flagged' || state === 'flag' || state === 'marked' || state === 'mine') {
        return { state: 'flagged' };
      }
      throw new TypeError(`Invalid cell state: ${value}`);
    }

    if (typeof value !== 'object') {
      throw new TypeError('Each board cell must be an object, a state string, or a clue number');
    }

    if (value.flagged === true) return { state: 'flagged' };

    let state = value.state == null ? value.status : value.state;
    if (state == null && (value.revealed === true || value.open === true || value.clue != null)) {
      state = 'open';
    }
    if (typeof state === 'string') state = state.toLowerCase();

    if (state === 'flagged' || state === 'flag' || state === 'marked' || state === 'mine') {
      return { state: 'flagged' };
    }
    if (state === 'covered' || state === 'hidden' || state === 'unknown' || state === 'closed') {
      return { state: 'covered' };
    }
    if (state === 'open' || state === 'revealed' || state === 'clear') {
      const clue = Number(value.clue == null ? value.value : value.clue);
      if (!Number.isInteger(clue) || clue < 0 || clue > 8) {
        throw new TypeError(`Open cell must have an integer clue from 0 to 8; got ${String(value.clue)}`);
      }
      return { state: 'open', clue };
    }

    throw new TypeError(`Invalid cell state: ${String(state)}`);
  }

  function normalizeBoard(board) {
    if (!board || typeof board !== 'object') throw new TypeError('board must be an object');

    let width = Number(board.width);
    let height = Number(board.height);
    const source = board.cells;
    if (!Array.isArray(source)) throw new TypeError('board.cells must be an array');

    const isMatrix = source.length > 0 && Array.isArray(source[0]);
    if (isMatrix) {
      if (!Number.isInteger(height) || height <= 0) height = source.length;
      if (!Number.isInteger(width) || width <= 0) width = source[0].length;
    }
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new TypeError('board.width and board.height must be positive integers');
    }

    const cells = new Array(width * height);
    if (isMatrix) {
      if (source.length !== height) throw new TypeError('board.cells matrix height does not match board.height');
      for (let y = 0; y < height; y += 1) {
        if (!Array.isArray(source[y]) || source[y].length !== width) {
          throw new TypeError(`board.cells row ${y} does not match board.width`);
        }
        for (let x = 0; x < width; x += 1) {
          cells[y * width + x] = canonicalState(source[y][x]);
        }
      }
    } else {
      if (source.length !== width * height) {
        throw new TypeError('Flat board.cells must contain exactly width * height entries');
      }
      for (let index = 0; index < source.length; index += 1) {
        const raw = source[index];
        const hasCoordinates = raw && typeof raw === 'object' && raw.x != null && raw.y != null;
        const x = hasCoordinates ? Number(raw.x) : index % width;
        const y = hasCoordinates ? Number(raw.y) : Math.floor(index / width);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
          throw new TypeError(`Cell ${index} has coordinates outside the board`);
        }
        const id = y * width + x;
        if (cells[id] !== undefined) throw new TypeError(`Duplicate cell coordinate ${cellKey(x, y)}`);
        cells[id] = canonicalState(raw);
      }
      if (cells.some((cell) => cell === undefined)) {
        throw new TypeError('Flat board.cells must represent every coordinate exactly once');
      }
    }

    let totalMines = null;
    if (board.totalMines != null) {
      totalMines = Number(board.totalMines);
      if (!Number.isInteger(totalMines) || totalMines < 0 || totalMines > width * height) {
        throw new TypeError('board.totalMines must be an integer within the board area');
      }
    }

    return { width, height, totalMines, cells };
  }

  function neighborIds(id, width, height) {
    const x = id % width;
    const y = Math.floor(id / width);
    const result = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
      }
    }
    return result;
  }

  function newDiagnostics() {
    return {
      reason: null,
      contradictions: [],
      techniques: { direct: 0, subset: 0, exact: 0, total: 0 },
      constraints: { initial: 0, derived: 0, closurePasses: 0, closureBudgetExceeded: false },
      exact: {
        components: 0,
        solvedComponents: 0,
        skippedComponents: 0,
        nodes: 0,
        solutions: 0,
        budgetExceeded: false
      }
    };
  }

  function recordContradiction(diagnostics, code, message, extra) {
    const item = Object.assign({ code, message }, extra || {});
    diagnostics.contradictions.push(item);
    if (!diagnostics.reason) diagnostics.reason = code;
  }

  function buildClueConstraints(board, variableIds, diagnostics) {
    const constraints = [];
    let openCount = 0;

    for (const cell of board.cells) {
      if (cell.state === 'open') openCount += 1;
    }

    for (let id = 0; id < board.cells.length; id += 1) {
      const cell = board.cells[id];
      if (cell.state !== 'open') continue;
      const unknown = [];
      for (const neighbor of neighborIds(id, board.width, board.height)) {
        const neighborCell = board.cells[neighbor];
        // A flag is not evidence.  Treat it exactly like any other unopened
        // cell so stale or user-authored flags can be disproved safely.
        if (neighborCell.state !== 'open') unknown.push(neighbor);
      }
      const count = cell.clue;
      if (count < 0 || count > unknown.length) {
        const at = coordinatesFor(id, board.width);
        recordContradiction(
          diagnostics,
          'invalid-clue-balance',
          `Clue ${cell.clue} at ${cellKey(at.x, at.y)} cannot be satisfied`,
          { cell: cellKey(at.x, at.y), remainingMines: count, coveredNeighbors: unknown.length }
        );
      } else if (unknown.length === 0) {
        if (count !== 0) {
          const at = coordinatesFor(id, board.width);
          recordContradiction(
            diagnostics,
            'unsatisfied-closed-clue',
            `Clue at ${cellKey(at.x, at.y)} has no covered neighbors but still needs ${count} mine(s)`,
            { cell: cellKey(at.x, at.y) }
          );
        }
      } else {
        constraints.push({ vars: unknown, count, kind: 'direct' });
      }
    }

    if (board.totalMines != null) {
      if (board.totalMines > variableIds.length) {
        recordContradiction(
          diagnostics,
          'invalid-total-mine-balance',
          `Total mine count cannot fit the unopened cells`,
          { totalMines: board.totalMines, unopened: variableIds.length }
        );
      }
    }

    return { constraints, openCount };
  }

  function sortedUnique(values) {
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  function varsKey(vars) {
    return vars.join(',');
  }

  function isSubset(small, bigSet) {
    for (const value of small) {
      if (!bigSet.has(value)) return false;
    }
    return true;
  }

  function runLogicalClosure(rawConstraints, assignments, options, diagnostics) {
    let constraints = rawConstraints.map((constraint) => ({
      vars: sortedUnique(constraint.vars),
      count: constraint.count,
      kind: constraint.kind || 'direct'
    }));
    let pass = 0;
    let derivedCount = diagnostics.constraints.derived;

    function assign(id, value, technique) {
      if (assignments.has(id)) {
        if (assignments.get(id) !== value) {
          recordContradiction(
            diagnostics,
            'conflicting-deduction',
            `Cell ${id} was deduced as both safe and mined`,
            { id }
          );
        }
        return false;
      }
      assignments.set(id, value);
      diagnostics.techniques[technique] += 1;
      return true;
    }

    while (pass < options.maxLogicPasses && diagnostics.contradictions.length === 0) {
      pass += 1;
      diagnostics.constraints.closurePasses += 1;
      let assignmentChanged = false;
      const indexed = new Map();

      for (const original of constraints) {
        let count = original.count;
        const vars = [];
        for (const id of original.vars) {
          if (assignments.has(id)) count -= assignments.get(id);
          else vars.push(id);
        }

        if (count < 0 || count > vars.length) {
          recordContradiction(
            diagnostics,
            'constraint-out-of-range',
            `A constraint requires ${count} mines in ${vars.length} cells`,
            { count, cells: vars.slice() }
          );
          break;
        }
        if (vars.length === 0) {
          if (count !== 0) {
            recordContradiction(diagnostics, 'empty-unsatisfied-constraint', 'An empty constraint is unsatisfied');
            break;
          }
          continue;
        }

        const key = varsKey(vars);
        const previous = indexed.get(key);
        if (previous && previous.count !== count) {
          recordContradiction(
            diagnostics,
            'inconsistent-constraints',
            `The same cells are required to contain both ${previous.count} and ${count} mines`,
            { cells: vars.slice() }
          );
          break;
        }
        if (!previous || (previous.kind !== 'subset' && original.kind === 'subset')) {
          indexed.set(key, { vars, count, kind: original.kind });
        }
      }
      if (diagnostics.contradictions.length) break;

      constraints = Array.from(indexed.values());
      for (const constraint of constraints) {
        if (constraint.count !== 0 && constraint.count !== constraint.vars.length) continue;
        const value = constraint.count === 0 ? 0 : 1;
        const technique = constraint.kind === 'total' ? 'total' : constraint.kind === 'subset' ? 'subset' : 'direct';
        for (const id of constraint.vars) {
          if (assign(id, value, technique)) assignmentChanged = true;
        }
      }
      if (diagnostics.contradictions.length) break;
      if (assignmentChanged) continue;

      let added = false;
      const known = new Map(indexed);
      outer:
      for (let i = 0; i < constraints.length; i += 1) {
        const left = constraints[i];
        const leftSet = new Set(left.vars);
        for (let j = i + 1; j < constraints.length; j += 1) {
          const right = constraints[j];
          const rightSet = new Set(right.vars);
          let small;
          let large;
          let largeSet;

          if (left.vars.length < right.vars.length && isSubset(left.vars, rightSet)) {
            small = left;
            large = right;
            largeSet = rightSet;
          } else if (right.vars.length < left.vars.length && isSubset(right.vars, leftSet)) {
            small = right;
            large = left;
            largeSet = leftSet;
          } else {
            continue;
          }

          const smallSet = new Set(small.vars);
          const difference = [];
          for (const id of largeSet) {
            if (!smallSet.has(id)) difference.push(id);
          }
          difference.sort((a, b) => a - b);
          const count = large.count - small.count;
          if (count < 0 || count > difference.length) {
            recordContradiction(
              diagnostics,
              'invalid-subset-difference',
              `Subset constraints imply ${count} mines in ${difference.length} cells`,
              { cells: difference.slice(), count }
            );
            break outer;
          }
          if (difference.length === 0) {
            if (count !== 0) {
              recordContradiction(diagnostics, 'inconsistent-subset', 'Equal constraints disagree on mine count');
              break outer;
            }
            continue;
          }

          const key = varsKey(difference);
          const previous = known.get(key);
          if (previous && previous.count !== count) {
            recordContradiction(
              diagnostics,
              'inconsistent-derived-constraint',
              `A derived constraint conflicts with an existing constraint`,
              { cells: difference.slice(), existing: previous.count, derived: count }
            );
            break outer;
          }
          if (!previous) {
            if (derivedCount >= options.maxDerivedConstraints) {
              diagnostics.constraints.closureBudgetExceeded = true;
              break outer;
            }
            const derived = { vars: difference, count, kind: 'subset' };
            known.set(key, derived);
            constraints.push(derived);
            derivedCount += 1;
            diagnostics.constraints.derived = derivedCount;
            added = true;
          }
        }
      }
      if (diagnostics.contradictions.length || !added || diagnostics.constraints.closureBudgetExceeded) break;
    }

    if (pass >= options.maxLogicPasses) diagnostics.constraints.closureBudgetExceeded = true;
    return constraints;
  }

  function simplifiedClueConstraints(rawConstraints, assignments, diagnostics) {
    const result = [];
    const indexed = new Map();
    for (const original of rawConstraints) {
      let count = original.count;
      const vars = [];
      for (const id of original.vars) {
        if (assignments.has(id)) count -= assignments.get(id);
        else vars.push(id);
      }
      if (count < 0 || count > vars.length) {
        recordContradiction(
          diagnostics,
          'constraint-out-of-range',
          `A clue constraint requires ${count} mines in ${vars.length} cells`,
          { cells: vars.slice(), count }
        );
        return [];
      }
      if (vars.length === 0) continue;
      vars.sort((a, b) => a - b);
      const key = varsKey(vars);
      const previous = indexed.get(key);
      if (previous && previous.count !== count) {
        recordContradiction(diagnostics, 'inconsistent-constraints', 'Equivalent clue constraints disagree');
        return [];
      }
      if (!previous) {
        const constraint = { vars, count };
        indexed.set(key, constraint);
        result.push(constraint);
      }
    }
    return result;
  }

  function constraintComponents(constraints) {
    const byVariable = new Map();
    constraints.forEach((constraint, constraintIndex) => {
      for (const id of constraint.vars) {
        if (!byVariable.has(id)) byVariable.set(id, []);
        byVariable.get(id).push(constraintIndex);
      }
    });

    const seenVariables = new Set();
    const components = [];
    for (const start of byVariable.keys()) {
      if (seenVariables.has(start)) continue;
      const variableQueue = [start];
      const variables = [];
      const constraintIndexes = new Set();
      seenVariables.add(start);
      for (let cursor = 0; cursor < variableQueue.length; cursor += 1) {
        const variable = variableQueue[cursor];
        variables.push(variable);
        for (const constraintIndex of byVariable.get(variable) || []) {
          if (constraintIndexes.has(constraintIndex)) continue;
          constraintIndexes.add(constraintIndex);
          for (const neighborVariable of constraints[constraintIndex].vars) {
            if (!seenVariables.has(neighborVariable)) {
              seenVariables.add(neighborVariable);
              variableQueue.push(neighborVariable);
            }
          }
        }
      }
      components.push({
        variables,
        constraints: Array.from(constraintIndexes, (index) => constraints[index])
      });
    }
    return components;
  }

  function enumerateComponent(component, options, context) {
    const variables = component.variables.slice();
    const degree = new Map(variables.map((id) => [id, 0]));
    for (const constraint of component.constraints) {
      for (const id of constraint.vars) degree.set(id, degree.get(id) + 1);
    }
    variables.sort((a, b) => degree.get(b) - degree.get(a) || a - b);

    const localIndex = new Map(variables.map((id, index) => [id, index]));
    const constraints = component.constraints.map((constraint) => ({
      vars: constraint.vars.map((id) => localIndex.get(id)),
      target: constraint.count,
      mines: 0,
      remaining: constraint.vars.length
    }));
    const attached = Array.from({ length: variables.length }, () => []);
    constraints.forEach((constraint, constraintIndex) => {
      for (const variableIndex of constraint.vars) attached[variableIndex].push(constraintIndex);
    });

    const values = new Uint8Array(variables.length);
    const mineOccurrences = new Array(variables.length).fill(0);
    let solutions = 0;
    let aborted = false;

    function overBudget() {
      return context.nodes >= options.maxCspNodes || Date.now() - context.startedAt > options.maxCspMs;
    }

    function search(depth) {
      if (aborted) return;
      if (overBudget() || solutions >= options.maxCspSolutions) {
        aborted = true;
        return;
      }
      context.nodes += 1;

      if (depth === variables.length) {
        solutions += 1;
        for (let index = 0; index < values.length; index += 1) {
          if (values[index] === 1) mineOccurrences[index] += 1;
        }
        return;
      }

      for (let value = 0; value <= 1; value += 1) {
        values[depth] = value;
        let valid = true;
        for (const constraintIndex of attached[depth]) {
          const constraint = constraints[constraintIndex];
          constraint.remaining -= 1;
          constraint.mines += value;
          if (constraint.mines > constraint.target || constraint.mines + constraint.remaining < constraint.target) {
            valid = false;
          }
        }
        if (valid) search(depth + 1);
        for (const constraintIndex of attached[depth]) {
          const constraint = constraints[constraintIndex];
          constraint.mines -= value;
          constraint.remaining += 1;
        }
        if (aborted) return;
      }
    }

    search(0);
    return { variables, solutions, mineOccurrences, aborted };
  }

  function runExactFallback(rawClueConstraints, assignments, options, diagnostics) {
    const constraints = simplifiedClueConstraints(rawClueConstraints, assignments, diagnostics);
    if (diagnostics.contradictions.length) return false;
    const components = constraintComponents(constraints);
    diagnostics.exact.components += components.length;
    const context = { nodes: 0, startedAt: Date.now() };
    let changed = false;

    for (const component of components) {
      if (component.variables.length > options.maxCspVariables) {
        diagnostics.exact.skippedComponents += 1;
        continue;
      }
      const result = enumerateComponent(component, options, context);
      diagnostics.exact.solutions += result.solutions;
      if (result.aborted) {
        diagnostics.exact.skippedComponents += 1;
        diagnostics.exact.budgetExceeded = true;
        break;
      }
      diagnostics.exact.solvedComponents += 1;
      if (result.solutions === 0) {
        recordContradiction(
          diagnostics,
          'exact-unsatisfiable',
          'The visible clues have no mutually consistent mine placement',
          { cells: result.variables.slice() }
        );
        break;
      }
      for (let index = 0; index < result.variables.length; index += 1) {
        let value = null;
        if (result.mineOccurrences[index] === 0) value = 0;
        else if (result.mineOccurrences[index] === result.solutions) value = 1;
        if (value == null) continue;
        const id = result.variables[index];
        if (assignments.has(id) && assignments.get(id) !== value) {
          recordContradiction(diagnostics, 'conflicting-exact-deduction', 'Exact solving conflicts with a prior deduction', { id });
          break;
        }
        if (!assignments.has(id)) {
          assignments.set(id, value);
          diagnostics.techniques.exact += 1;
          changed = true;
        }
      }
      if (diagnostics.contradictions.length) break;
    }
    diagnostics.exact.nodes += context.nodes;
    return changed;
  }

  function chooseOpeningFromNormalized(board, strategy) {
    const covered = [];
    for (let id = 0; id < board.cells.length; id += 1) {
      if (board.cells[id].state === 'covered') covered.push(id);
    }
    if (covered.length === 0) return null;
    if (typeof strategy === 'function') {
      const cells = covered.map((id) => coordinatesFor(id, board.width));
      const selected = strategy(cells, { width: board.width, height: board.height });
      if (typeof selected === 'string') {
        const valid = cells.some((cell) => cellKey(cell.x, cell.y) === selected);
        if (valid) return selected;
      }
      if (selected && Number.isInteger(selected.x) && Number.isInteger(selected.y)) {
        const valid = cells.some((cell) => cell.x === selected.x && cell.y === selected.y);
        if (valid) return cellKey(selected.x, selected.y);
      }
    }
    if (strategy === 'corner') {
      const first = coordinatesFor(covered[0], board.width);
      return cellKey(first.x, first.y);
    }

    const centerX = (board.width - 1) / 2;
    const centerY = (board.height - 1) / 2;
    covered.sort((left, right) => {
      const a = coordinatesFor(left, board.width);
      const b = coordinatesFor(right, board.width);
      const distanceA = (a.x - centerX) ** 2 + (a.y - centerY) ** 2;
      const distanceB = (b.x - centerX) ** 2 + (b.y - centerY) ** 2;
      return distanceA - distanceB || left - right;
    });
    const selected = coordinatesFor(covered[0], board.width);
    return cellKey(selected.x, selected.y);
  }

  function contradictionResult(board, diagnostics, openCount) {
    return {
      status: 'contradiction',
      safe: [],
      mines: [],
      safeCells: [],
      mineCells: [],
      opening: openCount === 0 ? chooseOpeningFromNormalized(board, 'center') : null,
      diagnostics
    };
  }

  /*
   * The all-board mine equation is useful at the end of a game, but feeding a
   * hundreds-of-cells set into pairwise subset closure creates thousands of
   * mathematically valid complement constraints with almost no practical
   * value.  Keep the global rule separate: it is decisive exactly when every
   * still-unassigned cell must be safe or every one must be a mine.
   */
  function applyTotalDeductions(variableIds, totalMines, assignments, diagnostics) {
    let assignedMines = 0;
    const unknown = [];
    for (const id of variableIds) {
      if (!assignments.has(id)) unknown.push(id);
      else if (assignments.get(id) === 1) assignedMines += 1;
    }

    const remaining = totalMines - assignedMines;
    if (remaining < 0 || remaining > unknown.length) {
      recordContradiction(
        diagnostics,
        'invalid-total-mine-balance',
        `The total mine count requires ${remaining} mines in ${unknown.length} unassigned cells`,
        { totalMines, assignedMines, unassigned: unknown.length }
      );
      return false;
    }

    if (unknown.length === 0 || (remaining !== 0 && remaining !== unknown.length)) return false;
    const value = remaining === 0 ? 0 : 1;
    for (const id of unknown) {
      assignments.set(id, value);
      diagnostics.techniques.total += 1;
    }
    return unknown.length > 0;
  }

  function analyze(inputBoard, inputOptions) {
    const options = Object.assign({}, DEFAULT_OPTIONS, inputOptions || {});
    // Older controller drafts used "Exact" names; keep the aliases harmlessly
    // compatible while exposing the CSP names as the canonical API.
    if (inputOptions && inputOptions.maxCspMs == null && inputOptions.maxExactMillis != null) {
      options.maxCspMs = inputOptions.maxExactMillis;
    }
    if (inputOptions && inputOptions.maxCspNodes == null && inputOptions.maxExactNodes != null) {
      options.maxCspNodes = inputOptions.maxExactNodes;
    }
    const board = normalizeBoard(inputBoard);
    const diagnostics = newDiagnostics();
    const variableIds = [];
    for (let id = 0; id < board.cells.length; id += 1) {
      if (board.cells[id].state !== 'open') variableIds.push(id);
    }

    const built = buildClueConstraints(board, variableIds, diagnostics);
    const clueConstraints = built.constraints;
    diagnostics.constraints.initial = clueConstraints.length;
    if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);

    const assignments = new Map();
    runLogicalClosure(clueConstraints, assignments, options, diagnostics);
    if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);

    if (options.useTotalConstraint && board.totalMines != null) {
      const totalChanged = applyTotalDeductions(variableIds, board.totalMines, assignments, diagnostics);
      if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);
      if (totalChanged) {
        runLogicalClosure(clueConstraints, assignments, options, diagnostics);
        if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);
      }
    }

    if (options.enableExact) {
      const exactChanged = runExactFallback(clueConstraints, assignments, options, diagnostics);
      if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);
      if (exactChanged) {
        runLogicalClosure(clueConstraints, assignments, options, diagnostics);
        if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);
        if (options.useTotalConstraint && board.totalMines != null) {
          const totalChanged = applyTotalDeductions(variableIds, board.totalMines, assignments, diagnostics);
          if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);
          if (totalChanged) {
            runLogicalClosure(clueConstraints, assignments, options, diagnostics);
            if (diagnostics.contradictions.length) return contradictionResult(board, diagnostics, built.openCount);
          }
        }
      }
    }

    const safeIds = [];
    const mineIds = [];
    for (const [id, value] of assignments) {
      if (board.cells[id].state === 'open') continue;
      if (value === 0) safeIds.push(id);
      else mineIds.push(id);
    }
    safeIds.sort((a, b) => a - b);
    mineIds.sort((a, b) => a - b);

    const safeCells = safeIds.map((id) => coordinatesFor(id, board.width));
    const mineCells = mineIds.map((id) => coordinatesFor(id, board.width));
    const hasProgress = safeIds.length > 0 || mineIds.length > 0;
    let status;
    if (hasProgress) status = 'progress';
    else if (built.openCount === 0) status = 'pristine';
    else status = 'stalled';

    if (!diagnostics.reason) {
      diagnostics.reason = status === 'progress'
        ? 'logical-deductions-found'
        : status === 'pristine'
          ? 'opening-required'
          : 'no-forced-move';
    }

    return {
      status,
      safe: safeCells.map((cell) => cellKey(cell.x, cell.y)),
      mines: mineCells.map((cell) => cellKey(cell.x, cell.y)),
      safeCells,
      mineCells,
      opening: status === 'pristine' ? chooseOpeningFromNormalized(board, options.openingStrategy) : null,
      diagnostics
    };
  }

  function chooseOpening(inputBoard, strategy) {
    return chooseOpeningFromNormalized(normalizeBoard(inputBoard), strategy || 'center');
  }

  return Object.freeze({
    analyze,
    chooseOpening,
    cellKey,
    version: '1.0.0'
  });
});
