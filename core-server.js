'use strict';

/**
 * Cheer Stand — By CheerDeb
 * Stand simulation and card stunt game
 *
 * Backend server:
 *   - Serves the game and admin dashboard
 *   - Manages accounts, scores, play history, and live ranking
 *   - Works locally with ./data/db.json and seamlessly with Supabase
 *   - Node.js 18+ native (zero external npm dependencies)
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;

// Auto-load .env file if present
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not load .env file:', err.message);
  }
}
loadEnv();

const supabase = require('./lib/supabase');

const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.CHEER_ADMIN_PASSWORD || process.env.RAPHEY_ADMIN_PASSWORD || '1234';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.CHEER_SESSION_SECRET || `${ADMIN_PASSWORD}|cheer-stand-session`;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;

const TOTAL_ROUNDS = 5;
const MAX_SCORE = 1500;
const ROUND_SECONDS = 60;

let db = { users: {} };
let saveChain = Promise.resolve();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function nowIso() {
  return new Date().toISOString();
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function publicUser(user) {
  return {
    studentId: user.studentId,
    fullName: user.fullName,
    score: user.score || 0,
    bestScore: user.bestScore !== undefined ? user.bestScore : (user.score || 0),
    progress: user.progress || 0,
    correct: user.correct || 0,
    wrong: user.wrong || 0,
    finished: Boolean(user.finished),
    startedAt: user.startedAt || null,
    finishedAt: user.finishedAt || null,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen,
    playCount: user.playCount || (user.history ? user.history.length : 0),
    history: Array.isArray(user.history) ? user.history : []
  };
}

function statusOf(user) {
  if (user.finished) return 'finished';
  if ((user.progress > 0 && user.progress < TOTAL_ROUNDS) || user.startedAt) return 'playing';
  return 'waiting';
}

function createSession(role, studentId) {
  const payload = {
    role,
    studentId: studentId || null,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function getSession(req) {
  const token = bearerToken(req);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return { ...payload, token };
  } catch {
    return null;
  }
}

async function getFreshUser(studentId) {
  if (supabase.isConfigured) {
    try {
      const remote = await supabase.getUser(studentId);
      if (remote) {
        db.users[studentId] = remote;
        return remote;
      }
      return null;
    } catch (err) {
      console.error('Could not refresh user from Supabase:', err.message);
    }
  }
  return db.users[studentId] || null;
}

async function requirePlayer(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'player') {
    sendJson(res, 401, { ok: false, error: 'unauthorized', message: 'กรุณาเข้าสู่ระบบใหม่' });
    return null;
  }
  const user = await getFreshUser(session.studentId);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'unauthorized', message: 'ไม่พบผู้ใช้นี้' });
    return null;
  }
  return { session, user };
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') {
    sendJson(res, 403, { ok: false, error: 'forbidden', message: 'ต้องเข้าสู่ระบบผู้ดูแล' });
    return null;
  }
  return session;
}

async function loadDb() {
  // 1. Supabase is the source of truth when configured (required on Vercel)
  if (supabase.isConfigured) {
    const remoteUsers = await supabase.loadAllUsers();
    if (remoteUsers) {
      db.users = remoteUsers;
      console.log(`Loaded ${Object.keys(db.users).length} accounts from Supabase`);
      ensureAdminInDb();
      return;
    }
  }

  // 2. Otherwise load local JSON (local development fallback)
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* read-only filesystem on Vercel */
  }

  try {
    const raw = await fsp.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db.users = parsed && parsed.users && typeof parsed.users === 'object'
      ? parsed.users
      : {};
    console.log(`Loaded ${Object.keys(db.users).length} accounts from data/db.json`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No data file yet; starting with an empty player list.');
      db.users = {};
    } else {
      console.error('Error reading db.json:', err.message);
    }
  }

  ensureAdminInDb();
  await persistLocal();
}

