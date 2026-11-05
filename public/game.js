'use strict';

/**
 * Cheer Stand — Client Logic
 * By CheerDeb
 */

const TOTAL_ROUNDS = 5;
const MAX_SCORE = 1500;
const ROUND_SECONDS = 60; // 1 minute per round for code & events
const FLIP_SECONDS = 15;  // 15 seconds for flip reflex decisions
const GRID_SIZE = 9;      // 3x3 grid

const STORAGE = {
  token: 'cheer_token',
  adminToken: 'cheer_admin_token',
  run: 'cheer_run_v3',
  result: 'cheer_result_v3',
  sound: 'cheer_sound_v3'
};

const ROUND_PLAN = [
  'code',     // Round 1: โค้ดเพลท 3x3
  'neighbor', // Round 2: เหตุการณ์บนสแตนด์
  'code',     // Round 3: โค้ดเพลท 3x3
  'neighbor', // Round 4: เหตุการณ์บนสแตนด์
  'code'      // Round 5: โค้ดเพลท 3x3
];

// Stand Events (No Curtain / ไม่มีม่าน)
const NEIGHBOR_EVENTS = [
  {
    type: 'candy',
    title: 'มีคนโยนลูกอมข้ามมาบนสแตนด์',
    prompt: 'ลูกอมหล่นลงมาใกล้เท้าของคุณระหว่างสตาฟให้จังหวะ คุณจะทำอย่างไร?',
    choices: [
      { text: 'แอบแกะกินทันที', effect: 'halve', feedback: 'แอบกินลูกอมกลางจังหวะเชียร์: หวานชื่นใจแต่เสียสมาธิ โดนหักคะแนนครึ่งหนึ่ง!' },
      { text: 'ส่งต่อให้สตาฟตรวจสอบ', effect: 'correct', feedback: 'ถูกต้องและปลอดภัย! ปฏิบัติตามวินัยกองเชียร์ (+300 คะแนน)' },
      { text: 'โยนกลับไปสแตนด์ข้างๆ', effect: 'wrong', feedback: 'ไม่ควรโยนสิ่งของข้ามสแตนด์ อาจโดนคนอื่นและทำให้แถวแตก (-100 คะแนน)' }
    ]
  },
  {
    type: 'teacher',
    title: 'อาจารย์ฝ่ายปกครองเดินมาตรวจความเรียบร้อย',
    prompt: 'อาจารย์เดินตรวจแถวเพลทของคุณพอดี ควรทำอย่างไร?',
    choices: [
      { text: 'นั่งตัวตรง จับเพลทนิ่ง พร้อมเพรียง', effect: 'correct', feedback: 'ดีมาก! สแตนด์เทพศิรินทร์มีระเบียบวินัยเป็นเลิศ (+300 คะแนน)' },
      { text: 'หันไปมองอาจารย์แล้วยกมือไหว้กลางจังหวะ', effect: 'wrong', feedback: 'เสียจังหวะแถว! บนสแตนด์ต้องตั้งใจแปรอักษรตามคำสั่งสตาฟ (-100 คะแนน)' },
      { text: 'ก้มหลบหลังเพลทเพื่อน', effect: 'wrong', feedback: 'ทำให้ภาพแปรอักษรแหว่งทันที (-100 คะแนน)' }
    ]
  },
  {
    type: 'song',
    title: 'สตาฟสั่งขึ้นเพลงเชียร์ประจำโรงเรียน',
    prompt: 'เพลงเชียร์เทพศิรินทร์ดังขึ้น สตาฟให้สัญญาณร้อง คุณจะทำอย่างไร?',
    choices: [
      { text: 'ร้องให้สุดเสียงพร้อมเพรียงและนับจังหวะเพลท', effect: 'correct', feedback: 'ยอดเยี่ยม! ก้องกังวานด้วยความภาคภูมิใจ (+300 คะแนน)' },
      { text: 'ขยับปากตามเฉยๆ ไม่ส่งเสียง', effect: 'wrong', feedback: 'พลังเสียงของสแตนด์ต้องมาจากทุกคน (-80 คะแนน)' },
      { text: 'ตะโกนแทรกเพลงคนเดียว', effect: 'wrong', feedback: 'ผิดจังหวะและทำให้เพื่อนหลุดสมาธิ (-100 คะแนน)' }
    ]
  },
  {
    type: 'drop',
    title: 'เพลทแปรอักษรหลุดมือตกลงไปแถวล่าง',
    prompt: 'เพลทลื่นหลุดมือตกไปที่แถวด้านหน้า ควรทำอย่างไรให้เร็วและปลอดภัย?',
    choices: [
      { text: 'สะกิดเพื่อนแถวหน้าเบาๆ ให้ส่งคืนมาทันที', effect: 'correct', feedback: 'แก้ไขได้ดีและรวดเร็ว ไม่ทำให้ภาพหลุดจังหวะนาน (+300 คะแนน)' },
      { text: 'ก้มตัวลงไปแย่งเก็บเองข้ามหัวเพื่อน', effect: 'wrong', feedback: 'อันตรายและอาจทำให้คนอื่นตกสแตนด์ (-120 คะแนน)' },
      { text: 'ปล่อยทิ้งไว้แล้วนั่งเฉยๆ', effect: 'wrong', feedback: 'ช่องว่างทำให้ภาพแปรอักษรเสียทั้งแผง (-100 คะแนน)' }
    ]
  },
  {
    type: 'faint',
    title: 'เพื่อนข้างๆ หน้าซีดเริ่มยืนโซเซ',
    prompt: 'อากาศอบอ้าว เพื่อนข้างแถวหน้ามืดเหมือนจะเป็นลม คุณจะทำอย่างไร?',
    choices: [
      { text: 'ประคองเพื่อนทันทีและส่งสัญญาณเรียกสตาฟพยาบาล', effect: 'correct', feedback: 'ถูกต้องที่สุด! สุขภาพและความปลอดภัยของเพื่อนร่วมสแตนด์สำคัญที่สุด (+300 คะแนน)' },
      { text: 'บอกให้เพื่อนอดทนห้ามขยับจนจบเพลง', effect: 'wrong', feedback: 'อันตรายมาก! เพื่อนอาจหมดสติล้มลงได้ (-150 คะแนน)' },
      { text: 'ผลักเพื่อนให้ออกจากแถวไปเอง', effect: 'wrong', feedback: 'ขาดน้ำใจและทำให้แถววุ่นวาย (-100 คะแนน)' }
    ]
  },
  {
    type: 'bug',
    title: 'แตนบินมาเกาะที่ขอบเพลทของคุณ',
    prompt: 'แมลงบินมาเกาะขอบเพลทขณะกำลังเปิดภาพสำคัญ คุณจะทำอย่างไร?',
    choices: [
      { text: 'นิ่งสงบ ไม่ปัด ไม่ตกใจ ถือเพลทมั่นคง', effect: 'correct', feedback: 'ใจเด็ดมาก! ไม่ทำให้รูปแปรอักษรเสีย แตนบินหนีไปเองอย่างปลอดภัย (+300 คะแนน)' },
      { text: 'กรี๊ดแล้วโยนเพลททิ้ง', effect: 'wrong', feedback: 'แถวแตกกระเจิงและทำให้เสียรูปแปรอักษร (-120 คะแนน)' },
      { text: 'เอามือตีแตนบนเพลท', effect: 'wrong', feedback: 'เสี่ยงโดนต่อยและทำให้จังหวะหลุด (-80 คะแนน)' }
    ]
  },
  {
    type: 'water',
    title: 'สตาฟแจกถุงน้ำเย็นกลางแดดจัด',
    prompt: 'สตาฟส่งถุงน้ำหวานเย็นเจี๊ยบมาถึงแถวของคุณ ควรปฏิบัติอย่างไร?',
    choices: [
      { text: 'ดื่มพอสดชื่นแล้วส่งต่อให้เพื่อนคนอื่นทันที', effect: 'correct', feedback: 'มีน้ำใจและแบ่งปันให้ทุกคนมีพลังร่วมกัน (+300 คะแนน)' },
      { text: 'เก็บไว้ดื่มคนเดียวจนหมด', effect: 'wrong', feedback: 'เพื่อนข้างๆ ที่เหนื่อยไม่ได้รับน้ำ (-100 คะแนน)' },
      { text: 'เทน้ำใส่หัวเล่นเพื่อคลายร้อน', effect: 'wrong', feedback: 'ทำให้กระดาษโค้ดและเพลทเปียกเสียหาย (-150 คะแนน)' }
    ]
  },
  {
    type: 'cheer_rival',
    title: 'กองเชียร์โรงเรียนคู่แข่งส่งเสียงข่มขวัญ',
    prompt: 'สแตนด์ตรงข้ามตะโกนเสียงดังท้าทายเข้ามา กองเชียร์เทพศิรินทร์ควรทำอย่างไร?',
    choices: [
      { text: 'ปรบมือให้เกียรติคู่แข่ง แล้วรวมพลังเชียร์ของเราให้หนักแน่นขึ้น', effect: 'correct', feedback: 'สมศักดิ์ศรีสุภาพบุรุษลูกแม่รำเพย มีน้ำใจนักกีฬา (+300 คะแนน)' },
      { text: 'ตะโกนด่าตอบโต้ด้วยถ้อยคำหยาบคาย', effect: 'wrong', feedback: 'ทำลายภาพลักษณ์สถาบันและผิดกฎระเบียบ (-150 คะแนน)' },
      { text: 'ขว้างขวดน้ำไปทางฝั่งตรงข้าม', effect: 'wrong', feedback: 'ผิดกฎหมายและร้ายแรงอย่างยิ่ง (-300 คะแนน)' }
    ]
  },
  {
    type: 'wind',
    title: 'ลมแรงพัดกระดาษโค้ดเปิดปลิว',
    prompt: 'ลมกระโชกพัดสมุดโค้ดของคุณเปิดไปหน้าอื่น จะทำอย่างไร?',
    choices: [
      { text: 'ใช้ศอกกดสมุดไว้แล้วรีบเปิดกลับมาหน้าที่สตาฟสั่ง', effect: 'correct', feedback: 'มีสติยอดเยี่ยม จัดการปัญหาได้รวดเร็ว (+300 คะแนน)' },
      { text: 'ปล่อยทิ้งแล้วกดเพลทมั่วๆ ตามใจ', effect: 'wrong', feedback: 'เพลทผิดช่อง ทำให้ภาพรวมของสแตนด์เสียหาย (-120 คะแนน)' },
      { text: 'ลุกขึ้นยืนหันหลังวิ่งตามกระดาษ', effect: 'wrong', feedback: 'ทำลายระเบียบแถวและบดบังเพื่อนข้างหลัง (-150 คะแนน)' }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

let token = '';
let currentUser = null;

let run = null;
let rounds = [];
let plateState = []; // 9 plates for 3x3
let selectedPlateChannel = 0;

let roundSerial = 0;
let roundType = null;
let roundActive = false;
let inputLocked = true;
let currentChoiceButtons = [];

let currentCodeRound = null;
let codeTargetDigits = []; // 9 digits

let roundTimerId = null;
let finishing = false;

let audioCtx = null;
let soundOn = true;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function $(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle(list, rng) {
  const array = list.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getTodayThaiDate() {
  const date = new Date();
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `วันที่ ${day} ${month} ${year}`;
}

function randomSeatPosition(rng) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY'; // A to Y
  const letter = letters[randInt(rng, 0, letters.length - 1)];
  const num = randInt(rng, 1, 50);
  return `${letter}${num}`;
}

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage might be disabled */
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */

async function api(path, options) {
  const opts = options || {};
  const headers = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

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
    error.data = data;
    throw error;
  }

  return data;
}

async function syncProgress(finished) {
  if (!run || !currentUser) return;

  try {
    const data = await api('/api/progress', {
      method: 'POST',
      body: {
        score: run.score,
        progress: run.index,
        correct: run.correct,
        wrong: run.wrong,
        finished: Boolean(finished),
        runId: run.runId,
        timeUsed: Math.floor((Date.now() - run.startedAt) / 1000)
      }
    });

    if (data.user) currentUser = data.user;
  } catch (err) {
    console.warn('Could not sync progress:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Audio                                                              */
/* ------------------------------------------------------------------ */

function ensureAudio() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor) {
      try {
        audioCtx = new Ctor();
      } catch {
        audioCtx = null;
      }
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function beep(frequency, duration, type, volume) {
  if (!soundOn || !audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  const length = duration || 0.07;
  const level = volume === undefined ? 0.045 : volume;

  osc.type = type || 'square';
  osc.frequency.value = frequency || 560;
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + length + 0.02);
}

function sfxClick() {
  beep(520, 0.04, 'square', 0.025);
}

function sfxCorrect() {
  beep(660, 0.08, 'square', 0.05);
  setTimeout(() => beep(990, 0.12, 'square', 0.05), 85);
}

function sfxWrong() {
  beep(180, 0.16, 'sawtooth', 0.05);
  setTimeout(() => beep(130, 0.2, 'sawtooth', 0.04), 120);
}

function sfxRound() {
  beep(440, 0.06, 'square', 0.04);
  setTimeout(() => beep(880, 0.08, 'square', 0.04), 90);
}

function sfxAlert() {
  beep(800, 0.09, 'sawtooth', 0.06);
  setTimeout(() => beep(1200, 0.14, 'sawtooth', 0.06), 100);
}

function updateSoundButtons() {
  const label = soundOn ? 'เสียง: เปิด' : 'เสียง: ปิด';
  ['sound-btn', 'intro-sound'].forEach((id) => {
    const button = $(id);
    if (button) {
      button.textContent = label;
      button.title = soundOn ? 'คลิกเพื่อปิดเสียง' : 'คลิกเพื่อเปิดเสียง';
    }
  });
}

function toggleSound() {
  soundOn = !soundOn;
  try {
    localStorage.setItem(STORAGE.sound, soundOn ? '1' : '0');
  } catch {
    /* ignore */
  }
  updateSoundButtons();
  if (soundOn) {
    ensureAudio();
    sfxClick();
  }
}

/* ------------------------------------------------------------------ */
/* Screen Switching                                                   */
/* ------------------------------------------------------------------ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.id === id);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAuthError(message) {
  const box = $('auth-error');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideAuthError() {
  const box = $('auth-error');
  if (!box) return;
  box.classList.add('hidden');
  box.textContent = '';
}

function setFormBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = Boolean(busy);
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

function bindAuth() {
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((item) => item.classList.toggle('active', item === tab));
      $('login-form').classList.toggle('hidden', target !== 'login');
      $('register-form').classList.toggle('hidden', target !== 'register');
      hideAuthError();
    });
  });

  $('login-form').addEventListener('submit', handleLogin);
  $('register-form').addEventListener('submit', handleRegister);
}

async function handleLogin(event) {
  event.preventDefault();
  hideAuthError();
  ensureAudio();

  const form = $('login-form');
  const studentId = $('login-id').value.trim();
  const password = $('login-pass').value;

  if (!studentId || !password) {
    showAuthError('กรุณากรอกเลขประจำตัวและรหัสผ่าน');
    return;
  }

  setFormBusy(form, true);
  try {
    token = '';
    const data = await api('/api/login', {
      method: 'POST',
      body: { studentId, password }
    });

    if (data.role === 'admin') {
      try {
        localStorage.setItem(STORAGE.adminToken, data.token);
        localStorage.removeItem(STORAGE.token);
      } catch {
        /* ignore */
      }
      window.location.href = 'admin.html';
      return;
    }

    token = data.token;
    currentUser = data.user;
    try {
      localStorage.setItem(STORAGE.token, token);
    } catch {
      /* ignore */
    }

    sfxRound();
    afterAuth();
  } catch (err) {
    showAuthError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    sfxWrong();
  } finally {
    setFormBusy(form, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  hideAuthError();
  ensureAudio();

  const form = $('register-form');
  const firstName = $('reg-first').value.trim();
  const lastName = $('reg-last').value.trim();
  const studentId = $('reg-id').value.trim();
  const password = $('reg-pass').value;

  if (!firstName || !lastName) {
    showAuthError('กรุณากรอกชื่อจริงและนามสกุล');
    return;
  }
  // Exactly 5 digits
  if (!/^\d{5}$/.test(studentId)) {
    showAuthError('เลขประจำตัวต้องเป็นตัวเลข 5 หลักเท่านั้น');
    return;
  }
  if (password.length < 4) {
    showAuthError('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    return;
  }

  setFormBusy(form, true);
  try {
    token = '';
    const data = await api('/api/register', {
      method: 'POST',
      body: { firstName, lastName, studentId, password }
    });

    token = data.token;
    currentUser = data.user;
    try {
      localStorage.setItem(STORAGE.token, token);
    } catch {
      /* ignore */
    }

    sfxCorrect();
    afterAuth();
  } catch (err) {
    showAuthError(err.message || 'สมัครไม่สำเร็จ');
    sfxWrong();
  } finally {
    setFormBusy(form, false);
  }
}

function afterAuth() {
  if (!currentUser) return;

  $('intro-name').textContent = currentUser.fullName || 'น้องใหม่กองเชียร์';
  $('intro-id').textContent = `เลขประจำตัว ${currentUser.studentId} · คะแนนสูงสุด ${currentUser.bestScore || currentUser.score || 0} คะแนน`;
  $('hud-name').textContent = currentUser.fullName || '—';
  $('hud-id').textContent = currentUser.studentId || '—';

  const saved = readJsonStorage(STORAGE.run);
  const canResume = Boolean(
    saved &&
      saved.studentId === currentUser.studentId &&
      !saved.finished &&
      Number(saved.index) < TOTAL_ROUNDS
  );

  $('resume-btn').classList.toggle('hidden', !canResume);
  updateSoundButtons();
  showScreen('intro-screen');
}

async function boot() {
  bindAuth();
  bindGame();
  updateSoundButtons();

  try {
    soundOn = localStorage.getItem(STORAGE.sound) !== '0';
  } catch {
    soundOn = true;
  }
  updateSoundButtons();

  let savedToken = '';
  try {
    savedToken = localStorage.getItem(STORAGE.token) || '';
  } catch {
    savedToken = '';
  }

  if (!savedToken) {
    showScreen('auth-screen');
    return;
  }

  token = savedToken;
  try {
    const data = await api('/api/me');
    currentUser = data.user;
    afterAuth();
  } catch {
    token = '';
    try {
      localStorage.removeItem(STORAGE.token);
    } catch {
      /* ignore */
    }
    showScreen('auth-screen');
  }
}

/* ------------------------------------------------------------------ */
/* Game Run & Code Sheet Generation (Consistent per run, random replay) */
/* ------------------------------------------------------------------ */

function generateSheetBoxes(rng) {
  const boxes = [];
  // 9 codes total on sheet, each pattern has 9 digits ranging from 1 to 9 (not limited to 6)
  for (let b = 1; b <= 9; b += 1) {
    boxes.push({
      boxNo: b,
      digits: Array.from({ length: 9 }, () => randInt(rng, 1, 9))
    });
  }
  return boxes;
}

function buildRounds(seed, sheetBoxes) {
  const rng = mulberry32(seed >>> 0);
  const neighborOrder = shuffle(
    NEIGHBOR_EVENTS.map((_, index) => index),
    rng
  );
  let neighborCursor = 0;

  // Requirement: "ไม่จำเป็นต้องเลือกโค้ดที่1ก่อนสลับได้เลย"
  // Shuffled box order so round 1 does not always start with Code #1
  const boxIndices = shuffle(
    sheetBoxes.map((_, index) => index),
    rng
  );
  let codeCursor = 0;

  return ROUND_PLAN.map((type) => {
    if (type === 'code') {
      const boxIndex = boxIndices[codeCursor % boxIndices.length];
      const targetBox = sheetBoxes[boxIndex];
      codeCursor += 1;

      return {
        type: 'code',
        codeNo: targetBox.boxNo,
        paperDigits: targetBox.digits.slice(),
        seconds: ROUND_SECONDS
      };
    }

    // Neighbor / Stand event (no curtain)
    const eventIndex = neighborOrder[neighborCursor % NEIGHBOR_EVENTS.length];
    neighborCursor += 1;
    const event = NEIGHBOR_EVENTS[eventIndex];

    return {
      type: 'neighbor',
      event,
      seconds: ROUND_SECONDS
    };
  });
}

function newRun() {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const rng = mulberry32(seed);

  // Consistent code sheet and seat position for the entire run
  const sheetBoxes = generateSheetBoxes(rng);
  const seatPosition = randomSeatPosition(rng);
  const playDate = getTodayThaiDate();

  return {
    runId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    studentId: currentUser.studentId,
    seed,
    seatPosition,
    playDate,
    sheetBoxes,
    index: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    startedAt: Date.now(),
    finished: false
  };
}

function saveRun() {
  if (!run) return;
  writeJsonStorage(STORAGE.run, run);
}

function applyRunHeaderInfo() {
  if (!run) return;
  const dateEl = $('sheet-date-display');
  if (dateEl) dateEl.textContent = run.playDate || getTodayThaiDate();

  const posBig = $('sheet-pos-big');
  if (posBig) posBig.textContent = run.seatPosition || 'M1';

  const metaPos = $('meta-pos');
  if (metaPos) metaPos.textContent = run.seatPosition || 'M1';
}

function startNewGame() {
  if (!currentUser) return;

  ensureAudio();
  finishing = false;
  roundSerial += 1;
  clearRoundTimer();

  run = newRun();
  rounds = buildRounds(run.seed, run.sheetBoxes);
  saveRun();

  applyRunHeaderInfo();
  buildPlates();
  updateHud();
  showScreen('game-screen');
  sfxRound();
  nextRound();
}

function resumeGame() {
  const saved = readJsonStorage(STORAGE.run);
  if (!saved || !currentUser || saved.studentId !== currentUser.studentId) {
    startNewGame();
    return;
  }

  ensureAudio();
  finishing = false;
  roundSerial += 1;
  clearRoundTimer();

  const seed = Number(saved.seed) >>> 0;
  const rng = mulberry32(seed);

  run = {
    runId: saved.runId || newRun().runId,
    studentId: saved.studentId,
    seed,
    seatPosition: saved.seatPosition || randomSeatPosition(rng),
    playDate: saved.playDate || getTodayThaiDate(),
    sheetBoxes: Array.isArray(saved.sheetBoxes) && saved.sheetBoxes.length >= 9
      ? saved.sheetBoxes
      : generateSheetBoxes(rng),
    index: clamp(saved.index, 0, TOTAL_ROUNDS),
    score: clamp(saved.score, 0, MAX_SCORE),
    correct: clamp(saved.correct, 0, TOTAL_ROUNDS),
    wrong: clamp(saved.wrong, 0, TOTAL_ROUNDS),
    startedAt: Number(saved.startedAt) || Date.now(),
    finished: false
  };
  rounds = buildRounds(run.seed, run.sheetBoxes);
  saveRun();

  applyRunHeaderInfo();
  buildPlates();
  updateHud();
  showScreen('game-screen');
  sfxRound();
  nextRound();
}

/* ------------------------------------------------------------------ */
/* HUD & Timer                                                        */
/* ------------------------------------------------------------------ */

function updateHud() {
  if (!run) return;

  $('hud-score').textContent = String(run.score);
  $('hud-round').textContent = String(Math.min(run.index + 1, TOTAL_ROUNDS));
  $('progress-fill').style.width = `${(run.index / TOTAL_ROUNDS) * 100}%`;

  if (currentUser) {
    $('hud-name').textContent = currentUser.fullName || '—';
    $('hud-id').textContent = currentUser.studentId || '—';
  }
}

function startRoundTimer(seconds, onExpire, serial) {
  clearRoundTimer();

  const timerEl = $('round-timer');
  const hudTimeEl = $('hud-time');
  const endsAt = Date.now() + seconds * 1000;
  timerEl.classList.remove('urgent');

  function tick() {
    if (serial !== roundSerial) {
      clearRoundTimer();
      return;
    }

    const remain = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    timerEl.textContent = `เวลาเหลือ: ${formatTime(remain)}`;
    hudTimeEl.textContent = formatTime(remain);
    timerEl.classList.toggle('urgent', remain <= 5);

    if (remain <= 0) {
      clearRoundTimer();
      onExpire();
    }
  }

  roundTimerId = setInterval(tick, 250);
  tick();
}

function clearRoundTimer() {
  if (roundTimerId) {
    clearInterval(roundTimerId);
    roundTimerId = null;
  }
}

function showRoundToast(index, label) {
  const toast = $('round-toast');
  toast.textContent = `รอบ ${index}/${TOTAL_ROUNDS}: ${label}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 950);
}

function roundLabel(type) {
  if (type === 'code') return 'โค้ดเพลท 3x3';
  return 'เหตุการณ์บนสแตนด์';
}

/* ------------------------------------------------------------------ */
/* 3x3 Plate Grid (1-9 digits, selector & quick numpad, manual confirm)*/
/* ------------------------------------------------------------------ */

function buildPlates() {
  const grid = $('plate-grid');
  grid.textContent = '';
  plateState = [];

  for (let channel = 0; channel < GRID_SIZE; channel += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'plate';
    button.dataset.channel = String(channel);
    button.setAttribute('aria-label', `ช่อง ${channel + 1}`);

    const tag = document.createElement('span');
    tag.className = 'plate-tag';
    tag.textContent = `ช่อง ${channel + 1}`;

    const number = document.createElement('span');
    number.className = 'plate-num';
    number.textContent = '1';

    button.append(tag, number);
    button.addEventListener('click', () => onPlateClick(channel));
    grid.append(button);

    plateState.push({ digit: 1, el: button, num: number, tag });
  }

  selectPlate(0);
  buildTactileDisplay();
}

function selectPlate(channel) {
  selectedPlateChannel = clamp(channel, 0, GRID_SIZE - 1);
  plateState.forEach((plate, i) => {
    const isSel = i === selectedPlateChannel;
    plate.el.classList.toggle('selected-plate', isSel);
    if (plate.tag) {
      plate.tag.textContent = isSel ? `ช่อง ${i + 1} ◄` : `ช่อง ${i + 1}`;
    }
  });

  const curLabel = $('numpad-active-channel-label');
  if (curLabel) {
    curLabel.textContent = `ช่อง ${selectedPlateChannel + 1}`;
  }
  updateTactileDisplay();
}

function setPlateDigit(channel, digit) {
  const plate = plateState[channel];
  if (!plate) return;

  // Requirement: "แก้ให้สามารถกดเลขได้ถึง9 โค้ดมีถึง9ตัวเลขไม่ได้จำกัดถึง6"
  // Cycle 1 to 9
  const parsed = Number(digit);
  let value = Number.isFinite(parsed) ? parsed : 1;
  if (value > 9) value = 1;
  if (value < 1) value = 9;

  plate.digit = value;
  plate.num.textContent = String(value);
  updateTactileDisplay();
}

function onPlateClick(channel) {
  if (roundType !== 'code' || !roundActive || inputLocked) return;
  const plate = plateState[channel];
  if (!plate) return;

  ensureAudio();
  selectPlate(channel);
  setPlateDigit(channel, plate.digit + 1);
  sfxClick();
}

/* ------------------------------------------------------------------ */
/* Generic UI Choices                                                 */
/* ------------------------------------------------------------------ */

function clearChoices() {
  const choices = $('choices');
  choices.textContent = '';
  currentChoiceButtons = [];
}

function renderChoices(items, onPick) {
  const wrap = $('choices');
  wrap.textContent = '';
  currentChoiceButtons = [];
  const keys = ['1', '2', '3', '4'];

  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-btn';

    const key = document.createElement('span');
    key.className = 'choice-key';
    key.textContent = keys[index] || String(index + 1);

    const label = document.createElement('span');
    label.className = 'choice-label';
    label.textContent = item.label || item;

    button.append(key, label);
    button.addEventListener('click', () => {
      if (!roundActive || inputLocked) return;
      ensureAudio();
      onPick(index, button);
    });

    wrap.append(button);
    currentChoiceButtons.push(button);
  });

  return currentChoiceButtons;
}

function disableChoices() {
  currentChoiceButtons.forEach((button) => {
    button.disabled = true;
  });
}

function markChoices(correctIndex, chosenIndex) {
  currentChoiceButtons.forEach((button, index) => {
    button.disabled = true;
    if (index === correctIndex) button.classList.add('correct');
    else if (index === chosenIndex) button.classList.add('wrong');
    else button.classList.add('dim');
  });
}

function showFeedback(kind, message) {
  const box = $('feedback');
  box.textContent = message;
  box.className = `feedback ${kind}`;
}

function hideFeedback() {
  const box = $('feedback');
  box.className = 'feedback hidden';
  box.textContent = '';
}

function resetRoundUI() {
  clearChoices();
  hideFeedback();

  $('code-paper').classList.add('hidden');
  $('flip-visual').classList.add('hidden');
  $('neighbor-stand').classList.add('hidden');
  $('plate-confirm-wrap').classList.add('hidden');

  const numpad = $('quick-numpad');
  if (numpad) numpad.classList.add('hidden');

  const mobilePreview = $('mobile-active-code-preview');
  if (mobilePreview) mobilePreview.classList.add('hidden');

  const tactile = $('tactile-display');
  if (tactile) tactile.classList.add('hidden');

  $('round-timer').classList.remove('urgent');
  $('round-timer').textContent = '--';
}

/* ------------------------------------------------------------------ */
/* Round Flow                                                         */
/* ------------------------------------------------------------------ */

function nextRound() {
  if (!run) return;

  if (run.index >= TOTAL_ROUNDS) {
    finishGame(false);
    return;
  }

  const serial = ++roundSerial;
  roundActive = false;
  inputLocked = true;
  clearRoundTimer();
  resetRoundUI();
  saveRun();
  updateHud();

  const round = rounds[run.index];
  showRoundToast(run.index + 1, roundLabel(round.type));

  setTimeout(() => {
    if (serial !== roundSerial || !run) return;
    roundActive = true;
    startRound(round, serial);
  }, 900);
}

function triggerCommandAlert() {
  const banner = $('center-command-banner');
  banner.classList.remove('command-alert-pulse');
  void banner.offsetWidth; // reflow
  banner.classList.add('command-alert-pulse');
  sfxAlert();
}

function startRound(round, serial) {
  roundType = round.type;
  inputLocked = false;

  $('banner-round-type').textContent = roundLabel(round.type);
  triggerCommandAlert();

  if (round.type === 'code') {
    startCodeRound(round, serial);
    return;
  }

  startNeighborRound(round, serial);
}

/* ---------- 1. Code Round (3x3 Stand & Code Sheet) ---------- */

function startCodeRound(round, serial) {
  currentCodeRound = round;
  codeTargetDigits = round.paperDigits.slice();

  // Randomize initial plates so they are not already solved (1 to 9)
  const rng = mulberry32(run.seed ^ (run.index * 1337));
  plateState.forEach((_, channel) => {
    const initVal = randInt(rng, 1, 9);
    setPlateDigit(channel, initVal);
  });

  selectPlate(0);

  // Wide center command banner
  $('command-text').textContent = `คำสั่งสตาฟ: เปิดโค้ด #${round.codeNo} ให้ตรงตามกระดาษโค้ด`;
  $('command-sub').textContent =
    `เปิดดูตัวเลขโค้ด #${round.codeNo} บนกระดาษโค้ด (หรือแตะสลับโค้ดได้อิสระ) แล้วกดตัวเลข 1-9 ให้ครบ จากนั้นกดปุ่มยืนยันเพลท`;

  // Render Full Code Sheet (Consistent for the run)
  renderCheerSheet(round);

  $('code-paper').classList.remove('hidden');
  $('plate-confirm-wrap').classList.remove('hidden');

  const numpad = $('quick-numpad');
  if (numpad) numpad.classList.remove('hidden');

  const preview = $('mobile-active-code-preview');
  if (preview) preview.classList.remove('hidden');
  renderMobileCodePreview(round.codeNo, round.paperDigits);

  // Show & init tactile display
  const tactile = $('tactile-display');
  if (tactile) tactile.classList.remove('hidden');
  updateTactileDisplay();

  // Also bind confirm button
  const confirmBtn = $('btn-submit-plates');
  confirmBtn.onclick = () => verifyCodePlates(serial);

  startRoundTimer(round.seconds, () => onCodeTimeout(serial), serial);
}

function renderCheerSheet(activeRound) {
  const container = $('sheet-boxes-grid');
  container.textContent = '';

  const boxes = run.sheetBoxes || [];
  boxes.forEach((box) => {
    const b = box.boxNo;
    const isActive = b === activeRound.codeNo;

    const boxEl = document.createElement('div');
    boxEl.className = `sheet-box ${isActive ? 'active-code-box' : ''}`;
    boxEl.dataset.boxNo = String(b);

    const title = document.createElement('div');
    title.className = 'sheet-box-title';
    title.textContent = `โค้ด ${b}`;

    const miniGrid = document.createElement('div');
    miniGrid.className = 'sheet-box-grid';

    box.digits.forEach((digit, index) => {
      const cell = document.createElement('div');
      cell.className = 'sheet-cell';
      cell.textContent = String(digit);
      cell.title = `ช่อง ${index + 1}: เลข ${digit}`;
      miniGrid.append(cell);
    });

    boxEl.append(title, miniGrid);
    boxEl.addEventListener('click', () => {
      if (!roundActive || inputLocked) return;
      ensureAudio();
      sfxClick();
      selectCodeBox(b);
    });

    container.append(boxEl);
  });

  updateActivePatternBadge(activeRound.codeNo);
}

// Requirement: "และไม่จำเป็นต้องเลือกโค้ดที่1ก่อนสลับได้เลย"
function selectCodeBox(boxNum) {
  const targetBox = (run.sheetBoxes || []).find((bx) => bx.boxNo === boxNum);
  if (!targetBox) return;

  if (currentCodeRound) {
    currentCodeRound.codeNo = targetBox.boxNo;
    currentCodeRound.paperDigits = targetBox.digits.slice();
    codeTargetDigits = targetBox.digits.slice();
  }

  // Update sheet boxes active style
  document.querySelectorAll('.sheet-box').forEach((box) => {
    box.classList.toggle('active-code-box', Number(box.dataset.boxNo) === boxNum);
  });

  updateActivePatternBadge(boxNum);

  // Update staff command banner
  $('command-text').textContent = `คำสั่งสตาฟ: เปิดโค้ด #${boxNum} ให้ตรงตามกระดาษโค้ด`;
  $('command-sub').textContent =
    `สลับมาทำโค้ด #${boxNum}: ตรวจสอบตัวเลขทั้ง 9 ช่องบนเพลทให้ตรง แล้วกดปุ่มยืนยันเพลท`;

  renderMobileCodePreview(boxNum, targetBox.digits);
}

function updateActivePatternBadge(codeNo) {
  const badge = $('active-pattern-badge');
  if (badge) badge.textContent = `สตาฟสั่ง: โค้ด #${codeNo}`;
}

function renderMobileCodePreview(boxNum, digits) {
  const tag = $('mobile-code-tag');
  if (tag) tag.textContent = `เป้าหมาย: โค้ด #${boxNum}`;

  const grid = $('mobile-code-mini-grid');
  if (!grid) return;
  grid.textContent = '';
  (digits || []).forEach((digit, index) => {
    const cell = document.createElement('div');
    cell.className = 'mini-preview-cell';
    cell.textContent = String(digit);
    cell.title = `ช่อง ${index + 1}: เลข ${digit}`;
    grid.append(cell);
  });
}

function highlightActiveBox(boxNum) {
  selectCodeBox(boxNum);
}

function verifyCodePlates(serial) {
  if (serial !== roundSerial || !roundActive || inputLocked) return;

  const correctCount = plateState.filter((p, i) => p.digit === codeTargetDigits[i]).length;
  if (correctCount === GRID_SIZE) {
    onCodeComplete(serial);
  } else {
    // Penalty for wrong submission
    sfxWrong();
    addScore(-30);
    showFeedback('bad', `ยังไม่ถูกต้อง: มีเพลทที่ยังไม่ตรงกับโค้ด กรุณาตรวจสอบกระดาษโค้ดแล้วลองใหม่อีกครั้ง (-30 คะแนน)`);
  }
}

function onCodeComplete(serial) {
  if (serial !== roundSerial || !roundActive || inputLocked) return;

  inputLocked = true;
  clearRoundTimer();
  addScore(300);
  showFeedback('good', 'ยอดเยี่ยม! เพลทตรงตามโค้ดครบทั้ง 9 ช่อง ผ่านภารกิจ (+300 คะแนน)');
  sfxCorrect();

  finalizeRound(true, serial);
}

function onCodeTimeout(serial) {
  if (serial !== roundSerial || !roundActive) return;

  inputLocked = true;
  clearRoundTimer();
  const correctCount = plateState.filter((p, i) => p.digit === codeTargetDigits[i]).length;
  const isPass = correctCount >= 7;

  if (isPass) {
    addScore(150);
    showFeedback('good', `หมดเวลา! เพลทตรง ${correctCount}/9 ช่อง ผ่านเกณฑ์แบบฉิวเฉียด (+150 คะแนน)`);
    sfxCorrect();
  } else {
    addScore(-50);
    showFeedback('bad', `หมดเวลา! เพลทตรงเพียง ${correctCount}/9 ช่อง ยังไม่ผ่านเกณฑ์ (-50 คะแนน)`);
    sfxWrong();
  }

  finalizeRound(isPass, serial);
}

/* ---------- 2. Flip Round (15 seconds, ปิดจังหวะ vs เปิดจังหวะ) ---------- */

function startFlipRound(round, serial) {
  $('command-text').textContent = `คำสั่งสตาฟ: “${round.command}”`;
  $('command-sub').textContent =
    round.isClose
      ? 'จำกฎให้แม่น: สั่ง “ปิดจังหวะ” = พลิกเพลทครึ่งนึง (เปิดครึ่ง)'
      : 'จำกฎให้แม่น: สั่ง “เปิดจังหวะ” = พลิกเพลทไปเลย (เปิดเต็ม)';

  $('flip-card-text').textContent = round.isClose ? 'ปิดจังหวะ' : 'เปิดจังหวะ';
  $('flip-card').classList.remove('flipping');
  $('flip-visual').classList.remove('hidden');

  sfxRound();

  renderChoices(
    round.choices.map((label) => ({ label })),
    (index) => answerFlip(round, index, serial)
  );

  startRoundTimer(round.seconds, () => onFlipTimeout(round, serial), serial);
}

function answerFlip(round, chosenIndex, serial) {
  if (serial !== roundSerial || !roundActive || inputLocked) return;

  inputLocked = true;
  clearRoundTimer();

  const isCorrect = chosenIndex === round.correctIndex;
  markChoices(round.correctIndex, chosenIndex);
  $('flip-card').classList.add('flipping');

  if (isCorrect) {
    addScore(300);
    showFeedback('good', `ถูกต้อง! สั่ง “${round.command}” ต้องเลือก “${round.correctLabel}” (+300 คะแนน)`);
    sfxCorrect();
  } else {
    addScore(-100);
    showFeedback('bad', `ผิด! สั่ง “${round.command}” คำตอบที่ถูกต้องคือ “${round.correctLabel}” (-100 คะแนน)`);
    sfxWrong();
  }

  finalizeRound(isCorrect, serial);
}

function onFlipTimeout(round, serial) {
  if (serial !== roundSerial || !roundActive) return;

  inputLocked = true;
  markChoices(round.correctIndex, -1);
  addScore(-100);
  showFeedback(
    'bad',
    `หมดเวลา! คำตอบที่ถูกต้องคือ “${round.correctLabel}” (-100 คะแนน)`
  );
  sfxWrong();

  finalizeRound(false, serial);
}

/* ---------- 3. Neighbor / Event Round ---------- */

function startNeighborRound(round, serial) {
  const event = round.event;

  $('neighbor-stand').classList.remove('hidden');
  $('neighbor-item').textContent = event.type.toUpperCase();
  $('neighbor-caption').textContent = event.title;

  $('command-text').textContent = event.title;
  $('command-sub').textContent = event.prompt;

  sfxRound();

  // Requirement: "การตอบคำถามแต่ละเหตุการณ์ควรจะสุ่มว่าอัน1อัน2อัน3มีการสลับที่ของคำตอบตำแหน่งสลับ"
  // Randomize / shuffle the order of choices 1, 2, 3 on each event
  const rng = mulberry32((Date.now() ^ (serial * 2654435761) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const shuffledChoices = shuffle(event.choices, rng);
  round.currentChoices = shuffledChoices;
  round.correctIndex = shuffledChoices.findIndex((c) => c.effect === 'correct');

  renderChoices(
    shuffledChoices.map((c) => ({ label: c.text })),
    (index) => answerNeighbor(round, index, serial)
  );

  startRoundTimer(round.seconds, () => onNeighborTimeout(round, serial), serial);
}

function answerNeighbor(round, chosenIndex, serial) {
  if (serial !== roundSerial || !roundActive || inputLocked) return;

  inputLocked = true;
  clearRoundTimer();

  const choices = round.currentChoices || round.event.choices;
  const choice = choices[chosenIndex];
  const effect = choice.effect;

  // Visual feedback: mark correct & chosen
  markChoices(round.correctIndex, chosenIndex);

  if (effect === 'halve') {
    // Special candy effect: Eat candy -> Score reduced by half!
    const oldScore = run.score;
    run.score = Math.floor(run.score / 2);
    updateHud();
    showFeedback('bad', `${choice.feedback} (คะแนนเดิม ${oldScore} เหลือ ${run.score})`);
    sfxWrong();
    finalizeRound(false, serial);
  } else if (effect === 'correct') {
    addScore(300);
    showFeedback('good', choice.feedback);
    sfxCorrect();
    finalizeRound(true, serial);
  } else {
    addScore(-100);
    showFeedback('bad', choice.feedback);
    sfxWrong();
    finalizeRound(false, serial);
  }
}

function onNeighborTimeout(round, serial) {
  if (serial !== roundSerial || !roundActive) return;

  inputLocked = true;
  addScore(-100);
  showFeedback('bad', 'หมดเวลาตัดสินใจ! ลังเลบนสแตนด์ทำให้จังหวะหลุด (-100 คะแนน)');
  sfxWrong();

  finalizeRound(false, serial);
}

/* ---------- Shared Round Finish & Scoring ---------- */

function addScore(delta) {
  if (!run) return;
  // Score cannot be negative
  run.score = Math.max(0, clamp(run.score + delta, 0, MAX_SCORE));
  updateHud();
}

function finalizeRound(success, serial) {
  if (serial !== roundSerial || !run) return;

  roundActive = false;
  inputLocked = true;
  clearRoundTimer();

  if (success) run.correct = Math.min(TOTAL_ROUNDS, run.correct + 1);
  else run.wrong = Math.min(TOTAL_ROUNDS, run.wrong + 1);

  run.index = Math.min(TOTAL_ROUNDS, run.index + 1);
  run.score = Math.max(0, clamp(run.score, 0, MAX_SCORE));

  updateHud();
  saveRun();
  syncProgress(false);

  const delay = run.index >= TOTAL_ROUNDS ? 1200 : 1400;

  setTimeout(() => {
    if (serial !== roundSerial || !run) return;
    if (run.index >= TOTAL_ROUNDS) finishGame(false);
    else nextRound();
  }, delay);
}

/* ------------------------------------------------------------------ */
/* Finish & Result                                                    */
/* ------------------------------------------------------------------ */

function finishGame(timedOut) {
  if (!run || run.finished || finishing) return;

  finishing = true;
  roundSerial += 1;
  roundActive = false;
  inputLocked = true;
  clearRoundTimer();

  run.finished = true;
  run.score = Math.max(0, clamp(run.score, 0, MAX_SCORE));
  run.timeUsed = Math.max(1, Math.floor((Date.now() - run.startedAt) / 1000));
  saveRun();

  const result = {
    studentId: currentUser ? currentUser.studentId : '',
    score: run.score,
    correct: run.correct,
    wrong: run.wrong,
    timeUsed: run.timeUsed,
    timedOut: Boolean(timedOut)
  };
  writeJsonStorage(STORAGE.result, result);

  if (currentUser) {
    currentUser.finished = true;
    currentUser.score = run.score;
    currentUser.bestScore = Math.max(currentUser.bestScore || 0, run.score);
  }

  syncProgress(true);
  renderResult(result);
  sfxRound();

  setTimeout(() => {
    showScreen('result-screen');
    finishing = false;
  }, 450);
}

function resultCopy(score) {
  if (score >= 1350) return { title: 'แชมป์สแตนด์ตัวจริง', badge: 'คะแนนระดับยอดเยี่ยม' };
  if (score >= 1050) return { title: 'นักเชียร์ตัวจริง', badge: 'คะแนนระดับดีมาก' };
  if (score >= 750) return { title: 'ทีมเวิร์กดีเยี่ยม', badge: 'คะแนนระดับดี' };
  if (score >= 450) return { title: 'ผ่านภารกิจสำเร็จ', badge: 'คะแนนระดับผ่าน' };
  return { title: 'เริ่มต้นใหม่ได้เสมอ', badge: 'ต้องฝึกซ้อมเพิ่มเติม' };
}

function renderResult(result) {
  const score = Math.max(0, clamp(result.score, 0, MAX_SCORE));
  const copy = resultCopy(score);
  const name = currentUser ? currentUser.fullName : '';

  $('result-badge').textContent = copy.badge;
  $('result-title').textContent = copy.title;
  $('result-name').textContent = currentUser
    ? `${name} · เลขประจำตัว ${currentUser.studentId}`
    : '—';
  $('result-score').textContent = String(score);
  $('result-correct').textContent = String(clamp(result.correct, 0, TOTAL_ROUNDS));
  $('result-wrong').textContent = String(clamp(result.wrong, 0, TOTAL_ROUNDS));
  $('result-time').textContent = formatTime(result.timeUsed || 0);

  $('intro-name').textContent = name || 'น้องใหม่กองเชียร์';
  $('intro-id').textContent = currentUser
    ? `เลขประจำตัว ${currentUser.studentId}`
    : '—';
}

/* ------------------------------------------------------------------ */
/* Bindings                                                           */
/* ------------------------------------------------------------------ */

function bindGame() {
  $('start-btn').addEventListener('click', () => {
    ensureAudio();
    startNewGame();
  });

  $('resume-btn').addEventListener('click', () => {
    ensureAudio();
    resumeGame();
  });

  $('result-replay').addEventListener('click', () => {
    ensureAudio();
    startNewGame();
  });

  $('restart-round-btn').addEventListener('click', () => {
    if (window.confirm('ต้องการเริ่มภารกิจใหม่ตั้งแต่รอบที่ 1 หรือไม่?')) {
      ensureAudio();
      startNewGame();
    }
  });

  $('sound-btn').addEventListener('click', toggleSound);
  $('intro-sound').addEventListener('click', toggleSound);

  $('logout-btn').addEventListener('click', logout);
  $('result-logout').addEventListener('click', logout);

  // Quick Numpad (1 to 9) buttons for Mobile & Desktop
  document.querySelectorAll('.numpad-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (roundType !== 'code' || !roundActive || inputLocked) return;
      ensureAudio();
      const val = Number(button.dataset.val) || 1;
      setPlateDigit(selectedPlateChannel, val);
      sfxClick();
      // Auto-advance selection to next plate for quick thumb-typing
      selectPlate((selectedPlateChannel + 1) % GRID_SIZE);
    });
  });

  // Physical keyboard listeners (1 to 9, Arrow keys, Enter)
  window.addEventListener('keydown', (e) => {
    if (roundType !== 'code' || !roundActive || inputLocked) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      ensureAudio();
      setPlateDigit(selectedPlateChannel, Number(e.key));
      sfxClick();
      selectPlate((selectedPlateChannel + 1) % GRID_SIZE);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectPlate((selectedPlateChannel + 1) % GRID_SIZE);
      sfxClick();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectPlate((selectedPlateChannel - 1 + GRID_SIZE) % GRID_SIZE);
      sfxClick();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      verifyCodePlates(roundSerial);
    }
  });
}

function logout() {
  if (
    run &&
    !run.finished &&
    !window.confirm('ต้องการออกจากระบบหรือไม่? ข้อมูลล่าสุดถูกบันทึกแล้ว')
  ) {
    return;
  }

  try {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.run);
    localStorage.removeItem(STORAGE.result);
  } catch {
    /* ignore */
  }

  token = '';
  currentUser = null;
  run = null;
  roundSerial += 1;
  clearRoundTimer();
  finishing = false;

  showScreen('auth-screen');
  hideAuthError();
}

/* ------------------------------------------------------------------ */
/* Stadium Panorama — Pan & Zoom                                      */
/* ------------------------------------------------------------------ */

(function initStadiumPanorama() {
  const wrap = document.getElementById('stadium-panorama');
  const inner = document.getElementById('stadium-inner');
  if (!wrap || !inner) return;

  // State
  let panX = 0;        // pixels offset from center
  let scale = 1;       // zoom level
  const PAN_MIN = -600;
  const PAN_MAX = 600;
  const SCALE_MIN = 0.75;
  const SCALE_MAX = 2.5;

  function applyTransform() {
    inner.style.transform = `translateX(calc(-50% + ${panX}px)) scale(${scale})`;
  }

  applyTransform();

  // ---- Mouse drag ----
  let dragging = false;
  let lastMouseX = 0;

  wrap.addEventListener('mousedown', (e) => {
    dragging = true;
    lastMouseX = e.clientX;
    wrap.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    panX = Math.max(PAN_MIN, Math.min(PAN_MAX, panX + dx));
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; wrap.style.cursor = 'grab'; }
  });

  // ---- Scroll wheel zoom ----
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale + delta));
    applyTransform();
  }, { passive: false });

  // ---- Touch (pan + pinch zoom) ----
  let lastTouchX = 0;
  let lastDist = 0;
  let touchCount = 0;

  wrap.addEventListener('touchstart', (e) => {
    touchCount = e.touches.length;
    if (touchCount === 1) {
      lastTouchX = e.touches[0].clientX;
    } else if (touchCount === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist = Math.hypot(dx, dy);
    }
  }, { passive: true });

  wrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastTouchX;
      lastTouchX = e.touches[0].clientX;
      panX = Math.max(PAN_MIN, Math.min(PAN_MAX, panX + dx));
      applyTransform();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist > 0) {
        const delta = (dist - lastDist) * 0.005;
        scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale + delta));
        applyTransform();
      }
      lastDist = dist;
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => { lastDist = 0; });
})();

/* ------------------------------------------------------------------ */
/* 3×3 Tactile Display                                               */
/* ------------------------------------------------------------------ */

function buildTactileDisplay() {
  const grid = document.getElementById('tactile-grid');
  if (!grid) return;
  grid.textContent = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'tactile-cell';
    cell.dataset.channel = String(i);
    cell.dataset.digit = '1';
    cell.textContent = '1';
    grid.appendChild(cell);
  }
}

function updateTactileDisplay() {
  const display = document.getElementById('tactile-display');
  const grid = document.getElementById('tactile-grid');
  const label = document.getElementById('tactile-code-label');
  if (!display || !grid) return;

  // Show only during code rounds
  const shouldShow = roundType === 'code' && roundActive;
  display.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) return;

  // Update label
  if (label && typeof activeCodeBoxNum !== 'undefined') {
    label.textContent = `โค้ด #${activeCodeBoxNum}`;
  }

  // Update each cell
  plateState.forEach((plate, i) => {
    const cell = grid.querySelector(`[data-channel="${i}"]`);
    if (!cell) return;
    const d = plate.digit;
    cell.dataset.digit = String(d);
    cell.textContent = String(d);
    cell.classList.toggle('selected-cell', i === selectedPlateChannel);
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
