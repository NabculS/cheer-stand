'use strict';

/**
 * Cheer Stand — Admin Dashboard
 * Graph Mode (Live Score Ranking) & User History Management
 */

const ADMIN_TOKEN_KEY = 'cheer_admin_token';
const TOTAL_ROUNDS = 5;
const MAX_SCORE = 1500;
const REFRESH_MS = 6000;

let adminToken = '';
let allUsers = [];
let loading = false;
let refreshTimer = null;
let currentView = 'graph'; // 'graph' or 'users'

function $(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatClock(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function statusInfo(status) {
  if (status === 'finished') return { className: 'finished', label: 'เล่นจบ' };
  if (status === 'playing') return { className: 'playing', label: 'กำลังเล่น' };
  return { className: 'waiting', label: 'ยังไม่เริ่ม' };
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */

async function adminApi(path, options) {
  const opts = options || {};
  const headers = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  const response = await fetch(path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    error.status = response.status;
    throw error;
  }

  return data;
}

/* ------------------------------------------------------------------ */
/* Toast Messages                                                     */
/* ------------------------------------------------------------------ */

let toastTimer = null;
function toast(message, kind = 'info') {
  const box = $('admin-toast');
  if (!box) return;
  box.textContent = message;
  box.className = `admin-toast ${kind} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.remove('show');
  }, 3200);
}

/* ------------------------------------------------------------------ */
/* Login / Logout                                                     */
/* ------------------------------------------------------------------ */

function showLogin(message) {
  $('admin-dashboard').classList.add('hidden');
  $('admin-login-screen').classList.remove('hidden');
  if (message) showLoginError(message);
  else hideLoginError();
  const pass = $('admin-pass');
  if (pass) pass.value = '';
  const id = $('admin-id');
  if (id) id.value = '';
}

function showLoginError(message) {
  const box = $('admin-error');
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideLoginError() {
  const box = $('admin-error');
  box.classList.add('hidden');
  box.textContent = '';
}

async function handleAdminLogin(event) {
  event.preventDefault();
  hideLoginError();

  const form = $('admin-login-form');
  const username = $('admin-id').value.trim();
  const password = $('admin-pass').value;
  const submit = form.querySelector('button[type="submit"]');

  if (!username || !password) {
    showLoginError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    return;
  }

  if (submit) submit.disabled = true;

  try {
    adminToken = '';
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: username, password })
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
    }

    if (data.role !== 'admin') {
      throw new Error('บัญชีนี้ไม่ใช่ผู้ดูแลระบบ');
    }

    adminToken = data.token;
    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    } catch {
      /* ignore */
    }

    await openDashboard();
  } catch (err) {
    showLoginError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function logoutAdmin(showMessage) {
  adminToken = '';
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  allUsers = [];
  stopAutoRefresh();
  showLogin();
  if (showMessage) toast('ออกจากระบบผู้ดูแลแล้ว', 'ok');
}

/* ------------------------------------------------------------------ */
/* Navigation Views                                                   */
/* ------------------------------------------------------------------ */

function switchView(viewName) {
  currentView = viewName;
  $('tab-graph').classList.toggle('active', viewName === 'graph');
  $('tab-users').classList.toggle('active', viewName === 'users');

  $('view-graph').classList.toggle('hidden', viewName !== 'graph');
  $('view-users').classList.toggle('hidden', viewName !== 'users');

  if (viewName === 'graph') {
    renderLeaderboard();
  } else {
    renderTable();
  }
}

/* ------------------------------------------------------------------ */
/* Load Data                                                          */
/* ------------------------------------------------------------------ */

async function openDashboard() {
  $('admin-login-screen').classList.add('hidden');
  $('admin-dashboard').classList.remove('hidden');
  await loadUsers(true);
  startAutoRefresh();
}

async function loadUsers(force) {
  if (loading && !force) return;
  if (!adminToken) {
    showLogin();
    return;
  }

  loading = true;
  try {
    const data = await adminApi('/api/admin/users');
    allUsers = Array.isArray(data.users) ? data.users : [];
    renderSummary();
    if (currentView === 'graph') {
      renderLeaderboard();
    } else {
      renderTable();
    }
    $('admin-updated').textContent = `อัปเดต ${formatClock(new Date().toISOString())}`;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      logoutAdmin(false);
      showLoginError('เซสชันผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    } else {
      toast(err.message || 'โหลดข้อมูลไม่สำเร็จ', 'error');
    }
  } finally {
    loading = false;
  }
}

/* ------------------------------------------------------------------ */
/* Summary Metrics                                                    */
/* ------------------------------------------------------------------ */

function renderSummary() {
  const players = allUsers.filter(u => u.studentId !== 'admin');
  const total = players.length;
  const finished = players.filter((u) => u.status === 'finished').length;
  const playing = players.filter((u) => u.status === 'playing').length;
  const waiting = players.filter((u) => u.status === 'waiting').length;
  const sum = players.reduce((acc, u) => acc + (Number(u.bestScore || u.score) || 0), 0);
  const average = total ? Math.round(sum / total) : 0;

  $('stat-total').textContent = String(total);
  $('stat-finished').textContent = String(finished);
  $('stat-playing').textContent = String(playing);
  $('stat-waiting').textContent = String(waiting);
  $('stat-avg').textContent = String(average);
}

/* ------------------------------------------------------------------ */
/* GRAPH / LIVE SCORE LEADERBOARD (Inspired by photo1.png)            */
/* ------------------------------------------------------------------ */

function renderLeaderboard() {
  const container = $('leaderboard-list');
  container.textContent = '';

  // Filter out admin, sort by best score descending
  const rankedPlayers = allUsers
    .filter(u => u.studentId !== 'admin')
    .slice()
    .sort((a, b) => {
      const scoreDiff = (b.bestScore || b.score || 0) - (a.bestScore || a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.playCount || 0) - (a.playCount || 0);
    });

  if (rankedPlayers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'ยังไม่มีผู้เล่นสมัครหรือเริ่มเล่น';
    container.append(empty);
    return;
  }

  rankedPlayers.forEach((player, index) => {
    const rank = index + 1;
    const score = clamp(player.bestScore !== undefined ? player.bestScore : player.score, 0, MAX_SCORE);
    const percent = Math.min(100, Math.round((score / MAX_SCORE) * 100));

    const card = document.createElement('div');
    card.className = `leaderboard-item ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''}`;

    // Rank badge
    const rankEl = document.createElement('div');
    rankEl.className = 'item-rank';
    rankEl.textContent = `อันดับ ${rank}`;

    // Player details
    const infoEl = document.createElement('div');
    infoEl.className = 'item-info';

    const topRow = document.createElement('div');
    topRow.className = 'item-top-row';

    const nameEl = document.createElement('b');
    nameEl.className = 'item-name';
    nameEl.textContent = player.fullName || 'ผู้เล่น';

    const idEl = document.createElement('span');
    idEl.className = 'item-id';
    idEl.textContent = `รหัส ${player.studentId}`;

    const scoreBadge = document.createElement('span');
    scoreBadge.className = 'item-score-badge';
    scoreBadge.textContent = `${score} / ${MAX_SCORE}`;

    topRow.append(nameEl, idEl, scoreBadge);

    // Graph bar (styled like photo1.png with dark track and vibrant green bar)
    const barWrap = document.createElement('div');
    barWrap.className = 'item-graph-track';

    const barFill = document.createElement('div');
    barFill.className = 'item-graph-fill';
    barFill.style.width = `${percent}%`;

    barWrap.append(barFill);

    // Meta row (times played, status)
    const metaRow = document.createElement('div');
    metaRow.className = 'item-meta-row';

    const status = statusInfo(player.status);
    const statusEl = document.createElement('span');
    statusEl.className = `badge ${status.className}`;
    statusEl.textContent = status.label;

    const playsEl = document.createElement('small');
    playsEl.textContent = `เล่นแล้ว ${player.playCount || (player.history ? player.history.length : 0)} ครั้ง`;

    metaRow.append(statusEl, playsEl);

    infoEl.append(topRow, barWrap, metaRow);

    // History button
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'btn btn-ghost btn-sm';
    historyBtn.textContent = 'ดูประวัติ';
    historyBtn.addEventListener('click', () => openHistoryModal(player));

    card.append(rankEl, infoEl, historyBtn);
    container.append(card);
  });
}

/* ------------------------------------------------------------------ */
/* Table View (Users Management)                                      */
/* ------------------------------------------------------------------ */

function filteredUsers() {
  const query = $('admin-search').value.trim().toLowerCase();
  const status = $('admin-filter').value;

  return allUsers.filter((user) => {
    if (status !== 'all' && user.status !== status) return false;
    if (!query) return true;
    const name = String(user.fullName || '').toLowerCase();
    const id = String(user.studentId || '').toLowerCase();
    return name.includes(query) || id.includes(query);
  });
}

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  if (text !== undefined && text !== null) td.textContent = String(text);
  return td;
}

function renderTable() {
  const tbody = $('users-tbody');
  tbody.textContent = '';

  const users = filteredUsers();

  if (users.length === 0) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 9;
    td.textContent = allUsers.length
      ? 'ไม่พบผู้เล่นที่ตรงกับคำค้นหา/ตัวกรอง'
      : 'ยังไม่มีผู้สมัคร';
    row.append(td);
    tbody.append(row);
    $('table-info').textContent = `แสดง 0 จาก ${allUsers.length} คน`;
    return;
  }

  users.forEach((user, index) => {
    const row = document.createElement('tr');
    const isAdmin = user.studentId === 'admin' || user.isProtected;

    row.append(cell(index + 1));

    const nameTd = cell(user.fullName || '—', 'cell-name');
    if (isAdmin) {
      const adminTag = document.createElement('span');
      adminTag.className = 'badge admin-badge';
      adminTag.textContent = 'ผู้ดูแล (ห้ามลบ)';
      nameTd.append(document.createTextNode(' '), adminTag);
    }
    row.append(nameTd);

    row.append(cell(user.studentId || '—', 'cell-id'));

    // Highest Score Cell
    const scoreTd = document.createElement('td');
    scoreTd.className = 'score-cell';
    const score = document.createElement('b');
    score.textContent = String(clamp(user.bestScore !== undefined ? user.bestScore : user.score, 0, MAX_SCORE));
    scoreTd.append(score);
    row.append(scoreTd);

    // Play count
    const countTd = document.createElement('td');
    countTd.textContent = `${user.playCount || (user.history ? user.history.length : 0)} ครั้ง`;
    row.append(countTd);

    // Status Cell
    const statusTd = document.createElement('td');
    const status = statusInfo(user.status);
    const badge = document.createElement('span');
    badge.className = `badge ${status.className}`;
    badge.textContent = status.label;
    statusTd.append(badge);
    row.append(statusTd);

    // History View Button Cell
    const historyTd = document.createElement('td');
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'mini-btn';
    historyBtn.textContent = 'ดูประวัติ';
    historyBtn.addEventListener('click', () => openHistoryModal(user));
    historyTd.append(historyBtn);
    row.append(historyTd);

    row.append(cell(formatDateTime(user.createdAt), 'time-cell'));

    // Actions Cell
    const actionsTd = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'mini-btn';
    resetBtn.textContent = 'รีเซ็ต';
    resetBtn.title = 'รีเซ็ตคะแนนและสถานะ';
    resetBtn.addEventListener('click', () => resetUser(user));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'mini-btn danger';
    deleteBtn.textContent = 'ลบ';
    deleteBtn.title = isAdmin ? 'ผู้ดูแลระบบห้ามลบ' : 'ลบข้อมูลผู้เล่นคนนี้';
    if (isAdmin) {
      deleteBtn.disabled = true;
      deleteBtn.style.opacity = '0.35';
      deleteBtn.style.cursor = 'not-allowed';
    } else {
      deleteBtn.addEventListener('click', () => deleteUser(user));
    }

    actions.append(resetBtn, deleteBtn);
    actionsTd.append(actions);
    row.append(actionsTd);

    tbody.append(row);
  });

  $('table-info').textContent = `แสดง ${users.length} จาก ${allUsers.length} คน`;
}

/* ------------------------------------------------------------------ */
/* Play History Modal                                                 */
/* ------------------------------------------------------------------ */

function openHistoryModal(user) {
  $('modal-title').textContent = `ประวัติการเล่น: ${user.fullName || 'ผู้เล่น'}`;
  $('modal-subtitle').textContent = `เลขประจำตัว ${user.studentId} · คะแนนสูงสุด ${user.bestScore || user.score || 0} คะแนน`;

  const container = $('history-list');
  container.textContent = '';

  const history = Array.isArray(user.history) ? user.history : [];

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'ยังไม่มีประวัติการเล่นที่บันทึกไว้';
    container.append(empty);
  } else {
    history.forEach((record, index) => {
      const card = document.createElement('div');
      card.className = 'history-item pixel-border';

      const head = document.createElement('div');
      head.className = 'history-head';

      const num = document.createElement('b');
      num.textContent = `รอบที่เล่น #${history.length - index}`;

      const date = document.createElement('span');
      date.className = 'muted';
      date.textContent = formatDateTime(record.finishedAt || record.startedAt);

      head.append(num, date);

      const stats = document.createElement('div');
      stats.className = 'history-stats';

      const s1 = document.createElement('div');
      s1.innerHTML = `<span>คะแนน</span><b>${record.score || 0}/${MAX_SCORE}</b>`;

      const s2 = document.createElement('div');
      s2.innerHTML = `<span>ถูก/ผิด</span><b>${record.correct || 0} / ${record.wrong || 0}</b>`;

      const s3 = document.createElement('div');
      s3.innerHTML = `<span>เวลาที่ใช้</span><b>${record.timeUsed ? record.timeUsed + ' วินาที' : '—'}</b>`;

      stats.append(s1, s2, s3);
      card.append(head, stats);
      container.append(card);
    });
  }

  $('history-modal').classList.remove('hidden');
}

