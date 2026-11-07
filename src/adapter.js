/*
 * MineCheaterAdapter
 * ------------------
 * A small, read-only view of minesweeper.online's rendered board.  It never
 * dispatches events to the page; the player makes every click.  Cell state is
 * inferred from semantic suffixes used by every site skin; no concrete skin
 * name is baked in here.
 */
(function installMineCheaterAdapter(root, factory) {
  'use strict';

  const api = factory(root);
  root.MineCheaterAdapter = api;

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAdapter(globalRoot) {
  'use strict';

  const CELL_SELECTOR = '[data-x][data-y]';
  const PRIMARY_ROOT_ID = 'CellsBlock';
  const NUMBER_CLASS_RE = /(?:^|_)type(0|[1-8]|10|11|12)$/;
  const CLOSED_CLASS_RE = /(?:^|_)closed(?:_flag)?$/;
  const OPENED_CLASS_RE = /(?:^|_)opened$/;
  const FLAG_CLASS_RE = /(?:^|_)flag$/;
  const COUNTER_CLASS_RE = /(?:^|_)top-area-num(-|[0-9])$/;
  const FACE_WIN_RE = /(?:^|_)top-area-face-win$/;
  const FACE_LOSE_RE = /(?:^|_)top-area-face-lose$/;

  function classTokens(value) {
    if (value == null) return [];
    if (typeof value === 'string') return value.trim().split(/\s+/).filter(Boolean);
    if (typeof value.baseVal === 'string') return value.baseVal.trim().split(/\s+/).filter(Boolean);
    if (typeof value.value === 'string') return value.value.trim().split(/\s+/).filter(Boolean);
    if (typeof value[Symbol.iterator] === 'function') return Array.from(value, String);
    return String(value).trim().split(/\s+/).filter(Boolean);
  }

  function tokensForElement(element) {
    if (!element) return [];
    if (element.classList && typeof element.classList[Symbol.iterator] === 'function') {
      return Array.from(element.classList, String);
    }
    return classTokens(element.className == null && element.getAttribute
      ? element.getAttribute('class')
      : element.className);
  }

  /**
   * Convert a skin-specific class string into a canonical solver state.
   * The site emits pairs such as `hd_opened hd_type3` and
   * `xpd_closed xpd_flag`; only the stable suffix is inspected.
   */
  function parseCellClass(className) {
    const tokens = classTokens(className);
    let closed = false;
    let opened = false;
    let flagged = false;
    let clue = null;
    let rawType = null;

    for (const token of tokens) {
      if (CLOSED_CLASS_RE.test(token)) closed = true;
      if (OPENED_CLASS_RE.test(token)) opened = true;
      // `*_closed_flag` is the quick-action skin for every covered cell.  A
      // real flag is represented by its own `*_flag` token alongside it.
      if (FLAG_CLASS_RE.test(token) && !/(?:^|_)closed_flag$/.test(token)) flagged = true;
      const typeMatch = token.match(NUMBER_CLASS_RE);
      if (typeMatch) {
        rawType = Number(typeMatch[1]);
        if (rawType >= 0 && rawType <= 8) clue = rawType;
      }
    }

    const mine = rawType === 10 || rawType === 11;
    const exploded = rawType === 11;
    const wrongFlag = rawType === 12;
    let state = 'unknown';
    if (wrongFlag) state = 'wrong-flag';
    else if (exploded) state = 'exploded';
    else if (mine) state = 'mine';
    else if (flagged) state = 'flagged';
    else if (opened || clue !== null) state = 'open';
    else if (closed) state = 'covered';

    return {
      state,
      clue,
      value: clue,
      rawType,
      closed,
      covered: state === 'covered',
      opened: state === 'open',
      open: state === 'open',
      flagged: state === 'flagged',
      mine,
      exploded,
      wrongFlag
    };
  }

  function readCoordinate(element, name) {
    if (!element || typeof element.getAttribute !== 'function') return null;
    const value = Number(element.getAttribute(`data-${name}`));
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function parseCellElement(element) {
    const x = readCoordinate(element, 'x');
    const y = readCoordinate(element, 'y');
    if (x === null || y === null) return null;

    const parsed = parseCellClass(tokensForElement(element));
    const start = tokensForElement(element).includes('start');
    const startActive = tokensForElement(element).includes('start-active');
    return Object.assign(parsed, {
      x,
      y,
      key: `${x},${y}`,
      start,
      startActive,
      element
    });
  }

  function safeQuerySelector(scope, selector) {
    if (!scope || typeof scope.querySelector !== 'function') return null;
    try {
      return scope.querySelector(selector);
    } catch {
      return null;
    }
  }

  function safeQuerySelectorAll(scope, selector) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return [];
    try {
      return Array.from(scope.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function getPrimaryRoot(documentLike) {
    if (!documentLike) return null;
    if (documentLike.id === PRIMARY_ROOT_ID) return documentLike;
    if (typeof documentLike.getElementById === 'function') {
      const byId = documentLike.getElementById(PRIMARY_ROOT_ID);
      if (byId) return byId;
    }
    return safeQuerySelector(documentLike, `#${PRIMARY_ROOT_ID}`);
  }

  function hasActiveClass(element) {
    return tokensForElement(element).includes('active');
  }

  function isAriaCurrent(element) {
    if (!element || typeof element.getAttribute !== 'function') return false;
    const current = element.getAttribute('aria-current');
    return current === 'page' || current === 'true';
  }

  /** Read the site's active navigation marker, with a route fallback while the SPA loads. */
  function detectNoGuessing(documentLike) {
    if (!documentLike) return false;

    const direct = safeQuerySelector(
      documentLike,
      '.link_new_game_ng.active, .navbar-ng.active, .navbar-ng .active, '
        + '[aria-current="page"].link_new_game_ng, [aria-current="page"][href*="/new-game/ng"]'
    );
    if (direct) return true;

    const candidates = safeQuerySelectorAll(documentLike, '.link_new_game_ng');
    for (const candidate of candidates) {
      if (hasActiveClass(candidate) || isAriaCurrent(candidate)) return true;
      if (typeof candidate.closest === 'function') {
        const activeParent = candidate.closest('.active');
        if (activeParent) return true;
      }
    }

    const pathname = documentLike.location && typeof documentLike.location.pathname === 'string'
      ? documentLike.location.pathname
      : '';
    return /(?:^|\/)new-game\/ng(?:\/|$)/.test(pathname);
  }

  function readCounterDigit(element) {
    if (!element) return null;

    if (element.dataset && /^[-0-9]$/.test(String(element.dataset.digit || ''))) {
      return String(element.dataset.digit);
    }

    for (const token of tokensForElement(element)) {
      const match = token.match(COUNTER_CLASS_RE);
      if (match) return match[1];
    }

    const text = typeof element.textContent === 'string' ? element.textContent.trim() : '';
    if (/^[-0-9]$/.test(text)) return text;
    return null;
  }

  /** Return the displayed remaining-mine counter, including negative values. */
  function readMineCounter(documentLike) {
    if (!documentLike) return null;
    const byId = (id) => {
      if (typeof documentLike.getElementById === 'function') {
        const element = documentLike.getElementById(id);
        if (element) return element;
      }
      return safeQuerySelector(documentLike, `#${id}`);
    };

    const digits = [
      readCounterDigit(byId('top_area_mines_100')),
      readCounterDigit(byId('top_area_mines_10')),
      readCounterDigit(byId('top_area_mines_1'))
    ];
    if (digits.some((digit) => digit === null)) return null;

    const rendered = digits.join('');
    if (/^-\d\d$/.test(rendered)) return -Number(rendered.slice(1));
    if (/^\d{3}$/.test(rendered)) return Number(rendered);
    return null;
  }

  function readFaceOutcome(documentLike) {
    if (!documentLike) return null;
    const face = typeof documentLike.getElementById === 'function'
      ? documentLike.getElementById('top_area_face')
      : safeQuerySelector(documentLike, '#top_area_face');
    if (!face) return null;
    const tokens = tokensForElement(face);
    if (tokens.some((token) => FACE_LOSE_RE.test(token))) return 'lost';
    if (tokens.some((token) => FACE_WIN_RE.test(token))) return 'won';
    return null;
  }

  function hasRandomizedClueSkin(documentLike) {
    if (!documentLike) return false;
    const game = typeof documentLike.getElementById === 'function'
      ? documentLike.getElementById('game')
      : safeQuerySelector(documentLike, '#game');
    if (!game) return false;
    return tokensForElement(game).some((token) => /^skin_(?:rc|rcd|alr|alrd|gsr)$/.test(token));
  }

  function readSnapshot(documentLike) {
    const doc = documentLike || globalRoot.document;
    const boardRoot = getPrimaryRoot(doc);
    if (!boardRoot) {
      return {
        root: null,
        cells: [],
        width: 0,
        height: 0,
        openCount: 0,
        coveredCount: 0,
        flaggedCount: 0,
        startCell: null,
        isNoGuessing: detectNoGuessing(doc),
        mineRemaining: readMineCounter(doc),
        mineTotal: null,
        totalMines: null,
        outcome: 'missing',
        won: false,
        lost: false,
        unsupportedReason: null
      };
    }

    const rawElements = safeQuerySelectorAll(boardRoot, CELL_SELECTOR);
    const coordinateMap = new Map();
    let invalidCoordinates = false;
    let duplicateCoordinates = false;

    for (const element of rawElements) {
      const cell = parseCellElement(element);
      if (!cell) {
        invalidCoordinates = true;
        continue;
      }
      if (coordinateMap.has(cell.key)) {
        duplicateCoordinates = true;
        continue;
      }
      coordinateMap.set(cell.key, cell);
    }

    const cells = Array.from(coordinateMap.values()).sort((left, right) => left.y - right.y || left.x - right.x);
    const width = cells.length ? Math.max(...cells.map((cell) => cell.x)) + 1 : 0;
    const height = cells.length ? Math.max(...cells.map((cell) => cell.y)) + 1 : 0;
    const openCount = cells.reduce((count, cell) => count + (cell.state === 'open' ? 1 : 0), 0);
    const coveredCount = cells.reduce((count, cell) => count + (cell.state === 'covered' ? 1 : 0), 0);
    const flaggedCount = cells.reduce((count, cell) => count + (cell.state === 'flagged' ? 1 : 0), 0);
    // `start-active` is also used by the site's Hint/Prediction UI.  Only the
    // actual `.start` marker is authoritative for No Guessing's forced opener.
    const startCells = cells.filter((cell) => cell.start);
    const startCell = startCells.find((cell) => cell.startActive) || startCells[0] || null;
    const mineRemaining = readMineCounter(doc);
    const computedMineTotal = mineRemaining === null ? null : mineRemaining + flaggedCount;
    const mineTotal = Number.isInteger(computedMineTotal)
      && computedMineTotal >= 0
      && computedMineTotal <= cells.length
      ? computedMineTotal
      : null;

    let unsupportedReason = null;
    if (hasRandomizedClueSkin(doc)) {
      unsupportedReason = 'Random-color skins hide clue values; switch to a standard board skin.';
    } else if (invalidCoordinates || duplicateCoordinates || cells.length !== width * height) {
      unsupportedReason = 'The board DOM is incomplete or has duplicate coordinates.';
    } else if (cells.some((cell) => cell.state === 'unknown' || (cell.state === 'open' && cell.clue === null))) {
      unsupportedReason = 'The current skin does not expose readable cell clues.';
    }

    let outcome = readFaceOutcome(doc);
    if (!outcome && cells.some((cell) => cell.exploded || cell.wrongFlag)) outcome = 'lost';
    if (!outcome && cells.length > 0 && openCount > 0 && coveredCount + flaggedCount === 0) outcome = 'won';
    if (!outcome) outcome = 'playing';

    return {
      root: boardRoot,
      cells,
      width,
      height,
      openCount,
      coveredCount,
      flaggedCount,
      unopenedCount: coveredCount + flaggedCount,
      startCell,
      isNoGuessing: detectNoGuessing(doc),
      mineRemaining,
      mineTotal,
      totalMines: mineTotal,
      outcome,
      won: outcome === 'won',
      lost: outcome === 'lost',
      unsupportedReason
    };
  }

  function cellCode(cell) {
    if (!cell) return '?';
    if (cell.state === 'open') return `o${cell.clue == null ? '?' : cell.clue}`;
    if (cell.state === 'flagged') return 'f';
    if (cell.state === 'covered') return cell.startActive ? 'cA' : cell.start ? 'cs' : 'c';
    if (cell.state === 'exploded') return 'x';
    if (cell.state === 'wrong-flag') return 'w';
    if (cell.state === 'mine') return 'm';
    return '?';
  }

  /** A deterministic, element-free description suitable for mutation waits. */
  function fingerprint(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 'missing';
    const cells = Array.isArray(snapshot.cells) ? snapshot.cells : [];
    const board = cells.map((cell) => `${cell.x},${cell.y}:${cellCode(cell)}`).join('|');
    return [
      `${Number(snapshot.width) || 0}x${Number(snapshot.height) || 0}`,
      snapshot.isNoGuessing ? 'ng' : 'std',
      snapshot.mineRemaining == null ? '-' : String(snapshot.mineRemaining),
      snapshot.outcome || 'unknown',
      board
    ].join(';');
  }

  function sourceRoot(source) {
    if (!source) return getPrimaryRoot(globalRoot.document);
    if (source.root) return source.root;
    return getPrimaryRoot(source) || (source.id === PRIMARY_ROOT_ID ? source : null);
  }

  /**
   * Accepted forms:
   *   findCellElement(snapshot, cell)
   *   findCellElement(cell)
   *   findCellElement(x, y, documentOrRoot)
   */
  function findCellElement(first, second, third) {
    let source = null;
    let descriptor = null;
    let x = null;
    let y = null;

    if (first && typeof first === 'object' && first.root && second && typeof second === 'object') {
      source = first;
      descriptor = second;
      x = Number(second.x);
      y = Number(second.y);
    } else if (first && typeof first === 'object' && Number.isFinite(Number(first.x)) && Number.isFinite(Number(first.y))) {
      descriptor = first;
      source = second && (second.root || second.querySelector || second.getElementById) ? second : null;
      x = Number(first.x);
      y = Number(first.y);
    } else {
      x = Number(first);
      y = Number(second);
      source = third || null;
    }

    if (!Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0) return null;
    const boardRoot = sourceRoot(source);

    if (descriptor && descriptor.element) {
      const element = descriptor.element;
      const sameCoordinates = readCoordinate(element, 'x') === x && readCoordinate(element, 'y') === y;
      const inRoot = !boardRoot || typeof boardRoot.contains !== 'function' || boardRoot.contains(element);
      if (sameCoordinates && inRoot && element.isConnected !== false) return element;
    }

    if (!boardRoot) return null;
    const candidate = safeQuerySelector(boardRoot, `[data-x="${x}"][data-y="${y}"]`);
    return candidate && parseCellElement(candidate) ? candidate : null;
  }

  function isWin(snapshotOrDocument) {
    if (snapshotOrDocument && typeof snapshotOrDocument.outcome === 'string') {
      return snapshotOrDocument.outcome === 'won';
    }
    return readSnapshot(snapshotOrDocument).outcome === 'won';
  }

  function isLoss(snapshotOrDocument) {
    if (snapshotOrDocument && typeof snapshotOrDocument.outcome === 'string') {
      return snapshotOrDocument.outcome === 'lost';
    }
    return readSnapshot(snapshotOrDocument).outcome === 'lost';
  }

  return Object.freeze({
    readSnapshot,
    fingerprint,
    findCellElement,
    parseCellClass,
    parseCellElement,
    detectNoGuessing,
    readMineCounter,
    isWin,
    isLoss,
    version: '1.0.0'
  });
});
