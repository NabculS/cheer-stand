'use strict';

/**
 * Supabase client adapter for Cheer Stand
 * Uses Node 18+ native fetch - zero external dependencies required!
 */

function getConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
  return {
    url,
    key,
    isConfigured: Boolean(url && key)
  };
}

function getHeaders() {
  const { key } = getConfig();
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'return=representation'
  };
}

async function supaFetch(path, options = {}) {
  const { url, isConfigured } = getConfig();
  if (!isConfigured) return null;

  const targetUrl = `${url}/rest/v1/${path}`;
  const res = await fetch(targetUrl, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Supabase error [${res.status}] ${path}:`, errorText);
    throw new Error(`Supabase request failed: ${res.statusText}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapUserRow(row) {
  const history = Array.isArray(row.game_history)
    ? row.game_history.map((h) => ({
        runId: h.run_id,
        score: h.score,
        correct: h.correct,
        wrong: h.wrong,
        timeUsed: h.time_used,
        startedAt: h.started_at,
        finishedAt: h.finished_at
      }))
    : [];

  history.sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')));

  return {
    studentId: row.student_id,
    fullName: row.full_name,
    password: row.password,
    score: row.score || 0,
    bestScore: row.best_score || row.score || 0,
    progress: row.progress || 0,
    correct: row.correct || 0,
    wrong: row.wrong || 0,
    finished: Boolean(row.finished),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    playCount: history.length,
    history
  };
}

async function loadAllUsers() {
  const { isConfigured } = getConfig();
  if (!isConfigured) return null;

  try {
    const rows = await supaFetch('users?select=*,game_history(*)');
    if (!Array.isArray(rows)) return null;

    const usersMap = {};
    for (const row of rows) {
      usersMap[row.student_id] = mapUserRow(row);
    }
    return usersMap;
  } catch (err) {
    console.warn('Could not load users from Supabase, fallback to local db:', err.message);
    return null;
  }
}

async function getUser(studentId) {
  const { isConfigured } = getConfig();
  if (!isConfigured) return null;

  try {
    const rows = await supaFetch(
      `users?student_id=eq.${encodeURIComponent(studentId)}&select=*,game_history(*)`
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return mapUserRow(rows[0]);
  } catch (err) {
    console.warn('Could not load user from Supabase:', err.message);
    return null;
  }
}

async function upsertUser(user) {
  const { isConfigured } = getConfig();
  if (!isConfigured) return;

  try {
    const payload = {
      student_id: user.studentId,
      full_name: user.fullName,
      password: user.password,
      score: user.score || 0,
      best_score: user.bestScore || user.score || 0,
      progress: user.progress || 0,
      correct: user.correct || 0,
      wrong: user.wrong || 0,
      finished: Boolean(user.finished),
      started_at: user.startedAt,
      finished_at: user.finishedAt,
      created_at: user.createdAt,
      last_seen: user.lastSeen
    };

    await supaFetch('users?on_conflict=student_id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Failed to upsert user to Supabase:', err.message);
  }
}

async function recordGameHistory(studentId, record) {
  const { isConfigured } = getConfig();
  if (!isConfigured) return;

  try {
    const payload = {
      student_id: studentId,
      run_id: record.runId,
      score: record.score,
      correct: record.correct,
      wrong: record.wrong,
      time_used: record.timeUsed,
      started_at: record.startedAt,
      finished_at: record.finishedAt
    };

    await supaFetch('game_history?on_conflict=run_id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Failed to record game history to Supabase:', err.message);
  }
}

async function removeUser(studentId) {
  const { isConfigured } = getConfig();
  if (!isConfigured) return;

  try {
    await supaFetch(`users?student_id=eq.${encodeURIComponent(studentId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Failed to delete user from Supabase:', err.message);
  }
}

module.exports = {
  loadAllUsers,
  getUser,
  upsertUser,
  recordGameHistory,
  removeUser
};

Object.defineProperty(module.exports, 'isConfigured', {
  get: () => getConfig().isConfigured
});
