// BatasHarian — local server, API, login, and JSON data store.
// Uses only built-in Node.js modules; no npm dependencies are required.
'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'bh_session';
const MAX_BODY_BYTES = 1024 * 1024;
const CATEGORIES = ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya'];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

let writeQueue = Promise.resolve();

function freshDb() {
  return { users: [], budgets: {}, expenses: [], sessions: {}, nextExpenseId: 1 };
}

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(freshDb(), null, 2) + '\n', 'utf8');
  }
}

async function readDb() {
  await writeQueue;
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  const db = JSON.parse(raw);
  db.users ||= [];
  db.budgets ||= {};
  db.expenses ||= [];
  db.sessions ||= {};
  db.nextExpenseId ||= Math.max(0, ...db.expenses.map((e) => Number(e.id) || 0)) + 1;
  return db;
}

async function updateDb(mutator) {
  const operation = writeQueue.then(async () => {
    await ensureDb();
    const db = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    db.users ||= [];
    db.budgets ||= {};
    db.expenses ||= [];
    db.sessions ||= {};
    db.nextExpenseId ||= Math.max(0, ...db.expenses.map((e) => Number(e.id) || 0)) + 1;
    const result = await mutator(db);
    const temporary = DB_FILE + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(db, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, DB_FILE);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieHeader(token, maxAgeSeconds) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

async function readRequestBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Ukuran permintaan terlalu besar.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!total) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Format data tidak valid.');
    return parsed;
  } catch {
    const error = new Error('Format JSON tidak valid.');
    error.status = 400;
    throw error;
  }
}

function localDateString(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(date.getTime()) && localDateString(date) === value;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!token || token.length > 200) return null;
  const db = await readDb();
  const session = db.sessions[sha256(token)];
  if (!session || session.expiresAt <= Date.now()) {
    if (session) updateDb((latest) => { delete latest.sessions[sha256(token)]; });
    return null;
  }
  const user = db.users.find((item) => item.id === session.userId);
  return user || null;
}

async function startSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await updateDb((db) => { db.sessions[sha256(token)] = { userId, expiresAt }; });
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_TTL_MS / 1000));
}

async function passwordHash(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return { salt: salt.toString('hex'), hash: Buffer.from(hash).toString('hex') };
}

function equalHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length % 2 !== 0) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch { return false; }
}

