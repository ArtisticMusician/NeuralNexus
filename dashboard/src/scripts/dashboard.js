// ══════════════════════════════════════════════
// CONFIG & AUTH
// ══════════════════════════════════════════════
const BASE = 'http://localhost:8008';
const CAT_COLORS = { fact:'#6dbe4c', preference:'#0ea5e9', entity:'#f59e0b', decision:'#a78bfa', other:'#808080' };
let JWT = sessionStorage.getItem('nn_jwt') || '';

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (JWT) headers['Authorization'] = 'Bearer ' + JWT;
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { showLoginOverlay(); return null; }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

function showLoginOverlay() {
  JWT = '';
  sessionStorage.removeItem('nn_jwt');
  document.getElementById('loginOverlay').style.display = 'flex';
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  document.getElementById('login-error').textContent = '';
  try {
    const res = await fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.token) {
      JWT = data.token;
      sessionStorage.setItem('nn_jwt', JWT);
      document.getElementById('loginOverlay').style.display = 'none';
      init();
    } else {
      document.getElementById('login-error').textContent = data.error || 'Login failed.';
    }
  } catch {
    document.getElementById('login-error').textContent = 'Cannot connect to server at ' + BASE;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const lp = document.getElementById('login-pass');
  if (lp) lp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// ══════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════
const CATEGORIES = ['fact','preference','entity','decision'];

let memories = [], apiKeys = [], users = [];
let activeMemoryId = null;
const latencyBuf = [];
let latencyPoller = null;

function setSidebarLights(okMap = {}) {
  const setLight = (id, ok) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('err', !ok);
  };
  setLight('slight-server-dot', okMap.server);
  setLight('slight-qdrant-dot', okMap.qdrant);
}

function setSidebarConnection(text, isConnected) {
  const el = document.querySelector('.sidebarStatus');
  if (!el) return;
  const color = isConnected ? 'var(--green)' : 'var(--red)';
  el.innerHTML = `<span class="sidebarStatusDot" style="background:${color}"></span>${text}`;
}

function fmtMs(v) { return (v == null || v === 0) ? '—' : v.toFixed(1) + ' ms'; }
function fmtUptime(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm uptime' : m + 'm uptime';
}
function fmtDate(iso) { return iso ? String(iso).split('T')[0] : '—'; }

const MODELS = ['claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5'];

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════
const navItems = document.querySelectorAll('.navItem');
const pages    = document.querySelectorAll('.page');

const PAGE_TITLES = { overview:'SYSTEM', memories:'MEMORIES', apikeys:'API KEYS', config:'CONFIG', docs:'DOCS' };
const PAGE_ICONS  = { overview:'System', memories:'Memories', apikeys:'ApiKey', config:'Settings', docs:'Docs' };

function navigate(pageId) {
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === pageId));
  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + pageId));
  const titleEl = document.getElementById('globalPageTitle');
  if (titleEl) titleEl.textContent = PAGE_TITLES[pageId] || pageId.toUpperCase();
  const titleIcon = document.getElementById('pageTitleIcon');
  if (titleIcon && PAGE_ICONS[pageId]) {
    titleIcon.src = '/icons/' + PAGE_ICONS[pageId] + '.svg';
    titleIcon.style.display = 'inline-block';
  }
  if (pageId === 'overview')  loadOverview();
  if (pageId === 'memories')  renderMemories();
  if (pageId === 'apikeys')   loadApiKeys();
  if (pageId === 'config')    loadConfig();
}

navItems.forEach(n => n.addEventListener('click', e => { e.preventDefault(); navigate(n.dataset.page); }));

// ══════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════
function switchTab(target) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tabForm').forEach(f => f.classList.remove('active'));
  const btn = document.querySelector('.tab[data-tab="' + target + '"]');
  if (btn) btn.classList.add('active');
  const form = document.getElementById('tabForm-' + target);
  if (form) form.classList.add('active');
}

