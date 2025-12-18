(function () {
  const el = document.getElementById('app');
  const state = {
    loading: true,
    saving: false,
    cfg: null,
    health: { status: '', message: '', checking: false },
    watch: { paths: [], depth: 4, exts: '.medbot', keyFileName: 'systemInfo.txt', logsDir: '' },
    uploader: { status: [] },
    taskStats: { total: 0, success: 0, failed: 0 }, // 持久化统计
    paused: true,
    showConfig: false,
    _idlePrev: false,
    _statsRefreshCounter: 0
  };

  function h(html) { el.innerHTML = html; bind(); }

  // 节流渲染：限制渲染频率，避免卡顿
  // 使用 requestAnimationFrame 将渲染调度到浏览器下一个重绘周期
  let renderTimer = null;
  let lastRenderTime = 0;
  const MIN_RENDER_INTERVAL = 100; // 最小渲染间隔100ms（约10fps，足够流畅且不卡顿）
  
  function render() { 
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime;
    
    // 如果距离上次渲染时间足够短，且已有定时器，则跳过
    if (renderTimer && timeSinceLastRender < MIN_RENDER_INTERVAL) {
      return;
    }
    
    // 取消之前的定时器（如果有）
    if (renderTimer) {
      cancelAnimationFrame(renderTimer);
    }
    
    // 使用 requestAnimationFrame 在下一个浏览器重绘周期渲染
    renderTimer = requestAnimationFrame(() => {
      view();
      lastRenderTime = Date.now();
      renderTimer = null;
    });
  }

  // 强制立即渲染（用于用户交互等需要即时反馈的场景）
  function renderImmediate() {
    if (renderTimer) {
      cancelAnimationFrame(renderTimer);
      renderTimer = null;
    }
    view();
    lastRenderTime = Date.now();
  }

  function formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  // 前端限制内存占用：只保留最近1000条任务用于统计
  function limitMemoryTasks(tasks) {
    const MAX_TASKS_IN_MEMORY = 1000;
    if (tasks.length <= MAX_TASKS_IN_MEMORY) return tasks;
    
    // 保留最新的任务，删除最旧的
    return tasks
      .slice() // 复制数组避免修改原数组
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA; // 降序，最新的在前
      })
      .slice(0, MAX_TASKS_IN_MEMORY);
  }

  function view() {
    const { cfg, loading, saving, health } = state;
    if (loading) return h('<div class="loading">加载中...</div>');
    
    // 使用持久化统计（不会被清空）
    const totalCount = state.taskStats.total || 0;
    const successCount = state.taskStats.success || 0;
    const failedCount = state.taskStats.failed || 0;
    
    // 限制内存占用（只保留最近1000条用于显示任务列表）
    const limitedStatus = limitMemoryTasks(state.uploader.status);
    // 只显示最近50条任务
    const recent50 = limitedStatus.slice().reverse().slice(0, 50);
    
    // Update header status
    const headerStatus = document.getElementById('header-status');
    if (headerStatus) {
      headerStatus.innerHTML = `
        <span class="status-dot ${health.status === 'ok' ? 'connected' : 'disconnected'}"></span>
        <span>${health.status === 'ok' ? '已连接' : '未连接'}</span>
      `;
    }
    
    h(`
      <div class="container">
        <!-- Toolbar -->
      <div class="toolbar">
          <button id="toggle-sync" class="btn ${state.paused ? 'btn-warning' : 'btn-success'}">
            ${state.paused ? '启动同步' : '暂停同步'}
          </button>
      </div>

        <!-- Configuration Panel -->
        <div class="panel">
          <div class="panel-heading" id="config-toggle">
            <span class="panel-chevron ${state.showConfig ? 'open' : ''}">▶</span>
        <h3>配置</h3>
            <span class="panel-state idle">设置</span>
          </div>
          <div class="panel-body ${state.showConfig ? 'show' : ''}">
            <div class="alert alert-info">
              <strong>提示：</strong> 其他高级配置项（如递归深度、文件过滤类型、密钥文件名、用户名密码等）请通过编辑 <strong>config.json</strong> 文件进行设置
        </div>
            
            <div class="info-row">
              <div class="info-label">监控路径 (${state.watch.paths.length}/10)</div>
              <div class="info-value">
                ${state.watch.paths.length > 0 ? `
                  <ul class="path-list">
                    ${state.watch.paths.map((p, i) => `
                      <li class="path-item">
                        <span class="path-text">${p}</span>
                        <button class="btn btn-danger btn-sm path-remove" data-rm="${i}">删除</button>
                      </li>
                    `).join('')}
          </ul>
                ` : '<div class="empty-state">暂无监控目录</div>'}
                <button id="add-watch" class="btn btn-default" ${state.watch.paths.length >= 10 ? 'disabled' : ''}>
                  添加目录
                </button>
        </div>
        </div>

            <div class="info-row">
              <div class="info-label">启动扫描模式</div>
              <div class="info-value">
          <select id="ignore-initial">
                  <option value="true" ${cfg.ignoreInitial === true ? 'selected' : ''}>仅监控新增/变更文件</option>
                  <option value="false" ${cfg.ignoreInitial === false ? 'selected' : ''}>启动时扫描现有文件</option>
          </select>
        </div>
            </div>

            <div class="info-row">
              <div class="info-label">日志存储路径</div>
              <div class="info-value">
                <div style="display:flex;gap:8px;align-items:center">
                  <input type="text" id="logsdir-display" value="${state.watch.logsDir || '未设置'}" readonly style="flex:1">
                  <button id="browse-logsdir" class="btn btn-default">浏览</button>
                </div>
              </div>
            </div>

            <div style="margin-top:15px;text-align:right">
              <button id="save" class="btn btn-primary" ${saving ? 'disabled' : ''}>
                ${saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>

        <!-- Statistics Panel -->
        <div class="panel">
          <div class="panel-heading" id="stats-toggle">
            <span class="panel-chevron open">▶</span>
            <h3>上传统计</h3>
            <span class="panel-state ${state.paused ? 'paused' : 'active'}">
              ${state.paused ? '已暂停' : '运行中'}
            </span>
          </div>
          <div class="panel-body show">
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-label">总任务数</div>
                <div class="stat-value">${totalCount}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">成功上传</div>
                <div class="stat-value success">${successCount}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">上传失败</div>
                <div class="stat-value danger">${failedCount}</div>
        </div>
        </div>
        </div>
      </div>

        <!-- Tasks Panel -->
        <div class="panel">
          <div class="panel-heading" id="tasks-toggle">
            <span class="panel-chevron open">▶</span>
            <h3>最近任务</h3>
            <span class="panel-state idle">最近50条</span>
          </div>
          <div class="panel-body show">
        <table>
          <thead>
            <tr>
              <th>设备编号</th>
              <th>文件路径</th>
              <th>状态</th>
              <th>获取时间</th>
            </tr>
          </thead>
          <tbody>
            ${recent50.map(s => `
              <tr>
                <td>${s.device_id || '-'}</td>
                <td title="${s.file_path}">${s.file_path}</td>
                    <td>
                      <span class="badge badge-${s.status}">${s.status}</span>
                      ${s.retry_count ? `<span style="color:#999;font-size:11px;margin-left:4px">(重试 ${s.retry_count})</span>` : ''}
                    </td>
                <td>${formatTime(s.created_at)}</td>
              </tr>
            `).join('')}
                ${recent50.length === 0 ? '<tr><td colspan="4" class="empty-state">暂无任务记录</td></tr>' : ''}
          </tbody>
        </table>
          </div>
        </div>
      </div>
    `);
  }

  function bind() {
    const $ = (id) => document.getElementById(id);
    const { cfg } = state;
    
    // Panel toggle handlers (Syncthing style)
    const configToggle = $('config-toggle');
    if (configToggle) {
      configToggle.onclick = () => { 
        state.showConfig = !state.showConfig; 
        renderImmediate(); 
      };
    }
    
    const statsToggle = $('stats-toggle');
    if (statsToggle) {
      statsToggle.onclick = function() {
        const body = this.nextElementSibling;
        const chevron = this.querySelector('.panel-chevron');
        if (body) {
          body.classList.toggle('show');
          chevron.classList.toggle('open');
        }
      };
    }
    
    const tasksToggle = $('tasks-toggle');
    if (tasksToggle) {
      tasksToggle.onclick = function() {
        const body = this.nextElementSibling;
        const chevron = this.querySelector('.panel-chevron');
        if (body) {
          body.classList.toggle('show');
          chevron.classList.toggle('open');
        }
      };
    }

    const saveBtn = $('save');
    if (saveBtn) saveBtn.onclick = async () => {
      state.saving = true; 
      renderImmediate();
      const ignoreInitialRaw = $('ignore-initial') ? $('ignore-initial').value : 'true';
      const ignoreInitial = ignoreInitialRaw === 'true';
      const paths = state.watch.paths.slice(0, 10);
      const logsDir = state.watch.logsDir || '';
      
      // 保持其他配置项不变，只更新UI中的三个配置项
      const updated = { 
        ...cfg, 
        watchPaths: paths,
        ignoreInitial,
        logsDir
      };
      
      await window.logMonitor.saveConfig(updated);
      state.cfg = updated; 
      state.watch.paths = paths;
      state.watch.logsDir = logsDir;
      
      // 应用到 watcher（使用配置中的现有值）
      const depth = cfg.recurseDepth || 4;
      const exts = cfg.includeExtensions || ['.medbot'];
      window.logMonitor.updateWatch({ paths, depth, exts });
      
      state.saving = false; 
      renderImmediate();
    };

    const addBtn = $('add-watch');
    if (addBtn) addBtn.onclick = async () => {
      if ((state.watch.paths || []).length >= 10) return;
      try {
        const result = await window.logMonitor.showOpenDialog({ properties: ['openDirectory'] });
        if (result && result.length > 0) {
          const p = result[0];
          if (!state.watch.paths.includes(p)) {
            state.watch.paths.push(p);
            renderImmediate();
          }
        }
      } catch {}
    };

    const removeButtons = document.querySelectorAll('[data-rm]');
    removeButtons.forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.getAttribute('data-rm'), 10);
        if (!Number.isNaN(idx)) {
          state.watch.paths.splice(idx, 1);
          renderImmediate();
        }
      };
    });

    const browseLogs = $('browse-logsdir');
    if (browseLogs) browseLogs.onclick = async () => {
      try {
        const result = await window.logMonitor.showOpenDialog({ properties: ['openDirectory'] });
        if (result && result.length > 0) {
          state.watch.logsDir = result[0];
          renderImmediate();
        }
      } catch {}
    };
  }

  async function healthHandler() {
    try {
      state.health.checking = true; state.health.status = ''; state.health.message = ''; render();
      const cfg = state.cfg;
      const base = (cfg.apiBaseUrl || '').replace(/\/$/, '').replace(/\/api$/, '');
      const url = `${base}/health`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      state.health.status = data.status || 'error';
      state.health.message = data.status === 'ok' ? 'ok' : (data.message || 'unavailable');
    } catch (e) {
      state.health.status = 'error';
      state.health.message = e.message || 'error';
    } finally {
      state.health.checking = false; render();
    }
  }

  async function init() {
    const cfg = await window.logMonitor.getConfig();
    state.cfg = cfg; state.watch.depth = cfg.recurseDepth || 4; state.watch.paths = cfg.watchPaths || []; state.watch.exts = (cfg.includeExtensions || ['.medbot']).join(';'); state.watch.keyFileName = cfg.keyFileName || 'systemInfo.txt'; state.watch.logsDir = cfg.logsDir || ''; renderImmediate();
    
    // 加载持久化统计
    try {
      const stats = await window.logMonitor.getTaskStats();
      state.taskStats = stats || { total: 0, success: 0, failed: 0 };
    } catch {
      state.taskStats = { total: 0, success: 0, failed: 0 };
    }
    
    state.loading = false; renderImmediate();
    // 使用节流渲染：状态更新频繁时不会卡顿
    window.logMonitor.onUploaderStatus((snap) => {
      // 限制内存占用：只保留最近1000条任务
      state.uploader.status = limitMemoryTasks(snap || []);
      // 定期刷新持久化统计（每10次更新刷新一次，避免频繁读取）
      state._statsRefreshCounter++;
      if (state._statsRefreshCounter >= 10) {
        state._statsRefreshCounter = 0;
        window.logMonitor.getTaskStats()
          .then(stats => {
            if (stats) {
              state.taskStats = stats;
              renderImmediate(); // 统计更新需要立即渲染
            }
          })
          .catch(() => {});
      }
      // 队列空闲检测：当没有 pending/uploading 时，立即对齐一次统计，避免最后一批不再触发刷新
      try {
        const statuses = Array.isArray(state.uploader.status) ? state.uploader.status : [];
        const hasActive = statuses.some(s => s && (s.status === 'pending' || s.status === 'uploading'));
        const idleNow = !hasActive;
        if (idleNow && !state._idlePrev) {
          // 刚刚从非空闲切到空闲 → 立即刷新统计
          window.logMonitor.getTaskStats()
            .then(stats => {
              if (stats) {
                state.taskStats = stats;
                renderImmediate();
              }
            })
            .catch(() => {});
        }
        state._idlePrev = idleNow;
      } catch {}
      render(); // 使用节流渲染，不是立即渲染
    });
    // 初次与周期性健康检查
    healthHandler();
    setInterval(() => { healthHandler(); }, 10000);
  }

  init();
  
  // Additional handlers
  function toggleSync() {
    const n = (state.cfg.concurrency || 3);
    const isPaused = state.paused === true;
    const next = isPaused ? n : 0;
    state.paused = !isPaused;
    window.logMonitor.setConcurrency(next);
    renderImmediate(); // 用户交互需要即时反馈
  }
  
  // attach after first render
  const _origBind = bind;
  bind = function() {
    _origBind();
    const $ = (id) => document.getElementById(id);
    const btnT = $('toggle-sync'); if (btnT) btnT.onclick = toggleSync;
  }
})();