function closeHistoryModal() {
  $('history-modal').classList.add('hidden');
}

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

async function resetUser(user) {
  const ok = window.confirm(
    `รีเซ็ตผลของ ${user.fullName || user.studentId}?\nคะแนนและสถานะรอบปัจจุบันจะกลับเป็น 0 เพื่อเริ่มเล่นใหม่`
  );
  if (!ok) return;

  try {
    await adminApi('/api/admin/reset', {
      method: 'POST',
      body: { studentId: user.studentId }
    });
    toast(`รีเซ็ต ${user.fullName || user.studentId} แล้ว`, 'ok');
    await loadUsers(true);
  } catch (err) {
    toast(err.message || 'รีเซ็ตไม่สำเร็จ', 'error');
  }
}

async function resetAll() {
  const ok = window.confirm(
    'รีเซ็ตผู้เล่นทุกคน?\nความคืบหน้ารอบปัจจุบันของทุกคนจะถูกล้างเพื่อให้เริ่มรอบใหม่พร้อมกัน'
  );
  if (!ok) return;

  try {
    const data = await adminApi('/api/admin/reset', {
      method: 'POST',
      body: {}
    });
    toast(`รีเซ็ตผู้เล่น ${data.reset || 0} คนแล้ว`, 'ok');
    await loadUsers(true);
  } catch (err) {
    toast(err.message || 'รีเซ็ตทั้งหมดไม่สำเร็จ', 'error');
  }
}

