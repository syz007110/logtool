(function () {
  const el = document.getElementById('app');
  const state = {
    loading: true,
    saving: false,
    cfg: null,
    health: { status: '', message: '', checking: false },
    watch: { paths: [], depth: 4, exts: '.medbot', keyFileName: 'systemInfo.txt', logsDir: '' },
    uploader: { status: [] },
    paused: false,
    showConfig: false
  };

  function h(html) { el.innerHTML = html; bind(); }

  function formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function view() {
    const { cfg, loading, saving, health } = state;
    if (loading) return h('<div class="loading">加载中...</div>');
    
    const successCount = state.uploader.status.filter(s => s.status === 'success').length;
    const failedCount = state.uploader.status.filter(s => s.status === 'failed').length;
    const totalCount = state.uploader.status.length;
    const recent50 = state.uploader.status.slice().reverse().slice(0, 50);
    
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
        render(); 
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
      render();
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
      render();
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
            render();
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
          render();
      }
    };
    });

    const browseLogs = $('browse-logsdir');
    if (browseLogs) browseLogs.onclick = async () => {
      try {
        const result = await window.logMonitor.showOpenDialog({ properties: ['openDirectory'] });
        if (result && result.length > 0) {
          state.watch.logsDir = result[0];
          render();
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
    state.cfg = cfg; state.watch.depth = cfg.recurseDepth || 4; state.watch.paths = cfg.watchPaths || []; state.watch.exts = (cfg.includeExtensions || ['.medbot']).join(';'); state.watch.keyFileName = cfg.keyFileName || 'systemInfo.txt'; state.watch.logsDir = cfg.logsDir || ''; render();
    state.loading = false; render();
    window.logMonitor.onUploaderStatus((snap) => {
      state.uploader.status = snap;
      render();
    });
    // 初次与周期性健康检查
    healthHandler();
    setInterval(() => { healthHandler(); }, 10000);
  }

  function render() { view(); }
  init();
  
  // Additional handlers
  function toggleSync() {
    const n = (state.cfg.concurrency || 3);
    const isPaused = state.paused === true;
    const next = isPaused ? n : 0;
    state.paused = !isPaused;
    window.logMonitor.setConcurrency(next);
    render();
  }
  
  // attach after first render
  const _origBind = bind;
  bind = function() {
    _origBind();
    const $ = (id) => document.getElementById(id);
    const btnT = $('toggle-sync'); if (btnT) btnT.onclick = toggleSync;
  }
})();


