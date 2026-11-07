(() => {
  'use strict';

  if (globalThis.__mineCheaterLoaded) return;
  globalThis.__mineCheaterLoaded = true;

  const Solver = globalThis.MineCheaterSolver;
  const Adapter = globalThis.MineCheaterAdapter;
  const Planner = globalThis.MineCheaterPlanner;

  if (!Solver || !Adapter || !Planner) {
    console.error('[Mine Cheater] Solver, planner or site adapter did not load.');
    return;
  }

  const SETTINGS_KEY = 'mineCheaterSettings';
  const DEFAULT_SETTINGS = { hints: false, style: 'efficient', collapsed: false };
  const SOLVER_OPTIONS = Object.freeze({
    maxCspMs: 320,
    maxCspNodes: 300000,
    maxCspVariables: 60,
  });
  // Board re-renders arrive as bursts of class mutations; read once they settle.
  const REFRESH_DELAY_MS = 50;

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
      return {
        hints: saved.hints === true,
        style: saved.style === 'nf' ? 'nf' : 'efficient',
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
          --mk-open: #1fd16f;
          --mk-flag: #ff4d4d;
          --mk-chord: #3b8bff;
          --mk-unflag: #ffb020;
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

        .style-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          margin-bottom: 10px;
          padding: 3px;
          background: rgba(3, 10, 7, .3);
          border: 1px solid rgba(255,255,255,.045);
          border-radius: 10px;
        }

        .style-switch button {
          min-height: 28px;
          color: var(--mc-muted);
          background: transparent;
          border: 0;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .style-switch button.active { color: #092416; background: var(--mc-green); }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          margin-bottom: 12px;
          color: var(--mc-muted);
          font-size: 10px;
        }

        .legend span { display: inline-flex; align-items: center; gap: 5px; }
        .swatch { width: 11px; height: 11px; border: 2px solid; border-radius: 3px; }

        button { font-family: inherit; }

        .primary {
          width: 100%;
          min-height: 42px;
          color: #092416;
          background: linear-gradient(135deg, #69efa0, #35c977);
          border: 1px solid rgba(155,255,195,.42);
          border-radius: 11px;
          box-shadow: 0 8px 22px rgba(36,173,104,.18);
          font-size: 12px;
          font-weight: 760;
          cursor: pointer;
          transition: transform .12s ease, filter .12s ease, opacity .12s ease;
        }

        .primary.on { color: #c7d8ce; background: rgba(255,255,255,.045); border-color: rgba(255,255,255,.09); box-shadow: none; }
        .primary:hover { filter: brightness(1.07); }
        .primary:active { transform: translateY(1px); }

        .warning {
          margin-top: 13px;
          padding-top: 11px;
          color: #8fa198;
          border-top: 1px solid var(--mc-line);
          font-size: 9.5px;
          line-height: 1.45;
        }
        .warning b { color: var(--mc-amber); font-weight: 700; }

        .cell-mark {
          position: fixed;
          z-index: 2147483645;
          display: none;
          pointer-events: none;
          border: 2px solid;
          border-radius: 4px;
        }
        .cell-mark.visible { display: block; }

        .open { border-color: var(--mk-open); background: rgba(31, 209, 111, .3); }
        .flag { border-color: var(--mk-flag); background: rgba(255, 77, 77, .3); }
        .chord { border-color: var(--mk-chord); background: rgba(59, 139, 255, .3); }
        .unflag { border-color: var(--mk-unflag); background: rgba(255, 176, 32, .3); }
        .via { border: 1px dashed var(--mk-open); background: rgba(31, 209, 111, .1); }
        .cell-mark.start { border-width: 3px; box-shadow: 0 0 12px rgba(31, 209, 111, .8); animation: mark-pulse 1s ease-in-out infinite; }

        @keyframes mark-pulse {
          50% { opacity: .55; }
        }

        @media (max-width: 560px) {
          .panel { right: 10px; bottom: 10px; width: min(310px, calc(100vw - 20px)); }
        }
      </style>

      <div class="marks" aria-hidden="true"></div>

      <section class="panel" aria-label="Mine Cheater controls">
        <header class="header">
          <div class="mark" aria-hidden="true">M·</div>
          <div class="title-wrap">
            <div class="eyebrow">logic hints</div>
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
            <div class="stat"><span class="stat-value safe">0</span><span class="stat-label">ô an toàn</span></div>
            <div class="stat"><span class="stat-value opened">0</span><span class="stat-label">đã mở</span></div>
            <div class="stat"><span class="stat-value mines">0</span><span class="stat-label">mìn suy ra</span></div>
          </div>

          <div class="style-switch" role="group" aria-label="Kiểu chơi">
            <button type="button" data-style="efficient">Hiệu suất</button>
            <button type="button" data-style="nf">NF (không cờ)</button>
          </div>

          <div class="legend" aria-label="Chú thích màu">
            <span><i class="swatch open"></i>mở</span>
            <span><i class="swatch flag"></i>cắm cờ</span>
            <span><i class="swatch chord"></i>chord</span>
            <span><i class="swatch via"></i>chord sẽ mở</span>
            <span><i class="swatch unflag"></i>gỡ cờ</span>
          </div>

          <button class="primary" type="button">BẬT GỢI Ý</button>

          <div class="warning"><b>Lưu ý:</b> luật site cấm cả board analyser, kể cả khi bạn tự bấm. Dùng gợi ý vẫn có thể bị khóa tài khoản.</div>
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
      this.statusNode = this.shadow.querySelector('.status');
      this.modeNode = this.shadow.querySelector('.mode');
      this.dot = this.shadow.querySelector('.mode-dot');
      this.safeNode = this.shadow.querySelector('.safe');
      this.openedNode = this.shadow.querySelector('.opened');
      this.minesNode = this.shadow.querySelector('.mines');
      this.marksNode = this.shadow.querySelector('.marks');
      this.markNodes = [];
      this.markTargets = [];
      this.styleButtons = Array.from(this.shadow.querySelectorAll('.style-switch button'));

      this.panel.classList.toggle('collapsed', Boolean(settings.collapsed));

      this.shadow.querySelector('.collapse').addEventListener('click', () => {
        settings.collapsed = !settings.collapsed;
        this.panel.classList.toggle('collapsed', settings.collapsed);
        saveSettings(settings);
      });

      const reposition = () => this.placeMarks();
      window.addEventListener('scroll', reposition, { capture: true, passive: true });
      window.addEventListener('resize', reposition, { passive: true });
    }

    onToggle(handler) { this.primary.addEventListener('click', handler); }

    onStyle(handler) {
      for (const button of this.styleButtons) {
        button.addEventListener('click', () => handler(button.dataset.style));
      }
    }

    setStyle(style) {
      for (const button of this.styleButtons) {
        button.classList.toggle('active', button.dataset.style === style);
      }
    }

    setEnabled(enabled) {
      this.primary.classList.toggle('on', enabled);
      this.primary.textContent = enabled ? 'TẮT GỢI Ý' : 'BẬT GỢI Ý';
    }

    setMode(label, kind = 'idle') {
      this.modeNode.textContent = label;
      this.dot.className = `mode-dot ${kind}`;
    }

    setStatus(message, kind = 'idle') {
      // Refreshes run on every board tick; avoid re-announcing unchanged text.
      if (this.statusNode.textContent !== message) this.statusNode.textContent = message;
      this.dot.className = `mode-dot ${kind}`;
    }

    setStats({ safe, opened, mines }) {
      if (safe !== undefined) this.safeNode.textContent = String(safe);
      if (opened !== undefined) this.openedNode.textContent = String(opened);
      if (mines !== undefined) this.minesNode.textContent = String(mines);
    }

    /** Outline each { element, kind } pair; nodes are pooled across refreshes. */
    showMarks(marks) {
      while (this.markNodes.length < marks.length) {
        const node = document.createElement('div');
        this.marksNode.append(node);
        this.markNodes.push(node);
      }
      this.markNodes.forEach((node, index) => {
        node.className = marks[index] ? `cell-mark ${marks[index].kind}` : 'cell-mark';
      });
      this.markTargets = marks.map((mark) => mark.element);
      this.placeMarks();
    }

    hideMarks() {
      this.showMarks([]);
    }

    placeMarks() {
      // Read every rect before writing any style to avoid layout thrashing.
      const rects = this.markTargets.map((element) => (element?.isConnected ? element.getBoundingClientRect() : null));
      rects.forEach((rect, index) => {
        const node = this.markNodes[index];
        if (!rect || !rect.width || !rect.height) {
          node.classList.remove('visible');
          return;
        }
        Object.assign(node.style, {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
        node.classList.add('visible');
      });
    }
  }

  function cellKey(cell) {
    if (typeof cell === 'string') return cell;
    if (cell && Number.isFinite(cell.x) && Number.isFinite(cell.y)) return `${cell.x},${cell.y}`;
    return null;
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

  class HintController {
    constructor(panel, settings) {
      this.panel = panel;
      this.settings = settings;
      this.refreshTimer = null;
      this.pointerDown = false;
      this.cachedFingerprint = null;
      this.cachedResult = null;
      this.cachedPlan = null;

      panel.setEnabled(settings.hints);
      panel.setStyle(settings.style);
      panel.onToggle(() => this.toggle());
      panel.onStyle((style) => this.setStyle(style));
      document.addEventListener('keydown', (event) => {
        const target = event.target;
        const isEditing = target instanceof HTMLElement
          && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        if (!event.repeat && !isEditing && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyS') {
          event.preventDefault();
          this.toggle();
        }
      });

      // While a button is held the site may draw the pressed cell as opened;
      // reading that frame would feed the solver a clue that does not exist.
      // Pointer events cover chords too: pointerup fires once every button is up.
      const release = () => {
        this.pointerDown = false;
        this.scheduleRefresh();
      };
      document.addEventListener('pointerdown', () => { this.pointerDown = true; }, true);
      document.addEventListener('pointerup', release, true);
      document.addEventListener('pointercancel', release, true);
      window.addEventListener('blur', () => { this.pointerDown = false; });

      this.observePage();
      this.refresh();
    }

    toggle() {
      this.settings.hints = !this.settings.hints;
      this.panel.setEnabled(this.settings.hints);
      saveSettings(this.settings);
      this.refresh();
    }

    setStyle(style) {
      if (style === this.settings.style) return;
      this.settings.style = style;
      this.panel.setStyle(style);
      saveSettings(this.settings);
      this.refresh();
    }

    observePage() {
      const observer = new MutationObserver(() => this.scheduleRefresh());
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    scheduleRefresh() {
      if (this.refreshTimer !== null) return;
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        if (!this.pointerDown) this.refresh();
      }, REFRESH_DELAY_MS);
    }

    idle(mode, message, kind) {
      this.panel.hideMarks();
      this.panel.setStats({ safe: 0, mines: 0 });
      this.panel.setMode(mode, kind);
      this.panel.setStatus(message, kind);
    }

    /** Solve once per board state; the site's clock ticks re-run refresh every second. */
    analyze(snapshot) {
      const fingerprint = snapshotFingerprint(snapshot);
      if (fingerprint !== this.cachedFingerprint) {
        this.cachedResult = Solver.analyze(snapshot, SOLVER_OPTIONS);
        this.cachedPlan = null;
        this.cachedFingerprint = fingerprint;
      }
      if (!this.cachedPlan || this.cachedPlan.style !== this.settings.style) {
        this.cachedPlan = Planner.plan(snapshot, this.cachedResult, { style: this.settings.style });
      }
      return { result: this.cachedResult, plan: this.cachedPlan };
    }

    refresh() {
      let snapshot;
      try {
        snapshot = readSnapshot();
      } catch (error) {
        this.idle('Lỗi đọc bàn', `Không đọc được bàn: ${error.message}`, 'error');
        return;
      }

      if (!snapshot?.cells?.length) {
        this.idle('Chưa có bàn', 'Mở một bàn No Guessing để bắt đầu.', 'idle');
        return;
      }
      this.panel.setStats({ opened: snapshot.openCount || 0 });
      if (snapshot.unsupportedReason) {
        this.idle('Không hỗ trợ', snapshot.unsupportedReason, 'warning');
        return;
      }
      if (!snapshot.isNoGuessing) {
        this.idle('Sai chế độ', 'Chuyển sang No Guessing mode để xem gợi ý.', 'warning');
        return;
      }
      if (snapshot.outcome === 'won') {
        this.idle('Hoàn tất', 'Đã thắng ván này.', 'success');
        return;
      }
      if (snapshot.outcome === 'lost') {
        this.idle('Đã thua', 'Ván đã thua.', 'error');
        return;
      }
      if (!this.settings.hints) {
        this.idle('No Guessing', 'Bấm BẬT GỢI Ý hoặc Alt+S để hiện các ô an toàn.', 'ready');
        return;
      }

      if (!snapshot.openCount) {
        const startCell = snapshot.startCell;
        const element = startCell && boardElement(snapshot, startCell);
        if (!element) {
          this.idle('No Guessing', 'Đang chờ game đánh dấu ô mở đầu…', 'running');
          return;
        }
        this.panel.showMarks([{ element, kind: 'open start' }]);
        this.panel.setStats({ safe: 1, mines: 0 });
        this.panel.setMode('No Guessing', 'running');
        this.panel.setStatus(`Bấm ô bắt đầu (${startCell.x}, ${startCell.y}) mà game đã đánh dấu.`, 'running');
        return;
      }

      let analysis;
      try {
        analysis = this.analyze(snapshot);
      } catch (error) {
        this.idle('Lỗi solver', `Solver gặp lỗi: ${error?.message || String(error)}`, 'error');
        return;
      }

      const { result, plan } = analysis;
      if (result.status === 'contradiction' || result.contradiction) {
        this.idle('No Guessing', 'Bàn đang mâu thuẫn hoặc skin không đọc được, nên chưa gợi ý.', 'error');
        return;
      }

      const mineCount = (result.mines || []).length;
      if (!plan.open.length && !plan.chord.length && !plan.unflag.length) {
        this.idle('No Guessing', 'Không có nước chắc chắn. Solver không đoán xác suất.', 'warning');
        this.panel.setStats({ mines: mineCount });
        return;
      }

      const cellsByKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
      const marks = [];
      const addMarks = (keys, kind) => {
        for (const key of keys) {
          const cell = cellsByKey.get(key);
          const element = cell && boardElement(snapshot, cell);
          if (element) marks.push({ element, kind });
        }
      };
      addMarks(plan.open, 'open');
      addMarks(plan.viaChord, 'via');
      addMarks(plan.flag, 'flag');
      addMarks(plan.chord, 'chord');
      addMarks(plan.unflag, 'unflag');

      this.panel.showMarks(marks);
      this.panel.setStats({ safe: (result.safe || []).length, mines: mineCount });
      this.panel.setMode('No Guessing', 'running');

      let message;
      if (plan.chord.length) {
        message = `Cắm ${plan.flag.length} cờ, chord ${plan.chord.length} ô số, mở thêm ${plan.open.length} ô. Tiết kiệm ${plan.saved} click so với bấm chay.`;
      } else if (plan.style === 'efficient') {
        message = `${plan.open.length} ô an toàn đang sáng. Chưa có chord nào đáng cắm cờ.`;
      } else {
        message = `${plan.open.length} ô an toàn đang sáng. Bấm theo thứ tự nào cũng được.`;
      }
      if (plan.unflag.length) message += ` Gỡ ${plan.unflag.length} cờ cắm nhầm (viền vàng).`;
      this.panel.setStatus(message, plan.unflag.length ? 'warning' : 'running');
    }
  }

  loadSettings().then((settings) => {
    if (document.getElementById('mine-cheater-extension-root')) return;
    const panel = new Panel(settings);
    new HintController(panel, settings);
  });
})();