function ensureAdminInDb() {
  if (!db.users[ADMIN_USERNAME]) {
    db.users[ADMIN_USERNAME] = {
      studentId: ADMIN_USERNAME,
      fullName: 'ผู้ดูแลระบบ (admin)',
      password: ADMIN_PASSWORD,
      score: 3000,
      bestScore: 3000,
      progress: TOTAL_ROUNDS,
      correct: TOTAL_ROUNDS,
      wrong: 0,
      finished: true,
      startedAt: nowIso(),
      finishedAt: nowIso(),
      createdAt: nowIso(),
      lastSeen: nowIso(),
      isProtected: true,
      history: []
    };
  } else {
    db.users[ADMIN_USERNAME].isProtected = true;
    db.users[ADMIN_USERNAME].password = ADMIN_PASSWORD;
  }
}

function persistLocal() {
  // Supabase is the source of truth in cloud mode; local file is not needed
  if (supabase.isConfigured) return Promise.resolve();

  const snapshot = JSON.stringify(db, null, 2);
  saveChain = saveChain
    .then(async () => {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      await fsp.writeFile(tmp, snapshot, 'utf8');
      await fsp.rename(tmp, DATA_FILE);
    })
    .catch((err) => {
      console.error('Could not save data file:', err.message);
    });
  return saveChain;
}

