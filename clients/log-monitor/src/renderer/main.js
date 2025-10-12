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
    if (loading) return h('<div>Loading...</div>');
    const successCount = state.uploader.status.filter(s => s.status === 'success').length;
    const failedCount = state.uploader.status.filter(s => s.status === 'failed').length;
    const recent50 = state.uploader.status.slice().reverse().slice(0, 50);
    h(`
      <div class="toolbar">
        <button id="toggle-config">配置</button>
        <button id="toggle-sync" class="sync-btn ${state.paused ? 'paused' : ''}">${state.paused ? '启动同步' : '暂停同步'}</button>
        <span style="margin-left:auto">连接状态: <span class="${health.status === 'ok' ? 'ok' : 'err'}">${health.status === 'ok' ? '已连接' : '未连接'}</span></span>
      </div>

      <div class="config-panel ${state.showConfig ? 'show' : ''}">
        <h3>配置</h3>
        <div class="row"><label>监控目录管理（≤10）</label>
          <button id="add-watch">添加目录</button>
        </div>
        <div class="row">
          <ul id="watch-list">
            ${state.watch.paths.map((p, i) => `<li>${p} <button data-rm="${i}">删除</button></li>`).join('')}
          </ul>
        </div>
        <div class="row"><label>递归深度（≤5）</label>
          <input id="watch-depth" type="number" min="1" max="5" value="${state.watch.depth}" />
        </div>
        <div class="row"><label>文件过滤类型</label>
          <input id="watch-exts" value="${state.watch.exts}" />
        </div>
        <div class="row"><label>密钥文件名</label>
          <input id="key-file" value="${state.watch.keyFileName || 'systemInfo.txt'}" />
        </div>
        <div class="row"><label>运行日志保存路径</label>
          <input id="logsDir" value="${state.watch.logsDir || ''}" style="width:360px" />
          <button id="browse-logsdir" style="margin-left:8px">浏览</button>
        </div>
        <div class="row"><label>启动扫描模式</label>
          <select id="ignore-initial">
            <option value="true" ${cfg.ignoreInitial === true ? 'selected' : ''}>仅监控新增/变更</option>
            <option value="false" ${cfg.ignoreInitial === false ? 'selected' : ''}>纳入现有内容（启动时扫描现有）</option>
          </select>
        </div>
        <div class="row"><label>用户名</label>
          <input id="username" value="${cfg.username || ''}" />
        </div>
        <div class="row"><label>密码</label>
          <input id="password" type="password" value="${cfg.password || ''}" />
        </div>
        <div class="row">
          <button id="save">保存配置</button>
        </div>
      </div>

      <div class="main-content">
        <h3>任务列表（成功 ${successCount}，失败 ${failedCount}，最近50条）</h3>
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
                <td><span class="status-badge status-${s.status}">${s.status}</span> ${s.retry_count ? `(重试 ${s.retry_count})` : ''}</td>
                <td>${formatTime(s.created_at)}</td>
              </tr>
            `).join('')}
            ${recent50.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999">暂无任务</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `);
  }

  function bind() {
    const $ = (id) => document.getElementById(id);
    const { cfg } = state;
    
    const toggleCfg = $('toggle-config');
    if (toggleCfg) toggleCfg.onclick = () => { state.showConfig = !state.showConfig; render(); };

    const saveBtn = $('save');
    if (saveBtn) saveBtn.onclick = async () => {
      state.saving = true; 
      const depth = parseInt(($('watch-depth').value || '4'), 10);
      const extsRaw = $('watch-exts').value || '.medbot';
      const keyFile = $('key-file').value || 'systemInfo.txt';
      const logsDir = $('logsDir').value || '';
      const username = $('username').value || '';
      const password = $('password').value || '';
      const ignoreInitialRaw = $('ignore-initial') ? $('ignore-initial').value : 'true';
      const ignoreInitial = ignoreInitialRaw === 'true';
      const paths = state.watch.paths.slice(0, 10);
      const exts = extsRaw.split(';').map(s => s.trim()).filter(Boolean);
      const updated = { ...cfg, watchPaths: paths, recurseDepth: depth, includeExtensions: exts, keyFileName: keyFile, logsDir, username, password, scanOnly: false, ignoreInitial };
      await window.logMonitor.saveConfig(updated);
      state.cfg = updated; 
      state.watch.paths = paths; state.watch.depth = depth; state.watch.exts = extsRaw; state.watch.keyFileName = keyFile; state.watch.logsDir = logsDir;
      // 应用到 watcher
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

    const list = document.getElementById('watch-list');
    if (list) list.onclick = (e) => {
      const tgt = e.target;
      if (tgt && tgt.getAttribute && tgt.hasAttribute('data-rm')) {
        const idx = parseInt(tgt.getAttribute('data-rm'), 10);
        if (!Number.isNaN(idx)) {
          state.watch.paths.splice(idx, 1);
          render();
        }
      }
    };

    const browseLogs = $('browse-logsdir');
    if (browseLogs) browseLogs.onclick = async () => {
      try {
        const result = await window.logMonitor.showOpenDialog({ properties: ['openDirectory'] });
        if (result && result.length > 0) {
          $('logsDir').value = result[0];
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