async function authRoutes(req, res, pathname) {
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await currentUser(req);
    return sendJson(res, user ? 200 : 401, user ? { user: publicUser(user) } : { error: 'Silakan masuk untuk melanjutkan.' });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readRequestBody(req);
    const name = String(body.name || '').trim().slice(0, 70);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) return sendJson(res, 400, { error: 'Nama minimal 2 karakter.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendJson(res, 400, { error: 'Masukkan alamat email yang valid.' });
    if (password.length < 8 || password.length > 128) return sendJson(res, 400, { error: 'Kata sandi harus terdiri dari 8–128 karakter.' });
    const credential = await passwordHash(password);
    const user = await updateDb((db) => {
      if (db.users.some((item) => item.email === email)) {
        const error = new Error('Email sudah terdaftar. Silakan masuk.');
        error.status = 409;
        throw error;
      }
      const created = { id: crypto.randomUUID(), name, email, passwordSalt: credential.salt, passwordHash: credential.hash, createdAt: new Date().toISOString() };
      db.users.push(created);
      db.budgets[created.id] = 3000000;
      return created;
    });
    await startSession(user.id, res);
    return sendJson(res, 201, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const db = await readDb();
    const user = db.users.find((item) => item.email === email);
    if (!user || !user.passwordSalt || !user.passwordHash) return sendJson(res, 401, { error: 'Email atau kata sandi salah.' });
    const candidate = await passwordHash(password, user.passwordSalt);
    if (!equalHex(candidate.hash, user.passwordHash)) return sendJson(res, 401, { error: 'Email atau kata sandi salah.' });
    await startSession(user.id, res);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
    if (token) await updateDb((db) => { delete db.sessions[sha256(token)]; });
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
  }
  return false;
}

async function financeRoutes(req, res, pathname) {
  if (pathname !== '/api/finance') return false;
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Sesi tidak ditemukan. Silakan masuk kembali.' });
  const userId = user.id;
  const today = localDateString();
  const month = today.slice(0, 7);

  if (req.method === 'GET') {
    const db = await readDb();
    const expenses = db.expenses.filter((item) => item.userId === userId);
    const spentToday = expenses.filter((item) => item.spentOn === today).reduce((sum, item) => sum + item.amount, 0);
    const spentMonth = expenses.filter((item) => item.spentOn.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const lastSevenDays = localDateString(start);
    const firstOfMonth = month + '-01';
    const since = firstOfMonth < lastSevenDays ? firstOfMonth : lastSevenDays;
    const visibleExpenses = expenses
      .filter((item) => item.spentOn >= since)
      .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 250)
      .map(({ id, amount, category, note, spentOn, createdAt }) => ({ id, amount, category, note, spent_on: spentOn, created_at: createdAt }));
    return sendJson(res, 200, {
      monthlyBudget: Number(db.budgets[userId] || 3000000),
      spentToday,
      spentMonth,
      categories: CATEGORIES,
      expenses: visibleExpenses
    });
  }

  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    if (body.action === 'set_budget') {
      const amount = Number(body.monthlyBudget);
      if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 100000000000) {
        return sendJson(res, 400, { error: 'Anggaran bulanan harus minimal Rp10.000.' });
      }
      await updateDb((db) => { db.budgets[userId] = amount; });
      return sendJson(res, 200, { ok: true, monthlyBudget: amount });
    }
    if (body.action === 'add_expense') {
      const amount = Number(body.amount);
      const category = String(body.category || '');
      const note = String(body.note || '').trim().slice(0, 140);
      const spentOn = String(body.spentOn || '');
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) return sendJson(res, 400, { error: 'Masukkan nominal pengeluaran yang valid.' });
      if (!CATEGORIES.includes(category)) return sendJson(res, 400, { error: 'Pilih kategori yang tersedia.' });
      if (!isValidIsoDate(spentOn)) return sendJson(res, 400, { error: 'Tanggal transaksi tidak valid.' });
      const expense = await updateDb((db) => {
        const entry = { id: db.nextExpenseId++, userId, amount, category, note, spentOn, createdAt: new Date().toISOString() };
        db.expenses.push(entry);
        return entry;
      });
      return sendJson(res, 201, { ok: true, expense: { id: expense.id, amount: expense.amount, category: expense.category, note: expense.note, spent_on: expense.spentOn, created_at: expense.createdAt } });
    }
    return sendJson(res, 400, { error: 'Aksi tidak dikenali.' });
  }

  if (req.method === 'DELETE') {
    const body = await readRequestBody(req);
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendJson(res, 400, { error: 'Transaksi tidak valid.' });
    const deleted = await updateDb((db) => {
      const index = db.expenses.findIndex((item) => item.id === id && item.userId === userId);
      if (index < 0) return false;
      db.expenses.splice(index, 1);
      return true;
    });
    if (!deleted) return sendJson(res, 404, { error: 'Transaksi tidak ditemukan.' });
    return sendJson(res, 200, { ok: true, id });
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  return sendJson(res, 405, { error: 'Metode tidak didukung.' });
}

async function serveStatic(req, res, pathname) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (pathname === '/login') relative = 'login.html';
  let decoded;
  try { decoded = decodeURIComponent(relative); } catch { return sendJson(res, 400, { error: 'Path tidak valid.' }); }
  const target = path.resolve(PUBLIC_DIR, decoded);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Akses ditolak.' });
  let stat;
  try { stat = await fs.stat(target); } catch { stat = null; }
  if (!stat || !stat.isFile()) return sendJson(res, 404, { error: 'Halaman tidak ditemukan.' });
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  const content = await fs.readFile(target);
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = requestUrl.pathname;
    if (pathname.startsWith('/api/auth/')) {
      const result = await authRoutes(req, res, pathname);
      if (result === false) sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' });
      return;
    }
    if (pathname === '/api/finance') {
      await financeRoutes(req, res, pathname);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendJson(res, 405, { error: 'Metode tidak didukung.' });
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('[BatasHarian]', error && error.stack ? error.stack : error);
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'Terjadi kesalahan server lokal.' : error.message });
    else res.end();
  }
});

ensureDb().then(() => {
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  BatasHarian siap dijalankan.');
    console.log(`  Buka: http://${HOST}:${PORT}`);
    console.log('  Data disimpan secara lokal di folder data/db.json');
    console.log('  Tekan Ctrl+C untuk menghentikan server.');
    console.log('');
  });
}).catch((error) => {
  console.error('Gagal menyiapkan database lokal:', error);
  process.exit(1);
});