async function persist(targetUser) {
  await persistLocal();
  if (targetUser && supabase.isConfigured) {
    await supabase.upsertUser(targetUser);
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload_too_large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid_json'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fullNameFrom(body, firstName, lastName) {
  if (body && typeof body.fullName === 'string' && body.fullName.trim()) {
    return body.fullName;
  }
  return [firstName, lastName].filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* API Actions                                                        */
/* ------------------------------------------------------------------ */

async function handleRegister(req, res) {
  const body = await readJson(req);
  const firstName = normalizeName(body.firstName);
  const lastName = normalizeName(body.lastName);
  const fullName = normalizeName(fullNameFrom(body, firstName, lastName));
  const studentId = String(body.studentId || '').trim();
  const password = String(body.password || '');

  if (fullName.length < 2) {
    return sendJson(res, 400, {
      ok: false,
      error: 'invalid_name',
      message: 'กรุณากรอกชื่อจริงและนามสกุล'
    });
  }

  // Exactly 5 digits required
  if (!/^\d{5}$/.test(studentId)) {
    return sendJson(res, 400, {
      ok: false,
      error: 'invalid_student_id',
      message: 'เลขประจำตัวต้องเป็นตัวเลข 5 หลักเท่านั้น'
    });
  }

  if (studentId.toLowerCase() === ADMIN_USERNAME) {
    return sendJson(res, 400, {
      ok: false,
      error: 'invalid_student_id',
      message: 'เลขประจำตัวนี้ถูกสงวนไว้สำหรับผู้ดูแล'
    });
  }

  if (password.length < 4) {
    return sendJson(res, 400, {
      ok: false,
      error: 'invalid_password',
      message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'
    });
  }

  if (await getFreshUser(studentId)) {
    return sendJson(res, 409, {
      ok: false,
      error: 'student_id_exists',
      message: 'เลขประจำตัวนี้สมัครแล้ว กรุณาเข้าสู่ระบบ'
    });
  }

  const user = {
    studentId,
    fullName: fullName || [firstName, lastName].filter(Boolean).join(' '),
    password,
    score: 0,
    bestScore: 0,
    progress: 0,
    correct: 0,
    wrong: 0,
    finished: false,
    startedAt: null,
    finishedAt: null,
    createdAt: nowIso(),
    lastSeen: nowIso(),
    playCount: 0,
    history: []
  };

  db.users[studentId] = user;
  await persist(user);

  const token = createSession('player', studentId);
  return sendJson(res, 201, { ok: true, role: 'player', token, user: publicUser(user) });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const studentId = String(body.studentId || '').trim();
  const password = String(body.password || '');

  if (!studentId || !password) {
    return sendJson(res, 400, {
      ok: false,
      error: 'missing_fields',
      message: 'กรุณากรอกเลขประจำตัวและรหัสผ่าน'
    });
  }

  // Check Admin Login
  if (studentId.toLowerCase() === ADMIN_USERNAME) {
    if (password !== ADMIN_PASSWORD) {
      return sendJson(res, 401, {
        ok: false,
        error: 'invalid_credentials',
        message: 'รหัสผ่านผู้ดูแลไม่ถูกต้อง'
      });
    }

    const token = createSession('admin', null);
    return sendJson(res, 200, {
      ok: true,
      role: 'admin',
      token,
      user: { studentId: ADMIN_USERNAME, fullName: 'ผู้ดูแลระบบ (admin)' }
    });
  }

  // Player Login (must be 5 digits)
  const user = await getFreshUser(studentId);
  if (!user || String(user.password) !== password) {
    return sendJson(res, 401, {
      ok: false,
      error: 'invalid_credentials',
      message: 'เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง'
    });
  }

  user.lastSeen = nowIso();
  await persist(user);

  const token = createSession('player', studentId);
  return sendJson(res, 200, { ok: true, role: 'player', token, user: publicUser(user) });
}

async function handleMe(req, res) {
  const auth = await requirePlayer(req, res);
  if (!auth) return;
  return sendJson(res, 200, { ok: true, user: publicUser(auth.user) });
}

async function handleRestart(req, res) {
  const auth = await requirePlayer(req, res);
  if (!auth) return;

  const user = auth.user;
  user.score = 0;
  user.progress = 0;
  user.correct = 0;
  user.wrong = 0;
  user.finished = false;
  user.startedAt = nowIso();
  user.finishedAt = null;
  user.lastSeen = nowIso();

  await persist(user);
  return sendJson(res, 200, { ok: true, user: publicUser(user) });
}

async function handleProgress(req, res) {
  const auth = await requirePlayer(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const user = auth.user;

  // Score can never be negative, clamp 0 to MAX_SCORE
  const score = clamp(body.score, 0, MAX_SCORE);
  const progress = clamp(body.progress, 0, TOTAL_ROUNDS);
  const correct = clamp(body.correct, 0, TOTAL_ROUNDS);
  const wrong = clamp(body.wrong, 0, TOTAL_ROUNDS);
  const finished = Boolean(body.finished);

  user.score = score;
  user.progress = progress;
  user.correct = correct;
  user.wrong = wrong;
  user.lastSeen = nowIso();

  if (!user.startedAt) user.startedAt = nowIso();

  // Keep track of best score
  user.bestScore = Math.max(user.bestScore || 0, score);

  let record = null;

  if (finished) {
    user.finished = true;
    user.progress = TOTAL_ROUNDS;
    user.finishedAt = nowIso();

    if (!Array.isArray(user.history)) user.history = [];
    record = {
      runId: body.runId || newToken(),
      score,
      correct,
      wrong,
      timeUsed: Number(body.timeUsed) || null,
      startedAt: user.startedAt,
      finishedAt: user.finishedAt
    };
    if (!user.history.some((entry) => entry.runId === record.runId)) {
      user.history.unshift(record);
    }
    user.playCount = user.history.length;
  }

  await persist(user);

  // Wait for the history insert before the serverless function ends
  if (finished && record && supabase.isConfigured) {
    await supabase.recordGameHistory(user.studentId, record);
  }

  return sendJson(res, 200, { ok: true, user: publicUser(user) });
}

async function handleAdminUsers(req, res) {
  if (!requireAdmin(req, res)) return;

  // Always read the latest leaderboard from Supabase on serverless deployments
  if (supabase.isConfigured) {
    const remoteUsers = await supabase.loadAllUsers();
    if (remoteUsers) {
      db.users = remoteUsers;
      ensureAdminInDb();
    }
  }

  const users = Object.values(db.users)
    .sort((a, b) => {
      // Sort highest score first, then by creation date
      const scoreDiff = (b.bestScore || b.score || 0) - (a.bestScore || a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    })
    .map((user) => {
      // Never send player passwords to the admin browser (privacy)
      const { password, ...safeUser } = user;
      return {
        ...safeUser,
        bestScore: user.bestScore !== undefined ? user.bestScore : (user.score || 0),
        playCount: user.playCount || (user.history ? user.history.length : 0),
        history: Array.isArray(user.history) ? user.history : [],
        status: statusOf(user),
        isProtected: user.studentId === ADMIN_USERNAME || Boolean(user.isProtected)
      };
    });

  return sendJson(res, 200, {
    ok: true,
    users,
    meta: {
      totalRounds: TOTAL_ROUNDS,
      maxScore: MAX_SCORE,
      roundSeconds: ROUND_SECONDS,
      serverTime: nowIso()
    }
  });
}

async function handleAdminReset(req, res) {
  if (!requireAdmin(req, res)) return;

  const body = await readJson(req);
  const studentId = String(body.studentId || '').trim();

  function resetUser(user) {
    user.score = 0;
    user.progress = 0;
    user.correct = 0;
    user.wrong = 0;
    user.finished = false;
    user.startedAt = null;
    user.finishedAt = null;
    user.lastSeen = nowIso();
  }

  if (studentId) {
    const user = await getFreshUser(studentId);
    if (!user) {
      return sendJson(res, 404, {
        ok: false,
        error: 'user_not_found',
        message: 'ไม่พบผู้ใช้นี้'
      });
    }
    resetUser(user);
    await persist(user);
    return sendJson(res, 200, { ok: true, reset: 1 });
  }

  // Refresh the full list before a bulk reset so every instance stays consistent
  if (supabase.isConfigured) {
    const remoteUsers = await supabase.loadAllUsers();
    if (remoteUsers) {
      db.users = remoteUsers;
      ensureAdminInDb();
    }
  }

  const targets = Object.values(db.users).filter((user) => user.studentId !== ADMIN_USERNAME);
  targets.forEach(resetUser);
  await Promise.all(targets.map((user) => persist(user)));

  return sendJson(res, 200, { ok: true, reset: targets.length });
}

async function handleAdminDelete(req, res) {
  if (!requireAdmin(req, res)) return;

  const body = await readJson(req);
  const studentId = String(body.studentId || '').trim();

  // Protect admin account from being deleted
  if (studentId.toLowerCase() === ADMIN_USERNAME) {
    return sendJson(res, 400, {
      ok: false,
      error: 'cannot_delete_admin',
      message: 'ห้ามลบผู้ดูแลระบบ (admin)'
    });
  }

  let user = db.users[studentId] || null;
  if (!user && supabase.isConfigured) {
    user = await supabase.getUser(studentId);
  }

  if (!user) {
    return sendJson(res, 404, {
      ok: false,
      error: 'user_not_found',
      message: 'ไม่พบผู้ใช้นี้'
    });
  }

  if (user.isProtected) {
    return sendJson(res, 400, {
      ok: false,
      error: 'cannot_delete_admin',
      message: 'ห้ามลบผู้ดูแลระบบ (admin)'
    });
  }

  delete db.users[studentId];

  if (supabase.isConfigured) {
    await supabase.removeUser(studentId);
  }
  await persistLocal();

  return sendJson(res, 200, { ok: true });
}

/* ------------------------------------------------------------------ */
/* Static Files                                                       */
/* ------------------------------------------------------------------ */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8'
};

const BLOCKED_PREFIXES = ['/data/', '/.git/', '/node_modules/'];
const BLOCKED_FILES = new Set([
  '/server.js',
  '/core-server.js',
  '/vercel.json',
  '/package.json',
  '/package-lock.json',
  '/readme.md',
  '/.gitignore',
  '/.env'
]);

async function serveStatic(req, res, pathname) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(pathname);
  } catch {
    return sendNotFound(res);
  }

  if (requestPath === '/') requestPath = '/index.html';
  if (requestPath === '/admin') requestPath = '/admin.html';

  const normalized = path.posix.normalize(requestPath);
  if (normalized.includes('..')) return sendNotFound(res);

  const lower = normalized.toLowerCase();
  if (BLOCKED_FILES.has(lower)) return sendNotFound(res);
  if (BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return sendNotFound(res);
  }

  let filePath = path.join(PUBLIC_DIR, normalized.replace(/^\/+/, ''));
  const publicPrefix = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;
  if (!filePath.startsWith(publicPrefix)) return sendNotFound(res);

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return sendNotFound(res);
  }

  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return sendNotFound(res);
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) sendNotFound(res);
    else res.destroy();
  });
  stream.pipe(res);
}

