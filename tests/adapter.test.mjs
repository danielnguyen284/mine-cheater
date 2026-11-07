import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Adapter = require('../src/adapter.js');

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = Object.assign({}, attributes);
    this.className = attributes.class || '';
    this.id = attributes.id || '';
    this.textContent = attributes.textContent || '';
    this.dataset = Object.assign({}, attributes.dataset);
    this.children = [];
    this.parentElement = null;
    this.ownerDocument = null;
    this.isConnected = true;
  }

  get classList() {
    return this.className.trim().split(/\s+/).filter(Boolean);
  }

  getAttribute(name) {
    if (name === 'class') return this.className;
    if (name === 'id') return this.id || null;
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? String(this.attributes[name]) : null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  append(...elements) {
    for (const element of elements) {
      element.parentElement = this;
      element.ownerDocument = this.ownerDocument;
      this.children.push(element);
    }
  }

  contains(element) {
    if (element === this) return true;
    return this.children.some((child) => child.contains(element));
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (selector === '#CellsBlock' && current.id === 'CellsBlock') return current;
      if (selector === '.active' && current.classList.includes('active')) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-x][data-y]') {
      return this.children.filter((child) => child.hasAttribute('data-x') && child.hasAttribute('data-y'));
    }
    return [];
  }

  querySelector(selector) {
    const coordinate = selector.match(/^\[data-x="(\d+)"\]\[data-y="(\d+)"\]$/);
    if (coordinate) {
      return this.children.find((child) => child.getAttribute('data-x') === coordinate[1]
        && child.getAttribute('data-y') === coordinate[2]) || null;
    }
    return null;
  }
}

class FakeDocument {
  constructor({ cells = [], noGuessing = false, pathname = '/game/1', counter = ['0', '0', '0'], face = null, skin = 'hd' } = {}) {
    this.nodeType = 9;
    this.location = { pathname };
    this.documentElement = new FakeElement({ id: 'html' });
    this.documentElement.ownerDocument = this;
    this.board = new FakeElement({ id: 'CellsBlock' });
    this.board.ownerDocument = this;
    this.game = new FakeElement({ id: 'game', class: `wrapper skin_${skin}` });
    this.game.ownerDocument = this;
    this.nav = new FakeElement({ class: noGuessing ? 'menu-link link_new_game_ng active' : 'menu-link link_new_game_ng' });
    this.nav.ownerDocument = this;
    this.ids = new Map([
      ['CellsBlock', this.board],
      ['game', this.game]
    ]);

    for (const cell of cells) {
      cell.ownerDocument = this;
      this.board.append(cell);
    }

    ['100', '10', '1'].forEach((place, index) => {
      const digit = new FakeElement({ id: `top_area_mines_${place}`, class: `hd_top-area-num${counter[index]} top-area-num` });
      digit.ownerDocument = this;
      this.ids.set(digit.id, digit);
    });

    if (face) {
      const faceElement = new FakeElement({ id: 'top_area_face', class: `hd_top-area-face-${face} top-area-face` });
      faceElement.ownerDocument = this;
      this.ids.set(faceElement.id, faceElement);
    }
  }

  getElementById(id) {
    return this.ids.get(id) || null;
  }

  querySelector(selector) {
    if (selector === '#CellsBlock') return this.board;
    if (selector === '#game') return this.game;
    if (selector === '#top_area_face') return this.getElementById('top_area_face');
    if (selector.startsWith('#top_area_mines_')) return this.getElementById(selector.slice(1));
    if (selector.includes('.link_new_game_ng.active') && this.nav.classList.includes('active')) return this.nav;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '.link_new_game_ng') return [this.nav];
    return [];
  }
}

function cell(x, y, className) {
  return new FakeElement({ 'data-x': x, 'data-y': y, class: `cell size24 ${className}` });
}

test('installs a frozen, read-only browser global and CommonJS API', () => {
  assert.equal(globalThis.MineCheaterAdapter, Adapter);
  assert.ok(Object.isFrozen(Adapter));
  for (const method of ['readSnapshot', 'fingerprint', 'findCellElement']) {
    assert.equal(typeof Adapter[method], 'function');
  }
  for (const method of ['primaryClick', 'secondaryClick', 'secondaryUnflag', 'waitForChange']) {
    assert.equal(Adapter[method], undefined, 'the adapter must stay read-only');
  }
});

test('parses skin-agnostic closed, open, flag, mine, explosion, and wrong-flag suffixes', () => {
  assert.deepEqual(
    { state: Adapter.parseCellClass('cell hd_closed').state, clue: Adapter.parseCellClass('cell hd_closed').clue },
    { state: 'covered', clue: null }
  );
  assert.deepEqual(
    { state: Adapter.parseCellClass('cell xpd_opened xpd_type7').state, clue: Adapter.parseCellClass('cell xpd_opened xpd_type7').clue },
    { state: 'open', clue: 7 }
  );
  assert.equal(Adapter.parseCellClass('cell al_opened al_type0').clue, 0);
  assert.equal(Adapter.parseCellClass('cell hdd_closed_flag').state, 'covered');
  assert.equal(Adapter.parseCellClass('cell hdd_closed_flag hdd_flag').state, 'flagged');
  assert.equal(Adapter.parseCellClass('cell gs_opened gs_type10').state, 'mine');
  assert.equal(Adapter.parseCellClass('cell nn_opened nn_type11').state, 'exploded');
  assert.equal(Adapter.parseCellClass('cell nn_opened nn_type12').state, 'wrong-flag');
});

