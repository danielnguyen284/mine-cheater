(() => {
  'use strict';

  if (globalThis.__mineCheaterLoaded) return;
  globalThis.__mineCheaterLoaded = true;

  const Solver = globalThis.MineCheaterSolver;
  const Adapter = globalThis.MineCheaterAdapter;

  if (!Solver || !Adapter) {
    console.error('[Mine Cheater] Solver or site adapter did not load.');
    return;
  }

  const SETTINGS_KEY = 'mineCheaterSettings';
  const DEFAULT_SETTINGS = { delay: 110, collapsed: false };
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function extensionStorage() {
    try {
      return globalThis.chrome?.storage?.local || null;
    } catch {
      return null;
    }
  }

  async function loadSettings() {
    const storage = extensionStorage();
    if (!storage) return { ...DEFAULT_SETTINGS };

    try {
      const result = await storage.get(SETTINGS_KEY);
      const saved = result?.[SETTINGS_KEY] || {};
      const numericDelay = Number(saved.delay);
      return {
        delay: Number.isFinite(numericDelay) ? Math.min(650, Math.max(60, Math.round(numericDelay / 10) * 10)) : DEFAULT_SETTINGS.delay,
        collapsed: saved.collapsed === true,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async function saveSettings(settings) {
    const storage = extensionStorage();
    if (!storage) return;
    try {
      await storage.set({ [SETTINGS_KEY]: settings });
    } catch {
      // The extension can be reloaded while this content script is still alive.
    }
  }

  function panelTemplate() {
    return `
      <style>
        :host {
          all: initial;
          color-scheme: dark;
          --mc-bg: #111815;
          --mc-panel: rgba(21, 31, 27, .96);
          --mc-line: rgba(194, 242, 214, .13);
          --mc-text: #eef9f2;
          --mc-muted: #9bb1a4;
          --mc-green: #4ee18b;
          --mc-green-2: #24ad68;
          --mc-amber: #f6c65b;
          --mc-red: #ff776d;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * { box-sizing: border-box; }

        .panel {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483646;
          width: 310px;
          overflow: hidden;
          color: var(--mc-text);
          background:
            radial-gradient(circle at 88% -15%, rgba(78, 225, 139, .18), transparent 42%),
            var(--mc-panel);
          border: 1px solid var(--mc-line);
          border-radius: 18px;
          box-shadow: 0 22px 65px rgba(0, 0, 0, .42), 0 2px 10px rgba(0, 0, 0, .22);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          transition: width .2s ease, transform .2s ease;
        }

        .panel.collapsed { width: 216px; }
        .panel.collapsed .body { display: none; }

        .header {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 60px;
          padding: 11px 12px 11px 14px;
          border-bottom: 1px solid var(--mc-line);
        }

        .panel.collapsed .header { border-bottom: 0; }

        .mark {
          display: grid;
          place-items: center;
          flex: 0 0 36px;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(104, 242, 159, .35);
          border-radius: 11px;
          color: #0d2417;
          background: linear-gradient(145deg, #79f0a8, #35c977);
          box-shadow: 0 7px 20px rgba(36, 173, 104, .22);
          font: 800 18px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
        }

        .title-wrap { min-width: 0; flex: 1; }
        .eyebrow {
          margin-bottom: 2px;
          color: var(--mc-green);
          font: 700 9px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .title {
          overflow: hidden;
          color: var(--mc-text);
          font-size: 14px;
          font-weight: 760;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .collapse {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          padding: 0;
          color: var(--mc-muted);
          background: transparent;
          border: 0;
          border-radius: 9px;
          cursor: pointer;
        }

        .collapse:hover { color: var(--mc-text); background: rgba(255,255,255,.06); }
        .collapse svg { width: 15px; transition: transform .2s ease; }
        .panel.collapsed .collapse svg { transform: rotate(180deg); }

        .body { padding: 14px; }

        .mode-line {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding: 9px 10px;
          color: var(--mc-muted);
          background: rgba(255,255,255,.035);
          border: 1px solid rgba(255,255,255,.05);
          border-radius: 11px;
          font-size: 11px;
        }

        .mode-line strong { margin-left: auto; color: #dff5e7; font-size: 11px; }
        .mode-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--mc-muted);
          box-shadow: 0 0 0 3px rgba(155,177,164,.1);
        }
        .mode-dot.ready, .mode-dot.success { background: var(--mc-green); box-shadow: 0 0 0 3px rgba(78,225,139,.12); }
        .mode-dot.running { background: var(--mc-green); box-shadow: 0 0 0 3px rgba(78,225,139,.14); animation: pulse 1.2s infinite; }
        .mode-dot.warning { background: var(--mc-amber); box-shadow: 0 0 0 3px rgba(246,198,91,.12); }
        .mode-dot.error { background: var(--mc-red); box-shadow: 0 0 0 3px rgba(255,119,109,.12); }

        @keyframes pulse {
          50% { box-shadow: 0 0 0 6px rgba(78,225,139,0); }
        }

        .status {
          min-height: 42px;
          margin: 0 1px 13px;
          color: var(--mc-text);
          font-size: 12px;
          line-height: 1.45;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
          margin-bottom: 13px;
        }

        .stat {
          padding: 8px 7px;
          background: rgba(3, 10, 7, .3);
          border: 1px solid rgba(255,255,255,.045);
          border-radius: 10px;
          text-align: center;
        }

        .stat-value { display: block; color: #f5fff8; font: 720 15px/1.1 ui-monospace, SFMono-Regular, Consolas, monospace; }
        .stat-label { display: block; margin-top: 4px; color: #789083; font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }

        .actions { display: grid; grid-template-columns: 1fr 82px; gap: 8px; }
        button { font-family: inherit; }

        .primary, .secondary {
          min-height: 42px;
          border-radius: 11px;
          font-size: 12px;
          font-weight: 760;
          cursor: pointer;
          transition: transform .12s ease, filter .12s ease, opacity .12s ease;
        }

        .primary {
          color: #092416;
          background: linear-gradient(135deg, #69efa0, #35c977);
          border: 1px solid rgba(155,255,195,.42);
          box-shadow: 0 8px 22px rgba(36,173,104,.18);
        }

        .secondary { color: #c7d8ce; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.09); }
        .primary:hover, .secondary:hover { filter: brightness(1.07); }
        .primary:active, .secondary:active { transform: translateY(1px); }
        button:disabled { cursor: default; filter: none; opacity: .42; }

        .speed { margin-top: 14px; }
        .speed-head { display: flex; justify-content: space-between; margin-bottom: 7px; color: var(--mc-muted); font-size: 10px; }
        .speed-value { color: #cfe6d8; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
        input[type="range"] { width: 100%; height: 4px; margin: 0; accent-color: var(--mc-green); cursor: pointer; }

        .warning {
          margin-top: 13px;
          padding-top: 11px;
          color: #8fa198;
          border-top: 1px solid var(--mc-line);
          font-size: 9.5px;
          line-height: 1.45;
        }
        .warning b { color: var(--mc-amber); font-weight: 700; }

        @media (max-width: 560px) {
          .panel { right: 10px; bottom: 10px; width: min(310px, calc(100vw - 20px)); }
        }
      </style>

      <section class="panel" aria-label="Mine Cheater controls">
        <header class="header">
          <div class="mark" aria-hidden="true">M·</div>
          <div class="title-wrap">
            <div class="eyebrow">logic autopilot</div>
            <div class="title">Mine Cheater</div>
          </div>
          <button class="collapse" type="button" aria-label="Thu gọn">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </header>

        <div class="body">
          <div class="mode-line">
            <span class="mode-dot"></span>
            <span>Chế độ</span>
            <strong class="mode">Đang dò…</strong>
          </div>
          <p class="status" role="status" aria-live="polite">Mở một bàn No Guessing để bắt đầu.</p>

          <div class="stats" aria-label="Thống kê">
            <div class="stat"><span class="stat-value moves">0</span><span class="stat-label">lượt mở</span></div>
            <div class="stat"><span class="stat-value opened">0</span><span class="stat-label">đã mở</span></div>
            <div class="stat"><span class="stat-value mines">0</span><span class="stat-label">mìn suy ra</span></div>
          </div>

          <div class="actions">
            <button class="primary" type="button">PHÁ ĐẢO</button>
            <button class="secondary" type="button" disabled>TẠM DỪNG</button>
          </div>

          <div class="speed">
            <div class="speed-head"><span>Độ trễ mỗi nước</span><span class="speed-value">110 ms</span></div>
            <input class="speed-input" type="range" min="60" max="650" step="10" value="110" aria-label="Độ trễ mỗi nước">
          </div>

          <div class="warning"><b>Lưu ý:</b> site cấm solver/auto-click và có thể khóa tài khoản. Extension không che giấu thao tác — nên dùng khi đã chấp nhận rủi ro.</div>
        </div>
      </section>
    `;
  }

  class Panel {
    constructor(settings) {
      this.settings = settings;
      this.host = document.createElement('div');
      this.host.id = 'mine-cheater-extension-root';
      this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;';
      this.shadow = this.host.attachShadow({ mode: 'closed' });
      this.shadow.innerHTML = panelTemplate();
      document.documentElement.append(this.host);

      this.panel = this.shadow.querySelector('.panel');
      this.primary = this.shadow.querySelector('.primary');
      this.secondary = this.shadow.querySelector('.secondary');
      this.statusNode = this.shadow.querySelector('.status');
      this.modeNode = this.shadow.querySelector('.mode');
      this.dot = this.shadow.querySelector('.mode-dot');
      this.movesNode = this.shadow.querySelector('.moves');
      this.openedNode = this.shadow.querySelector('.opened');
      this.minesNode = this.shadow.querySelector('.mines');
      this.speedInput = this.shadow.querySelector('.speed-input');
      this.speedValue = this.shadow.querySelector('.speed-value');

      this.panel.classList.toggle('collapsed', Boolean(settings.collapsed));
      this.speedInput.value = String(settings.delay);
      this.speedValue.textContent = `${settings.delay} ms`;

      this.shadow.querySelector('.collapse').addEventListener('click', () => {
        settings.collapsed = !settings.collapsed;
        this.panel.classList.toggle('collapsed', settings.collapsed);
        saveSettings(settings);
      });

      this.speedInput.addEventListener('input', () => {
        settings.delay = Number(this.speedInput.value);
        this.speedValue.textContent = `${settings.delay} ms`;
      });

      this.speedInput.addEventListener('change', () => saveSettings(settings));
    }

    onStart(handler) { this.primary.addEventListener('click', handler); }
    onPause(handler) { this.secondary.addEventListener('click', handler); }

    setRunning(running) {
      this.primary.disabled = running;
      this.secondary.disabled = !running;
      this.primary.textContent = running ? 'ĐANG GIẢI…' : 'PHÁ ĐẢO';
    }

    setMode(label, kind = 'idle') {
      this.modeNode.textContent = label;
      this.dot.className = `mode-dot ${kind}`;
    }

    setStatus(message, kind = 'idle') {
      this.statusNode.textContent = message;
      this.dot.className = `mode-dot ${kind}`;
    }

    setStats({ moves, opened, mines }) {
      if (moves !== undefined) this.movesNode.textContent = String(moves);
      if (opened !== undefined) this.openedNode.textContent = String(opened);
      if (mines !== undefined) this.minesNode.textContent = String(mines);
    }
  }

  function cellKey(cell) {
    if (typeof cell === 'string') return cell;
    if (cell && Number.isFinite(cell.x) && Number.isFinite(cell.y)) return `${cell.x},${cell.y}`;
    return null;
  }

  function findSnapshotCell(snapshot, move) {
    const key = cellKey(move);
    if (!key) return null;
    return snapshot.cells.find((cell) => cellKey(cell) === key || cell.key === key) || null;
  }

  function snapshotFingerprint(snapshot) {
    if (typeof Adapter.fingerprint === 'function') return Adapter.fingerprint(snapshot);
    return snapshot.cells.map((cell) => `${cellKey(cell)}:${cell.state}:${cell.clue ?? ''}`).join('|');
  }

  function readSnapshot() {
    if (typeof Adapter.readSnapshot === 'function') return Adapter.readSnapshot(document);
    if (typeof Adapter.readBoard === 'function') return Adapter.readBoard(document);
    throw new Error('Site adapter has no snapshot reader.');
  }

  function boardElement(snapshot, cell) {
    return cell?.element
      || (typeof Adapter.findCellElement === 'function' ? Adapter.findCellElement(snapshot, cell) : null)
      || document.querySelector(`#cell_${cell.x}_${cell.y}`);
  }

  async function waitForChange(snapshot, timeoutMs = 4500) {
    const before = snapshotFingerprint(snapshot);
    if (typeof Adapter.waitForChange === 'function') {
      return Adapter.waitForChange(snapshot.root, before, timeoutMs);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (changed) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(changed);
      };
      const check = () => {
        try {
          const next = readSnapshot();
          if (next && snapshotFingerprint(next) !== before) finish(true);
        } catch {
          finish(false);
        }
      };
      const observer = new MutationObserver(check);
      observer.observe(snapshot.root || document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      const timer = setTimeout(() => finish(false), timeoutMs);
      check();
    });
  }

  class Controller {
    constructor(panel, settings) {
      this.panel = panel;
      this.settings = settings;
      this.running = false;
      this.token = 0;
      this.moves = 0;
      this.lastRoot = null;
      this.lastOpened = 0;
      this.startWaits = 0;
      this.stallChecks = 0;
      this.noChangeRetries = new Map();
      this.scanTimer = null;

      panel.onStart(() => this.start());
      panel.onPause(() => this.pause('Đã tạm dừng.'));
      document.addEventListener('keydown', (event) => {
        const target = event.target;
        const isEditing = target instanceof HTMLElement
          && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        if (!event.repeat && !isEditing && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyS') {
          event.preventDefault();
          this.running ? this.pause('Đã tạm dừng bằng Alt+S.') : this.start();
        }
      });

      this.observePage();
      this.refreshIdleState();
    }

    observePage() {
      const observer = new MutationObserver(() => {
        clearTimeout(this.scanTimer);
        this.scanTimer = setTimeout(() => {
          if (!this.running) this.refreshIdleState();
        }, 120);
      });
      observer.observe(document.documentElement, { subtree: true, childList: true });
    }

    refreshIdleState() {
      let snapshot;
      try {
        snapshot = readSnapshot();
      } catch {
        return;
      }
      if (!snapshot?.cells?.length) {
        this.panel.setMode('Chưa có bàn', 'idle');
        return;
      }
      this.panel.setStats({ opened: snapshot.openCount || 0 });
      if (snapshot.unsupportedReason) {
        this.panel.setMode('Không hỗ trợ', 'warning');
        this.panel.setStatus(snapshot.unsupportedReason, 'warning');
      } else if (snapshot.isNoGuessing) {
        this.panel.setMode('No Guessing', 'ready');
        this.panel.setStatus('Sẵn sàng. Bấm PHÁ ĐẢO — ô mở đầu sẽ được chọn đúng marker của game.', 'ready');
      } else {
        this.panel.setMode('Sai chế độ', 'warning');
        this.panel.setStatus('Chuyển sang No Guessing mode rồi thử lại.', 'warning');
      }
    }

    start() {
      if (this.running) return;
      let snapshot;
      try {
        snapshot = readSnapshot();
      } catch (error) {
        this.panel.setStatus(`Không đọc được bàn: ${error.message}`, 'error');
        return;
      }

      if (!snapshot?.cells?.length) {
        this.panel.setStatus('Chưa tìm thấy bàn cờ trên trang.', 'warning');
        return;
      }
      if (snapshot.unsupportedReason) {
        this.panel.setStatus(snapshot.unsupportedReason, 'warning');
        return;
      }
      if (!snapshot.isNoGuessing) {
        this.panel.setStatus('Extension chỉ chạy ở No Guessing single-player.', 'warning');
        return;
      }

      this.running = true;
      this.token += 1;
      this.moves = 0;
      this.lastRoot = snapshot.root;
      this.lastOpened = snapshot.openCount || 0;
      this.startWaits = 0;
      this.stallChecks = 0;
      this.noChangeRetries.clear();
      this.panel.setRunning(true);
      this.panel.setMode('No Guessing', 'running');
      this.panel.setStatus('Đang đọc các ràng buộc logic…', 'running');
      this.panel.setStats({ moves: 0, opened: snapshot.openCount || 0, mines: 0 });
      const token = this.token;
      this.runLoop(token).catch((error) => {
        if (this.isCurrent(token)) {
          this.pause(`Solver gặp lỗi: ${error?.message || String(error)}`, 'error');
        }
        console.error('[Mine Cheater] Controller error', error);
      });
    }

    pause(message, kind = 'warning') {
      this.running = false;
      this.token += 1;
      this.panel.setRunning(false);
      this.panel.setStatus(message, kind);
      if (kind === 'success') this.panel.setMode('Hoàn tất', 'success');
    }

    isCurrent(token) {
      return this.running && token === this.token;
    }

    async runLoop(token) {
      while (this.isCurrent(token)) {
        let snapshot;
        try {
          snapshot = readSnapshot();
        } catch (error) {
          this.pause(`Lỗi đọc bàn: ${error.message}`, 'error');
          return;
        }

        if (!snapshot?.cells?.length) {
          this.pause('Bàn cờ đã rời khỏi trang.', 'warning');
          return;
        }
        if (snapshot.unsupportedReason) {
          this.pause(snapshot.unsupportedReason, 'warning');
          return;
        }
        if (!snapshot.isNoGuessing) {
          this.pause('Đã rời No Guessing mode.', 'warning');
          return;
        }

        const opened = snapshot.openCount || 0;
        this.panel.setStats({ moves: this.moves, opened });

        if (snapshot.outcome === 'won') {
          this.pause(`Xong — đã phá đảo sau ${this.moves} lượt mở tự động.`, 'success');
          return;
        }
        if (snapshot.outcome === 'lost') {
          this.pause('Ván đã thua; solver đã dừng.', 'error');
          return;
        }

        if (this.lastRoot && snapshot.root !== this.lastRoot && this.moves > 0) {
          this.pause('Phát hiện bàn mới. Bấm PHÁ ĐẢO để chạy ván này.', 'warning');
          return;
        }
        if (this.lastOpened > 0 && opened === 0) {
          this.pause('Bàn vừa được reset. Bấm PHÁ ĐẢO để chạy lại.', 'warning');
          return;
        }
        this.lastRoot = snapshot.root;
        this.lastOpened = Math.max(this.lastOpened, opened);

        if (opened === 0) {
          const startCell = snapshot.startCell;
          if (!startCell) {
            this.startWaits += 1;
            if (this.startWaits > 70) {
              this.pause('Không thấy ô mở đầu .start. Solver không đoán bừa trong No Guessing.', 'error');
              return;
            }
            this.panel.setStatus('Đang chờ game đánh dấu ô mở đầu bắt buộc…', 'running');
            await sleep(180);
            continue;
          }

          const element = boardElement(snapshot, startCell);
          if (!element) {
            this.startWaits += 1;
            if (this.startWaits > 70) {
              this.pause('Marker mở đầu đã có nhưng không lấy được cell DOM.', 'error');
              return;
            }
            await sleep(120);
            continue;
          }
          this.panel.setStatus(`Mở đúng ô bắt đầu (${startCell.x}, ${startCell.y})…`, 'running');
          const startKey = `start:${cellKey(startCell)}`;
          const clicked = Adapter.primaryClick(element);
          if (clicked) {
            this.moves += 1;
            this.panel.setStats({ moves: this.moves });
          }
          const changed = clicked && await waitForChange(snapshot);
          if (!changed) {
            const retries = (this.noChangeRetries.get(startKey) || 0) + 1;
            this.noChangeRetries.set(startKey, retries);
            if (retries >= 2) {
              this.pause('Site không nhận thao tác mở đầu; đã dừng thay vì click lặp vô hạn.', 'error');
              return;
            }
          } else {
            this.noChangeRetries.delete(startKey);
          }
          await sleep(this.settings.delay);
          continue;
        }

        const result = Solver.analyze(snapshot, {
          maxExactMillis: 320,
          maxExactNodes: 300000,
          maxCspVariables: 60,
        });
        const safeMoves = result.safe || result.safeCells || [];
        const mineMoves = result.mines || result.mineCells || [];
        this.panel.setStats({ mines: mineMoves.length });

        if (result.status === 'contradiction' || result.contradiction) {
          await sleep(180);
          if (!this.isCurrent(token)) return;
          const confirmation = Solver.analyze(readSnapshot(), {
            maxExactMillis: 320,
            maxExactNodes: 300000,
            maxCspVariables: 60,
          });
          if (confirmation.status === 'contradiction' || confirmation.contradiction) {
            this.pause('DOM đang mâu thuẫn hoặc skin không đọc được; đã dừng để không bấm nhầm.', 'error');
            return;
          }
          continue;
        }

        const target = safeMoves.map((move) => findSnapshotCell(snapshot, move)).find(Boolean);
        if (!target) {
          this.stallChecks += 1;
          if (this.stallChecks <= 3) {
            this.panel.setStatus('Chưa thấy nước chắc chắn; đang chạy suy luận sâu lại…', 'running');
            await sleep(220);
            continue;
          }
          this.pause('Solver bị kẹt dù đây là No Guessing. Không dùng xác suất, nên đã dừng an toàn.', 'warning');
          return;
        }
        this.stallChecks = 0;

        const targetElement = boardElement(snapshot, target);
        if (!targetElement || !targetElement.isConnected) {
          await sleep(80);
          continue;
        }

        if (target.state === 'flagged') {
          this.panel.setStatus(`Gỡ cờ ở ô an toàn (${target.x}, ${target.y})…`, 'running');
          const unflagKey = `unflag:${cellKey(target)}`;
          const clicked = Adapter.secondaryClick(targetElement);
          const changed = clicked && await waitForChange(snapshot);
          if (!changed) {
            const retries = (this.noChangeRetries.get(unflagKey) || 0) + 1;
            this.noChangeRetries.set(unflagKey, retries);
            if (retries >= 2) {
              this.pause(`Không gỡ được cờ tại (${target.x}, ${target.y}); đã dừng.`, 'error');
              return;
            }
          } else {
            this.noChangeRetries.delete(unflagKey);
          }
          await sleep(this.settings.delay);
          continue;
        }

        const targetKey = cellKey(target);
        this.panel.setStatus(`Ô (${target.x}, ${target.y}) chắc chắn an toàn — đang mở…`, 'running');
        const clicked = Adapter.primaryClick(targetElement);
        if (clicked) {
          this.moves += 1;
          this.panel.setStats({ moves: this.moves });
        }
        const changed = clicked && await waitForChange(snapshot);

        if (!changed) {
          const retries = (this.noChangeRetries.get(targetKey) || 0) + 1;
          this.noChangeRetries.set(targetKey, retries);
          if (retries >= 2) {
            this.pause(`Site không nhận thao tác tại (${target.x}, ${target.y}); đã dừng để tránh spam click.`, 'error');
            return;
          }
        } else {
          this.noChangeRetries.delete(targetKey);
        }

        await sleep(this.settings.delay);
      }
    }
  }

  loadSettings().then((settings) => {
    if (document.getElementById('mine-cheater-extension-root')) return;
    const panel = new Panel(settings);
    new Controller(panel, settings);
  });
})();