async function deleteUser(user) {
  if (user.studentId === 'admin' || user.isProtected) {
    toast('ห้ามลบผู้ดูแลระบบ (admin)', 'error');
    return;
  }

  const ok = window.confirm(
    `ลบข้อมูลของ ${user.fullName || user.studentId} ออกจากระบบ?\nการลบไม่สามารถย้อนกลับได้`
  );
  if (!ok) return;

  try {
    await adminApi('/api/admin/delete', {
      method: 'POST',
      body: { studentId: user.studentId }
    });
    toast(`ลบ ${user.fullName || user.studentId} แล้ว`, 'ok');
    await loadUsers(true);
  } catch (err) {
    toast(err.message || 'ลบไม่สำเร็จ', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* CSV Export                                                         */
/* ------------------------------------------------------------------ */

function csvCell(value) {
  let text = String(value === undefined || value === null ? '' : value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv() {
  if (allUsers.length === 0) {
    toast('ยังไม่มีข้อมูลให้ export', 'error');
    return;
  }

  const header = [
    'อันดับ',
    'ชื่อ-นามสกุล',
    'เลขประจำตัว',
    'คะแนนสูงสุด',
    'คะแนนล่าสุด',
    'จำนวนครั้งที่เล่น',
    'สถานะ',
    'สมัครเมื่อ'
  ];

  const rows = allUsers.map((u, i) => [
    i + 1,
    u.fullName || '',
    u.studentId || '',
    u.bestScore || u.score || 0,
    u.score || 0,
    u.playCount || (u.history ? u.history.length : 0),
    statusInfo(u.status).label,
    formatDateTime(u.createdAt)
  ]);

  const csvContent =
    '\uFEFF' +
    [header.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `cheer_stand_scores_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast('ดาวน์โหลด CSV เรียบร้อย', 'ok');
}

/* ------------------------------------------------------------------ */
/* Auto Refresh                                                       */
/* ------------------------------------------------------------------ */

function startAutoRefresh() {
  stopAutoRefresh();
  const checkbox = $('auto-refresh');
  if (checkbox && !checkbox.checked) return;

  refreshTimer = setInterval(() => {
    if (!document.hidden && adminToken) {
      loadUsers(false);
    }
  }, REFRESH_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

function bootAdmin() {
  $('admin-login-form').addEventListener('submit', handleAdminLogin);
  $('admin-logout').addEventListener('click', () => logoutAdmin(true));
  $('admin-refresh').addEventListener('click', () => loadUsers(true));

  $('tab-graph').addEventListener('click', () => switchView('graph'));
  $('tab-users').addEventListener('click', () => switchView('users'));

  $('admin-search').addEventListener('input', () => {
    if (currentView === 'users') renderTable();
  });
  $('admin-filter').addEventListener('change', () => {
    if (currentView === 'users') renderTable();
  });

  $('export-csv').addEventListener('click', exportCsv);
  $('reset-all').addEventListener('click', resetAll);

  const autoBox = $('auto-refresh');
  if (autoBox) {
    autoBox.addEventListener('change', () => {
      if (autoBox.checked) startAutoRefresh();
      else stopAutoRefresh();
    });
  }

  $('modal-close').addEventListener('click', closeHistoryModal);
  $('history-modal').querySelector('.modal-backdrop').addEventListener('click', closeHistoryModal);

  let saved = '';
  try {
    saved = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    saved = '';
  }

  if (saved) {
    adminToken = saved;
    openDashboard();
  } else {
    showLogin();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAdmin);
} else {
  bootAdmin();
}