test('does not treat randomized rtype classes as clue values', () => {
  const parsed = Adapter.parseCellClass('cell rc_opened rc_rtype6');
  assert.equal(parsed.state, 'open');
  assert.equal(parsed.clue, null);
});

test('detects No Guessing from the active nav and only uses the route as a loading fallback', () => {
  assert.equal(Adapter.detectNoGuessing(new FakeDocument({ noGuessing: true, pathname: '/game/42' })), true);
  assert.equal(Adapter.detectNoGuessing(new FakeDocument({ noGuessing: false, pathname: '/new-game/ng' })), true);
  assert.equal(Adapter.detectNoGuessing(new FakeDocument({ noGuessing: false, pathname: '/new-game' })), false);
});

test('reads a rectangular snapshot, forced .start cell, mine total, and primary coordinates', () => {
  const doc = new FakeDocument({
    noGuessing: true,
    counter: ['0', '0', '9'],
    cells: [
      cell(0, 0, 'hd_opened hd_type1'),
      cell(1, 0, 'hd_closed start'),
      cell(0, 1, 'hd_closed hd_flag'),
      cell(1, 1, 'hd_opened hd_type1')
    ]
  });
  const snapshot = Adapter.readSnapshot(doc);

  assert.equal(snapshot.width, 2);
  assert.equal(snapshot.height, 2);
  assert.equal(snapshot.openCount, 2);
  assert.equal(snapshot.coveredCount, 1);
  assert.equal(snapshot.flaggedCount, 1);
  assert.equal(snapshot.mineRemaining, 9);
  assert.equal(snapshot.totalMines, null, 'an impossible counter is withheld from the solver');
  assert.equal(snapshot.startCell.key, '1,0');
  assert.equal(snapshot.isNoGuessing, true);
  assert.equal(snapshot.outcome, 'playing');
  assert.equal(Adapter.findCellElement(snapshot, { x: 1, y: 0 }), doc.board.children[1]);
});

test('derives total mines as remaining counter plus flags on a valid board', () => {
  const cells = [];
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 4; x += 1) cells.push(cell(x, y, 'hd_closed'));
  }
  cells[0].className = 'cell size24 hd_closed hd_flag';
  const snapshot = Adapter.readSnapshot(new FakeDocument({ cells, counter: ['0', '0', '9'] }));
  assert.equal(snapshot.mineRemaining, 9);
  assert.equal(snapshot.mineTotal, 10);
  assert.equal(snapshot.totalMines, 10);
});

test('start-active alone is not mistaken for the No Guessing forced opener', () => {
  const doc = new FakeDocument({ cells: [cell(0, 0, 'hd_closed start-active')] });
  const snapshot = Adapter.readSnapshot(doc);
  assert.equal(snapshot.startCell, null);
  assert.equal(snapshot.cells[0].startActive, true);
});

test('marks randomized clue skins unsupported', () => {
  const doc = new FakeDocument({ skin: 'alrd', cells: [cell(0, 0, 'alrd_opened alrd_rtype4')] });
  assert.match(Adapter.readSnapshot(doc).unsupportedReason, /Random-color skins/);
});

test('reads negative counter digits and detects win/loss signals', () => {
  const negative = new FakeDocument({ counter: ['-', '0', '2'] });
  assert.equal(Adapter.readMineCounter(negative), -2);

  const won = Adapter.readSnapshot(new FakeDocument({ face: 'win', cells: [cell(0, 0, 'hd_opened hd_type0')] }));
  assert.equal(won.outcome, 'won');
  assert.equal(Adapter.isWin(won), true);

  const faceLost = Adapter.readSnapshot(new FakeDocument({ face: 'lose', cells: [cell(0, 0, 'hd_closed')] }));
  assert.equal(faceLost.outcome, 'lost');

  const lost = Adapter.readSnapshot(new FakeDocument({ cells: [cell(0, 0, 'hd_opened hd_type12')] }));
  assert.equal(lost.outcome, 'lost');
  assert.equal(Adapter.isLoss(lost), true);
});

test('fingerprint changes for durable board state, outcome, and forced-start changes', () => {
  const doc = new FakeDocument({ cells: [cell(0, 0, 'hd_closed')] });
  const before = Adapter.fingerprint(Adapter.readSnapshot(doc));
  doc.board.children[0].className = 'cell size24 hd_closed start';
  const startMarked = Adapter.fingerprint(Adapter.readSnapshot(doc));
  doc.board.children[0].className = 'cell size24 hd_opened hd_type0';
  const opened = Adapter.fingerprint(Adapter.readSnapshot(doc));
  assert.notEqual(startMarked, before);
  assert.notEqual(opened, startMarked);
});