function sendNotFound(res) {
  const body = 'Not found';
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function getNetworkUrls(port) {
  const lan = [];
  const tailscale = [];
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        const isTailscale = name.toLowerCase().includes('tailscale') || info.address.startsWith('100.');
        const url = `http://${info.address}:${port}`;
        if (isTailscale) {
          tailscale.push(url);
        } else {
          lan.push(url);
        }
      }
    }
  }

  return { lan, tailscale };
}

/* ------------------------------------------------------------------ */
/* Server / Request Routing                                           */
/* ------------------------------------------------------------------ */

async function handleApiRequest(req, res, pathname) {
  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      mode: 'cheer-stand',
      users: Object.keys(db.users).length,
      totalRounds: TOTAL_ROUNDS,
      maxScore: MAX_SCORE,
      roundSeconds: ROUND_SECONDS,
      supabase: supabase.isConfigured,
      time: nowIso()
    });
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    return handleRegister(req, res);
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    return handleLogin(req, res);
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    return handleMe(req, res);
  }

  if (pathname === '/api/restart' && req.method === 'POST') {
    return handleRestart(req, res);
  }

  if (pathname === '/api/progress' && req.method === 'POST') {
    return handleProgress(req, res);
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    return handleAdminUsers(req, res);
  }

  if (pathname === '/api/admin/reset' && req.method === 'POST') {
    return handleAdminReset(req, res);
  }

  if (pathname === '/api/admin/delete' && req.method === 'POST') {
    return handleAdminDelete(req, res);
  }

  return sendJson(res, 404, { ok: false, error: 'not_found', message: 'ไม่พบ API นี้' });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(req, res, url.pathname);
    }

    return serveStatic(req, res, url.pathname);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    console.error('Request error:', err.message);
    if (!res.headersSent) {
      sendJson(res, statusCode, {
        ok: false,
        error: statusCode === 500 ? 'internal_error' : err.message,
        message: statusCode === 500 ? 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' : err.message
      });
    } else {
      res.destroy();
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=3101 node server.js`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

if (require.main === module) {
  loadDb()
    .then(() => {
      server.listen(PORT, HOST, () => {
        const { lan, tailscale } = getNetworkUrls(PORT);
        console.log('');
        console.log('CHEER STAND — By CheerDeb');
        console.log(`  Local:     http://localhost:${PORT}/`);
        console.log(`  Admin:     http://localhost:${PORT}/admin.html`);
        for (const url of tailscale) {
          console.log(`  Tailscale: ${url}/`);
          console.log(`  Tailscale Admin: ${url}/admin.html`);
        }
        for (const url of lan) {
          console.log(`  LAN:       ${url}/`);
        }
        console.log(`  Data:      ${DATA_FILE}`);
        console.log(`  Admin:     user 'admin' (password from CHEER_ADMIN_PASSWORD)`);
        console.log(`  Supabase:  ${supabase.isConfigured ? 'Connected' : 'Local db.json fallback'}`);
        console.log('  Press Ctrl+C to stop.');
        console.log('');
      });
    })
    .catch((err) => {
      console.error('Server could not start:', err);
      process.exit(1);
    });

  async function shutdown() {
    console.log('\nStopping...');
    await saveChain;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  server,
  handleApiRequest,
  loadDb,
  db
};