function switchDocsTab(target) {
  document.querySelectorAll('.docsTab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.docsPane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.docsTab[onclick="switchDocsTab('${target}')"]`)?.classList.add('active');
  document.getElementById('docsPane-' + target)?.classList.add('active');
}

// ══════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════
function drawCharts(buf, catCounts) { drawLineChart(buf); drawDonutChart(catCounts); }

function drawLineChart(buf) {
  const canvas = document.getElementById('lineChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top:14, right:14, bottom:28, left:36 };
  const pts = (buf && buf.length) ? buf : Array.from({length:30}, () => ({ v: 0 }));
  const minV = 0, maxV = 30;
  ctx.clearRect(0,0,W,H);
  const panelBg = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#222222';
  ctx.fillStyle = panelBg; ctx.fillRect(0,0,W,H);
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top  - pad.bottom;

  ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 1;
  [0,10,20,30].forEach(v => {
    const y = pad.top + gH - ((v-minV)/(maxV-minV))*gH;
    ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+gW,y); ctx.stroke();
    ctx.fillStyle='#555'; ctx.font='9px Inter'; ctx.textAlign='right';
    ctx.fillText(v, pad.left-4, y+3);
  });
  ctx.fillStyle='#555'; ctx.font='9px Inter'; ctx.textAlign='center';
  [0,5,10,15,20,25,29].forEach(i => {
    const x = pad.left + (i/(pts.length-1))*gW;
    ctx.fillText('t-'+(29-i), x, H-8);
  });

  const grad = ctx.createLinearGradient(0,pad.top,0,pad.top+gH);
  grad.addColorStop(0,'rgba(109,190,76,0.2)');
  grad.addColorStop(1,'rgba(109,190,76,0)');
  ctx.beginPath();
  pts.forEach((p,i) => {
    const x = pad.left+(i/(pts.length-1))*gW;
    const y = pad.top+gH-((p.v-minV)/(maxV-minV))*gH;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.lineTo(pad.left+gW,pad.top+gH); ctx.lineTo(pad.left,pad.top+gH);
  ctx.closePath(); ctx.fillStyle=grad; ctx.fill();

  ctx.beginPath();
  pts.forEach((p,i) => {
    const x = pad.left+(i/(pts.length-1))*gW;
    const y = pad.top+gH-((p.v-minV)/(maxV-minV))*gH;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.strokeStyle='#6dbe4c'; ctx.lineWidth=2; ctx.stroke();

  pts.forEach((p,i) => {
    const x = pad.left+(i/(pts.length-1))*gW;
    const y = pad.top+gH-((p.v-minV)/(maxV-minV))*gH;
    ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2);
    ctx.fillStyle='#6dbe4c'; ctx.fill();
  });
}

function drawDonutChart(catCounts) {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const data = catCounts && Object.keys(catCounts).length ? catCounts : { fact:0, preference:0, entity:0, decision:0 };
  const total = Object.values(data).reduce((a,b)=>a+b,0);
  const cx=W/2, cy=H/2, r=62, inner=38;
  let startAngle=-Math.PI/2;
  const colors = Object.values(CAT_COLORS);
  const entries = Object.entries(data);

  entries.forEach(([,val],i) => {
    const slice=(val/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,startAngle,startAngle+slice);
    ctx.closePath(); ctx.fillStyle=colors[i]; ctx.fill();
    startAngle+=slice;
  });
  ctx.beginPath(); ctx.arc(cx,cy,inner,0,Math.PI*2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#222222';
  ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 14px Inter'; ctx.textAlign='center';
  ctx.fillText(total.toLocaleString(),cx,cy+2);
  ctx.fillStyle='#808080'; ctx.font='9px Inter';
  ctx.fillText('TOTAL',cx,cy+14);

  const legend = document.getElementById('donutLegend');
  legend.innerHTML = entries.map(([cat,val],i) => `
    <div style="display:flex;align-items:center;gap:7px;font-size:11px;">
      <div style="width:9px;height:9px;border-radius:2px;background:${colors[i]};flex-shrink:0;"></div>
      <span style="color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;font-size:10px;">${cat}</span>
      <span style="color:var(--text);font-weight:600;margin-left:auto;">${val}</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════
// OVERVIEW
// ══════════════════════════════════════════════
let overviewLoading = false;
async function loadOverview() {
  if (overviewLoading) return;  // prevent concurrent double-loads
  overviewLoading = true;
  try {
    const [health, cats, mergeData] = await Promise.all([
      api('/health'),
      api('/admin/stats/categories'),
      api('/admin/stats/merges'),
    ]);
    if (!health) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-memories', (health.pointsCount || 0).toLocaleString());
    set('stat-recall', health.avgRecallMs ? health.avgRecallMs.toFixed(1) : '0');
    const statusEl = document.getElementById('stat-status');
    if (statusEl) {
      if (health.status === 'ok') {
        statusEl.textContent = 'ONLINE'; statusEl.className = 'statValue green';
      } else {
        statusEl.textContent = 'ERROR'; statusEl.className = 'statValue red';
      }
      const statusIcon = document.getElementById('stat-status-icon');
      if (statusIcon) statusIcon.src = '/icons/' + (health.status === 'ok' ? 'Status_OK' : 'Status_NoOK') + '.svg';
    }

    set('perf-fastest', fmtMs(health.fastestRecallMs));
    set('perf-slowest', fmtMs(health.slowestRecallMs));
    set('perf-avg',     fmtMs(health.avgRecallMs));
    const ratio = health.storesTotal > 0 ? (health.recallsTotal / health.storesTotal).toFixed(1) + '×' : '—';
    set('perf-ratio', ratio);
    set('perf-embed', fmtMs(health.embeddingLoadTimeMs));

    set('st-stores',   (health.storesTotal || 0).toLocaleString());
    set('st-recalls',  (health.recallsTotal || 0).toLocaleString());
    set('st-vectors',  (health.indexedVectorsCount || 0).toLocaleString());
    set('st-segments', (health.segmentsCount || 0).toLocaleString());
    set('st-merges',   mergeData?.mergeCount != null ? mergeData.mergeCount.toLocaleString() : '—');

    function updateServiceCard(name, comp, uptime) {
      const ok = comp?.status === 'ok';
      const pill = document.getElementById('svc-' + name + '-pill');
      if (pill) {
        pill.className = 'statusPill ' + (ok ? 'ok' : 'fail');
        pill.innerHTML = `<img src="/icons/${ok ? 'Status_OK' : 'Status_NoOK'}.svg" alt="">`;
      }
      set('svc-' + name + '-uptime', ok ? fmtUptime(uptime) : '—');
      set('svc-' + name + '-version', comp?.version ? 'v' + comp.version.replace(/^v/, '') : '—');
      const errEl = document.getElementById('svc-' + name + '-error');
      if (errEl) {
        if (!ok && comp?.error) {
          errEl.textContent = comp.error;
          errEl.classList.add('visible');
        } else {
          errEl.textContent = '';
          errEl.classList.remove('visible');
        }
      }
    }

    const c = health.components || {};
    updateServiceCard('server', c.server, health.uptime);
    updateServiceCard('qdrant', c.qdrant, health.uptime);
    // Category counts — fall back to counting from /memories if Qdrant index returns all zeros
    let catCounts = cats?.categories || {};
    const allZero = Object.values(catCounts).every(v => v === 0);
    if (allZero && health.pointsCount > 0) {
      const allMems = await api('/memories?limit=1000');
      const counted = {};
      (allMems?.memories || []).forEach(m => {
        const c = m.category || 'other';
        counted[c] = (counted[c] || 0) + 1;
      });
      catCounts = counted;
    }
    set('bd-facts',     (catCounts.fact       || 0).toString());
    set('bd-pref',      (catCounts.preference || 0).toString());
    set('bd-entities',  (catCounts.entity     || 0).toString());
    set('bd-decisions', (catCounts.decision   || 0).toString());
    set('bd-merges',    mergeData?.mergeCount != null ? mergeData.mergeCount.toString() : '—');

    const keysData = await api('/admin/api-keys');
    set('stat-keys', keysData?.keys ? keysData.keys.length.toString() : '—');

    setSidebarConnection('Connected', true);
    setSidebarLights({
      server: c.server?.status === 'ok',
      qdrant: c.qdrant?.status === 'ok',
    });

    latencyBuf.push({ v: health.avgRecallMs || 0 });
    if (latencyBuf.length > 30) latencyBuf.shift();
    drawCharts(latencyBuf, catCounts);

    renderRecentActivity();
  } catch (err) {
    console.error('loadOverview:', err);
    setSidebarConnection('Disconnected', false);
    setSidebarLights({ server: false, qdrant: false });
  } finally {
    overviewLoading = false;
  }
}

async function renderRecentActivity() {
  const el = document.getElementById('recentActivity');
  if (!el) return;
  try {
    const data = await api('/memories?limit=5');
    const mems = data?.memories || [];
    if (!mems.length) { el.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px 0;">No memories stored yet.</div>'; return; }
    el.innerHTML = mems.map(m => `
      <div class="activityItem">
        <div class="actTop">
          <span class="actText">${escHtml(m.text)}</span>
          <span class="catBadge ${m.category || 'other'}">${m.category || 'other'}</span>
        </div>
        <div class="actMeta">
          <span>${m.stored_by_model || 'unknown'}</span>
          <span>Str: ${m.strength != null ? parseFloat(m.strength).toFixed(2) : '—'}</span>
          <span>${fmtDate(m.created_at)}</span>
        </div>
      </div>
    `).join('');
  } catch { el.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">Failed to load.</div>'; }
}

// ══════════════════════════════════════════════
// MEMORIES PAGE
// ══════════════════════════════════════════════
let memSearchTimer = null;

function toggleAllCats(checked) {
  document.querySelectorAll('.catBox').forEach(cb => cb.checked = checked);
  renderMemories();
}

function syncAllNone() {
  const boxes = [...document.querySelectorAll('.catBox')];
  document.getElementById('catAll').checked = boxes.every(b => b.checked);
}

function getSelectedCats() {
  return [...document.querySelectorAll('.catBox:checked')].map(b => b.value);
}

async function renderMemories() {
  const query = document.getElementById('overviewSearch').value.trim();
  const sort  = document.getElementById('mem-sort').value;
  const grid  = document.getElementById('memoryGrid');
  const showAllUsers = !!document.getElementById('memAllUsers')?.checked;
  syncAllNone();

  grid.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:20px 0;text-align:center;">Loading…</div>';
  try {
    const data = showAllUsers
      ? await api('/memories?limit=1000&all_users=true')
      : query
        ? await api('/recall', { method: 'POST', body: { query, limit: 50 } })
        : await api('/memories?limit=200');
    memories = data?.memories || [];

    if (showAllUsers && query) {
      const q = query.toLowerCase();
      memories = memories.filter(m =>
        String(m.text || '').toLowerCase().includes(q) ||
        String(m.userid || '').toLowerCase().includes(q) ||
        String(m.agentid || '').toLowerCase().includes(q) ||
        String(m.stored_by_model || '').toLowerCase().includes(q)
      );
    }

    const cats = getSelectedCats();
    if (cats.length < 5) memories = memories.filter(m => cats.includes(m.category || 'other'));

    memories.sort((a, b) => {
      if (sort === 'date-desc')  return (b.created_at || '').localeCompare(a.created_at || '');
      if (sort === 'date-asc')   return (a.created_at || '').localeCompare(b.created_at || '');
      if (sort === 'score-desc') return (b.score || 0) - (a.score || 0);
      if (sort === 'score-asc')  return (a.score || 0) - (b.score || 0);
      return 0;
    });

    document.getElementById('memCount').textContent = memories.length + ' results';
    grid.innerHTML = memories.length ? memories.map(m => `
      <div class="memCard">
        <div class="memCardTop">
          <span class="memCat" style="color:${CAT_COLORS[m.category] || '#808080'}">${m.category || 'other'}</span>
          <span class="memScore">${m.score != null ? parseFloat(m.score).toFixed(3) : '—'}</span>
        </div>
        <div class="memText">${escHtml(m.text)}</div>
        <div class="memBottom">
          <span class="memDate">${fmtDate(m.created_at)}</span>
          <span class="memMetaMini">${escHtml(m.agentid || m.userid || '—')}</span>
          <button class="btn btn-copy btn-sm" onclick="openMemModal('${escHtml(m.id)}')">VIEW</button>
        </div>
      </div>
    `).join('') : '<div style="color:var(--text-dim);font-size:12px;padding:20px 0;text-align:center;">No memories found.</div>';
  } catch (err) {
    grid.innerHTML = `<div style="color:var(--red);font-size:12px;padding:20px 0;">${err.message}</div>`;
  }
}

document.getElementById('overviewSearch').addEventListener('input', () => {
  clearTimeout(memSearchTimer);
  memSearchTimer = setTimeout(renderMemories, 400);
});
document.getElementById('mem-sort').addEventListener('change', renderMemories);

async function openMemModal(id) {
  const m = memories.find(x => x.id === id);
  if (!m) return;
  if (!users.length) {
    await loadUsers();
  }
  activeMemoryId = id;
  document.getElementById('memModalId').value = id;
  populateMemoryOwnerOptions(m.userid || '');
  document.getElementById('mem-agent-input').value = m.agentid || '';
  document.getElementById('memModalBody').innerHTML = `
    <div class="modalRow"><div class="modalLabel">Text</div><div class="modalValue">${escHtml(m.text)}</div></div>
    <div class="modalRow"><div class="modalLabel">Category</div><div class="modalValue" style="color:${CAT_COLORS[m.category] || '#808080'};text-transform:uppercase;font-weight:600;">${m.category || '—'}</div></div>
    <div class="modalRow"><div class="modalLabel">Score</div><div class="modalValue">${m.score != null ? parseFloat(m.score).toFixed(4) : '—'}</div></div>
    <div class="modalRow"><div class="modalLabel">Created</div><div class="modalValue">${fmtDate(m.created_at)}</div></div>
    <div class="modalRow"><div class="modalLabel">Last Accessed</div><div class="modalValue">${fmtDate(m.last_accessed_at)}</div></div>
    <div class="modalRow"><div class="modalLabel">Strength</div><div class="modalValue">${m.strength != null ? parseFloat(m.strength).toFixed(3) : '—'}</div></div>
    <div class="modalRow"><div class="modalLabel">ID</div><div class="modalValue mono">${escHtml(m.id)}</div></div>
    <div class="modalRow"><div class="modalLabel">Owner User</div><div class="modalValue mono">${escHtml(m.userid || '—')}</div></div>
    <div class="modalRow"><div class="modalLabel">Agent ID</div><div class="modalValue mono">${escHtml(m.agentid || '—')}</div></div>
    <div class="modalRow"><div class="modalLabel">Stored By Model</div><div class="modalValue mono">${escHtml(m.stored_by_model || '—')}</div></div>
    <div class="modalRow"><div class="modalLabel">Stored By Key</div><div class="modalValue mono">${escHtml(m.stored_by_key_id || '—')}</div></div>
  `;
  document.getElementById('memModal').classList.add('show');
}

function populateMemoryOwnerOptions(selectedUserId) {
  const select = document.getElementById('mem-owner-select');
  if (!select) return;
  const options = users.map(u => `
    <option value="${escHtml(u.id)}" ${u.id === selectedUserId ? 'selected' : ''}>
      ${escHtml(u.username)} (${escHtml(u.id)})
    </option>
  `).join('');
  select.innerHTML = options || `<option value="${escHtml(selectedUserId || '')}">${escHtml(selectedUserId || 'Unknown')}</option>`;
  if (selectedUserId && !users.some(u => u.id === selectedUserId)) {
    select.innerHTML = `<option value="${escHtml(selectedUserId)}" selected>${escHtml(selectedUserId)}</option>` + select.innerHTML;
  }
}

async function reassignMemoryFromModal() {
  const id = activeMemoryId || document.getElementById('memModalId')?.value;
  const userid = document.getElementById('mem-owner-select')?.value?.trim();
  const agentid = document.getElementById('mem-agent-input')?.value?.trim();
  if (!id || !userid) {
    showWarning('Select a target owner before reassigning.');
    return;
  }
  try {
    await api('/admin/memories/reassign', {
      method: 'POST',
      body: {
        ids: [id],
        userid,
        agentid,
      },
    });
    closeModal('memModal');
    await renderMemories();
    renderRecentActivity();
    showSuccess('Memory reassigned.');
  } catch (err) {
    showWarning(err.message);
  }
}

// ══════════════════════════════════════════════
// API KEYS PAGE
// ══════════════════════════════════════════════
async function loadApiKeys() {
  const data = await api('/admin/api-keys');
  if (!data) return;
  apiKeys = data.keys || [];
  renderApiKeys();
}

function renderApiKeys() {
  document.getElementById('apiKeysBody').innerHTML = apiKeys.map(k => {
    const status = k.revoked ? 'revoked' : 'active';
    return `<tr>
      <td>${escHtml(k.name)}</td>
      <td class="mono" style="font-size:11px;">${escHtml(k.model_name || '—')}</td>
      <td class="mono" style="font-size:11px;">${escHtml(k.key_prefix)}…</td>
      <td>${fmtDate(k.created_at)}</td>
      <td>${fmtDate(k.last_used_at)}</td>
      <td>${(k.recalls_total || 0).toLocaleString()}</td>
      <td>${(k.stores_total || 0).toLocaleString()}</td>
      <td><span class="statusPill ${status}"><span class="statusDot"></span>${status.toUpperCase()}</span></td>
      <td style="display:flex;gap:6px;align-items:center;">
        ${!k.revoked ? `<button class="btn btn-sm" style="background:transparent;border:1px solid #ef4444;color:#ef4444;" onclick="confirmRevokeKey('${k.id}','${escHtml(k.name)}')">REVOKE</button>` : ''}
        <button class="btn btn-destructive btn-sm" onclick="confirmDeleteKey('${k.id}','${escHtml(k.name)}')">DELETE</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="color:var(--text-dim);text-align:center;padding:16px;">No API keys found.</td></tr>';
}

async function generateKey() {
  const name  = document.getElementById('ak-name').value.trim();
  const model = document.getElementById('ak-model').value.trim();
  if (!name) { showWarning('Key name is required.'); return; }
  try {
    const body = model ? { name, model_name: model } : { name };
    const result = await api('/admin/api-keys', { method: 'POST', body });
    if (!result) return;
    await loadApiKeys();
    document.getElementById('keyRevealCode').textContent = result.key;
    document.getElementById('keyReveal').classList.add('show');
    document.getElementById('copiedMsg').style.display = 'none';
    document.getElementById('ak-name').value = '';
    document.getElementById('ak-model').value = '';
  } catch (err) { showWarning(err.message); }
}

function copyKey() {
  navigator.clipboard.writeText(document.getElementById('keyRevealCode').textContent).then(() => {
    document.getElementById('copiedMsg').style.display = 'inline';
    setTimeout(() => { document.getElementById('copiedMsg').style.display = 'none'; }, 2000);
  });
}

function openAddMemoryModal() {
  document.getElementById('am-category').value = 'fact';
  document.getElementById('am-text').value = '';
  document.getElementById('addMemoryModal').classList.add('show');
}

async function saveMemoryModal() {
  const text = document.getElementById('am-text').value.trim();
  const category = document.getElementById('am-category').value;
  if (!text) return;
  const res = await api('/store', { method:'POST', body:{ text, category } });
  if (res) { closeModal('addMemoryModal'); showSuccess('Memory saved.'); loadOverview(); }
}

function openAddKeyModal() {
  document.getElementById('ak-name').value = '';
  document.getElementById('ak-model').value = '';
  document.getElementById('keyReveal').classList.remove('show');
  document.getElementById('copiedMsg').style.display = 'none';
  document.getElementById('addKeyModal').classList.add('show');
}

function showConfirm(msg, onConfirm, icon = '!') {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmIcon').textContent = icon;
  const btn = document.getElementById('confirmOkBtn');
  btn.onclick = () => { closeModal('confirmModal'); onConfirm(); };
  document.getElementById('confirmModal').classList.add('show');
}

function confirmDeleteKey(id, name) {
  showConfirm(`Delete API key "${name}"? This cannot be undone.`, () => deleteKey(id));
}

function confirmRevokeKey(id, name) {
  showConfirm(`Revoke API key "${name}"? This will permanently disable access.`, () => revokeKey(id), '✕');
}

async function deleteKey(id) {
  try {
    await api('/admin/api-keys/' + id, { method: 'DELETE' });
    await loadApiKeys();
  } catch (err) { showWarning(err.message); }
}

async function revokeKey(id) {
  try {
    await api('/admin/api-keys/' + id + '/revoke', { method: 'POST' });
    await loadApiKeys();
  } catch (err) {
    showWarning('Revoke endpoint not available. Use DELETE to remove the key.');
  }
}

// ══════════════════════════════════════════════
// CONFIG PAGE
// ══════════════════════════════════════════════
async function loadConfig() {
  const data = await api('/config');
  if (!data) return;
  const setSlider = (sliderId, inputId, valId, value) => {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    const label  = document.getElementById(valId);
    if (slider) slider.value = value;
    if (input) input.value = value;
    if (label)  label.textContent = parseFloat(value).toFixed(2);
  };
  setSlider('simSlider',   'simInput',   'simVal',   data.thresholds?.similarity ?? 0.95);
  setSlider('recSlider',   'recInput',   'recVal',   data.thresholds?.recall     ?? 0.01);
  setSlider('alphaSlider', 'alphaInput', 'alphaVal', data.search?.hybridAlpha    ?? 0.7);
  const modelEl = document.getElementById('cfg-embedding');
  const apiPortEl = document.getElementById('cfg-port-api');
  const proxyPortEl = document.getElementById('cfg-port-proxy');
  const qdrantPortEl = document.getElementById('cfg-port-qdrant');
  const decayEl = document.getElementById('decayInput');
  if (modelEl) modelEl.value = data.embedding?.model ?? '';
  if (apiPortEl) apiPortEl.value = data.ports?.api ?? '';
  if (proxyPortEl) proxyPortEl.value = data.ports?.proxy ?? '';
  if (qdrantPortEl) qdrantPortEl.value = data.ports?.qdrant ?? '';
  if (decayEl) decayEl.value = data.decay?.defaultLambda ?? '';
}

function syncConfigInput(prefix) {
  const slider = document.getElementById(prefix + 'Slider');
  const input = document.getElementById(prefix + 'Input');
  const label = document.getElementById(prefix + 'Val');
  if (!slider || !input || !label) return;
  input.value = slider.value;
  label.textContent = parseFloat(slider.value).toFixed(2);
}

function syncConfigSlider(prefix) {
  const slider = document.getElementById(prefix + 'Slider');
  const input = document.getElementById(prefix + 'Input');
  const label = document.getElementById(prefix + 'Val');
  if (!slider || !input || !label) return;
  const next = parseFloat(input.value);
  if (!Number.isFinite(next)) return;
  const min = parseFloat(slider.min || '0');
  const max = parseFloat(slider.max || '1');
  const clamped = Math.min(max, Math.max(min, next));
  slider.value = String(clamped);
  input.value = String(clamped);
  label.textContent = clamped.toFixed(2);
}

async function saveConfig(restartNotice = false) {
  const similarity = parseFloat(document.getElementById('simInput')?.value ?? '0.95');
  const recall = parseFloat(document.getElementById('recInput')?.value ?? '0.01');
  const hybridAlpha = parseFloat(document.getElementById('alphaInput')?.value ?? '0.7');
  const decayLambda = Number(document.getElementById('decayInput')?.value ?? '0');
  const apiPort = parseInt(document.getElementById('cfg-port-api')?.value ?? '8008', 10);
  const proxyPort = parseInt(document.getElementById('cfg-port-proxy')?.value ?? '3001', 10);
  const qdrantPort = parseInt(document.getElementById('cfg-port-qdrant')?.value ?? '5304', 10);
  const isValidPort = value => Number.isInteger(value) && value >= 1 && value <= 65535;

  if (!Number.isFinite(similarity) || similarity < 0 || similarity > 1) {
    showWarning('Similarity threshold must be between 0 and 1.');
    return;
  }
  if (!Number.isFinite(recall) || recall < 0 || recall > 1) {
    showWarning('Recall threshold must be between 0 and 1.');
    return;
  }
  if (!Number.isFinite(hybridAlpha) || hybridAlpha < 0 || hybridAlpha > 1) {
    showWarning('Hybrid alpha must be between 0 and 1.');
    return;
  }
  if (!Number.isFinite(decayLambda) || decayLambda < 0) {
    showWarning('Decay rate must be a number greater than or equal to 0.');
    return;
  }
  if (!isValidPort(apiPort)) {
    showWarning('API port must be between 1 and 65535.');
    return;
  }
  if (!isValidPort(proxyPort)) {
    showWarning('Proxy port must be between 1 and 65535.');
    return;
  }
  if (!isValidPort(qdrantPort)) {
    showWarning('Qdrant port must be between 1 and 65535.');
    return;
  }
  if (new Set([apiPort, proxyPort, qdrantPort]).size < 3) {
    showWarning('API, proxy, and Qdrant ports must all be different.');
    return;
  }

  try {
    const res = await api('/config', {
      method: 'POST',
      body: {
        thresholds: { similarity, recall },
        search: { hybridAlpha },
        decay: { defaultLambda: decayLambda },
        ports: { api: apiPort, proxy: proxyPort, qdrant: qdrantPort },
      },
    });
    if (!res) return;
    await loadConfig();
    showSuccess(restartNotice || res.restartRequired ? 'Config saved. Restart server to apply.' : 'Config saved.');
  } catch (err) {
    showWarning(err.message);
  }
}

function enforceIdentifier(changed) {
  const ids = ['cfg-username','cfg-email','cfg-phone'];
  const checked = ids.filter(id => document.getElementById(id).checked);
  if (checked.length === 0) {
    changed.checked = true;
    showWarning('At least one identifier must be required. Enable at least one of: Username, Email, or Phone Number.');
  }
}

// ══════════════════════════════════════════════
// USERS PAGE
// ══════════════════════════════════════════════
async function loadUsers() {
  const data = await api('/admin/users');
  if (!data) return;
  users = data.users || [];
  renderUsers();
}

function renderUsers() {
  const body = document.getElementById('usersBody');
  if (!body) return;
  body.innerHTML = users.map(u => `
    <tr>
      <td>${escHtml(u.username)}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>
        <button class="btn btn-sm" style="border-color:var(--blue);color:var(--blue);" onclick="openEditUserModal(${JSON.stringify(u).replace(/"/g,'&quot;')})">EDIT</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="color:var(--text-dim);text-align:center;padding:16px;">No users found.</td></tr>';
}

function openAddUserModal() {
  ['au-username','au-password','au-fname','au-lname','au-email','au-phone'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('addUserModal').classList.add('show');
}

async function createUser() {
  const username = document.getElementById('au-username').value.trim();
  const password = document.getElementById('au-password').value.trim();
  if (!username || !password) { showWarning('Username and password are required.'); return; }
  try {
    await api('/admin/users', { method: 'POST', body: { username, password } });
    await loadUsers();
    closeModal('addUserModal');
    showSuccess('User created.');
  } catch (err) { showWarning(err.message); }
}

async function deleteUser(id) {
  try {
    await api('/admin/users/' + id, { method: 'DELETE' });
    await loadUsers();
  } catch (err) { showWarning(err.message); }
}

function openEditUserModal(u) {
  document.getElementById('eu-id').value       = u.id || '';
  document.getElementById('eu-username').value = u.username || '';
  document.getElementById('eu-password').value = '';
  document.getElementById('eu-fname').value    = u.first_name || '';
  document.getElementById('eu-lname').value    = u.last_name  || '';
  document.getElementById('eu-email').value    = u.email      || '';
  document.getElementById('eu-phone').value    = u.phone      || '';
  document.getElementById('editUserModal').classList.add('show');
}

async function saveEditUser() {
  const id       = document.getElementById('eu-id').value;
  const username = document.getElementById('eu-username').value.trim();
  const password = document.getElementById('eu-password').value.trim();
  if (!username) { showWarning('Username is required.'); return; }
  const body = {
    username,
    first_name: document.getElementById('eu-fname').value.trim(),
    last_name:  document.getElementById('eu-lname').value.trim(),
    email:      document.getElementById('eu-email').value.trim(),
    phone:      document.getElementById('eu-phone').value.trim(),
  };
  if (password) body.password = password;
  try {
    await api('/admin/users/' + id, { method: 'PUT', body });
    await loadUsers();
    closeModal('editUserModal');
    showSuccess('User updated.');
  } catch (err) { showWarning(err.message); }
}

// ══════════════════════════════════════════════
// QUICK ADD (overview)
// ══════════════════════════════════════════════
async function quickAddMemory() {
  const text = document.getElementById('qa-text').value.trim();
  const cat  = document.getElementById('qa-category').value;
  if (!text) { showWarning('Memory text is required.'); return; }
  try {
    await api('/store', { method: 'POST', body: { text, category: cat } });
    document.getElementById('qa-text').value = '';
    renderRecentActivity();
    showSuccess('Memory stored.');
  } catch (err) { showWarning(err.message); }
}

async function quickAddKey() {
  const name  = document.getElementById('qa-keyname').value.trim();
  const model = document.getElementById('qa-model').value.trim();
  if (!name) { showWarning('Key name is required.'); return; }
  try {
    const body = model ? { name, model_name: model } : { name };
    const result = await api('/admin/api-keys', { method: 'POST', body });
    if (!result) return;
    document.getElementById('qa-keyname').value = '';
    document.getElementById('qa-model').value = '';
    showSuccess('API Key generated: ' + result.key.slice(0,14) + '…');
  } catch (err) { showWarning(err.message); }
}

async function quickAddUser() {
  const username = document.getElementById('qa-username').value.trim();
  const password = document.getElementById('qa-password').value.trim();
  if (!username || !password) { showWarning('Username and password are required.'); return; }
  try {
    await api('/admin/users', { method: 'POST', body: { username, password } });
    ['qa-username','qa-password','qa-fname','qa-lname','qa-email','qa-phone'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    showSuccess('User created.');
  } catch (err) { showWarning(err.message); }
}

async function restartSidebarService() {
  const btn = document.getElementById('sidebarRebootBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'REBOOTING...';
  }
  try {
    const result = await api('/admin/restart-qdrant', { method: 'POST' });
    if (!result) return;
    showSuccess('Reboot started.');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await loadOverview();
  } catch (err) {
    showWarning(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'REBOOT';
    }
  }
}

// ══════════════════════════════════════════════
// MODALS & TOASTS
// ══════════════════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function showWarning(msg) {
  document.getElementById('warnMsg').textContent = msg;
  document.getElementById('warningModal').classList.add('show');
}

let toastTimer = null;
function showSuccess(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = '✓ ' + msg;
  toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
async function init() {
  await Promise.all([ loadOverview(), loadApiKeys(), loadUsers() ]);
  clearInterval(latencyPoller);
  latencyPoller = setInterval(async () => {
    try {
      const h = await api('/health');
      if (h) {
        setSidebarConnection('Connected', true);
        latencyBuf.push({ v: h.avgRecallMs || 0 });
        if (latencyBuf.length > 30) latencyBuf.shift();
        const activePage = document.querySelector('.page.active')?.id;
        if (activePage === 'page-overview') drawCharts(latencyBuf);
        const c = h.components || {};
        setSidebarLights({
          server: c.server?.status === 'ok',
          qdrant: c.qdrant?.status === 'ok',
        });
      } else {
        setSidebarConnection('Disconnected', false);
        setSidebarLights({ server: false, qdrant: false });
      }
    } catch (err) {
      console.error('health poll failed:', err);
      setSidebarConnection('Disconnected', false);
      setSidebarLights({ server: false, qdrant: false });
    }
  }, 30000);
}

if (JWT) {
  init();
} else {
  showLoginOverlay();
  drawCharts([], {});
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => drawCharts(latencyBuf), 200);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['memModal','addMemoryModal','addUserModal','editUserModal','warningModal','addKeyModal','confirmModal'].forEach(closeModal);
  }
});
