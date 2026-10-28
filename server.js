// Backend Kanban Board: Express.js + MySQL (mysql2) + JWT
require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('JWT_SECRET belum diatur (min. 16 karakter). Salin .env.example menjadi .env lalu isi.');
  process.exit(1);
}

app.use(cors({
  origin: ['https://panglimatempur.netlify.app', 'http://localhost:5173'], // Ganti dengan URL Netlify kamu
  credentials: true
}));
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kanban_board',
  waitForConnections: true,
  connectionLimit: 10,
});

const app = express();
app.use(express.json({ limit: '100kb' }));

// Frontend (folder public). Saat dijalankan lewat Docker, frontend disajikan nginx.
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

const PRIORITIES = ['rendah', 'sedang', 'tinggi'];
// Baca prioritas & tenggat dari body; kembalikan { error } jika tidak valid
function cardExtras(body) {
  const priority = body.priority === undefined || body.priority === '' ? 'sedang' : body.priority;
  if (!PRIORITIES.includes(priority)) return { error: 'Prioritas harus rendah, sedang, atau tinggi' };
  const raw = body.due_date;
  let due = null;
  if (raw) {
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      return { error: 'Tenggat harus berformat YYYY-MM-DD' };
    }
    due = raw;
  }
  return { priority, due };
}

// ---------- Otentikasi ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return bad(res, 'Belum login', 401);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    bad(res, 'Sesi tidak valid atau kedaluwarsa, silakan login ulang', 401);
  }
}

const signToken = (u) =>
  jwt.sign({ id: u.id, name: u.name, email: u.email }, JWT_SECRET, { expiresIn: '7d' });

app.post('/api/register', wrap(async (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 150).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Nama dan email yang valid wajib diisi');
  if (password.length < 6 || password.length > 72) return bad(res, 'Password 6-72 karakter');
  const [exist] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exist.length) return bad(res, 'Email sudah terdaftar', 409);
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
  const user = { id: r.insertId, name, email };
  res.status(201).json({ token: signToken(user), user });
}));

app.post('/api/login', wrap(async (req, res) => {
  const email = clean(req.body.email, 150).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return bad(res, 'Email atau password salah', 401);
  const user = { id: u.id, name: u.name, email: u.email };
  res.json({ token: signToken(user), user });
}));

app.get('/api/me', auth, (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email } }));

// ---------- Helper ----------
async function log(conn, projectId, userId, action, detail) {
  await conn.query(
    'INSERT INTO project_history (project_id, user_id, action, detail) VALUES (?, ?, ?, ?)',
    [projectId, userId, action, detail.slice(0, 500)]
  );
}

// Ambil project milik user; kirim 404 jika bukan miliknya
async function ownProject(req, res, id) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!rows.length) { bad(res, 'Project tidak ditemukan', 404); return null; }
  return rows[0];
}

// Ambil kartu milik user (lewat project-nya)
async function ownCard(req, res, id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT c.*, col.title AS column_title FROM cards c
       JOIN columns_board col ON col.id = c.column_id
       JOIN projects p ON p.id = c.project_id
      WHERE c.id = ? AND p.user_id = ?`, [id, req.user.id]);
  if (!rows.length) { bad(res, 'Kartu tidak ditemukan', 404); return null; }
  return rows[0];
}

// ---------- Project ----------
app.get('/api/projects', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM cards c WHERE c.project_id = p.id) AS card_count
       FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`, [req.user.id]);
  res.json(rows);
}));

app.post('/api/projects', auth, wrap(async (req, res) => {
  const name = clean(req.body.name, 120);
  const description = clean(req.body.description, 500) || null;
  if (!name) return bad(res, 'Nama project wajib diisi');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO projects (user_id, name, description) VALUES (?, ?, ?)', [req.user.id, name, description]);
    const pid = r.insertId;
    for (const [i, t] of ['To Do', 'In Progress', 'Done'].entries()) {
      await conn.query('INSERT INTO columns_board (project_id, title, position) VALUES (?, ?, ?)', [pid, t, i]);
    }
    await log(conn, pid, req.user.id, 'project_created', `Project "${name}" dibuat`);
    await conn.commit();
    res.status(201).json({ id: pid, name, description });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put('/api/projects/:id', auth, wrap(async (req, res) => {
  const p = await ownProject(req, res, req.params.id); if (!p) return;
  const name = clean(req.body.name, 120);
  const description = clean(req.body.description, 500) || null;
  if (!name) return bad(res, 'Nama project wajib diisi');
  await pool.query('UPDATE projects SET name = ?, description = ? WHERE id = ?', [name, description, p.id]);
  await log(pool, p.id, req.user.id, 'project_updated', `Project diubah menjadi "${name}"`);
  res.json({ ok: true });
}));

app.delete('/api/projects/:id', auth, wrap(async (req, res) => {
  const p = await ownProject(req, res, req.params.id); if (!p) return;
  await pool.query('DELETE FROM projects WHERE id = ?', [p.id]);
  res.json({ ok: true });
}));

// Papan lengkap: kolom + kartu
app.get('/api/projects/:id/board', auth, wrap(async (req, res) => {
  const p = await ownProject(req, res, req.params.id); if (!p) return;
  const [cols] = await pool.query('SELECT id, title, position FROM columns_board WHERE project_id = ? ORDER BY position, id', [p.id]);
  const [cards] = await pool.query(
    `SELECT id, column_id, title, description, priority, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
            position, created_at, updated_at
       FROM cards WHERE project_id = ? ORDER BY position, id`, [p.id]);
  res.json({
    project: { id: p.id, name: p.name, description: p.description },
    columns: cols.map((c) => ({ ...c, cards: cards.filter((k) => k.column_id === c.id) })),
  });
}));

app.get('/api/projects/:id/history', auth, wrap(async (req, res) => {
  const p = await ownProject(req, res, req.params.id); if (!p) return;
  const [rows] = await pool.query(
    `SELECT h.id, h.action, h.detail, h.created_at, u.name AS user_name
       FROM project_history h JOIN users u ON u.id = h.user_id
      WHERE h.project_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 200`, [p.id]);
  res.json(rows);
}));

// ---------- Kolom ----------
// Ambil kolom milik user (lewat project-nya)
async function ownColumn(req, res, id) {
  const [rows] = await pool.query(
    `SELECT col.* FROM columns_board col JOIN projects p ON p.id = col.project_id
      WHERE col.id = ? AND p.user_id = ?`, [id, req.user.id]);
  if (!rows.length) { bad(res, 'Kolom tidak ditemukan', 404); return null; }
  return rows[0];
}

app.post('/api/projects/:id/columns', auth, wrap(async (req, res) => {
  const p = await ownProject(req, res, req.params.id); if (!p) return;
  const title = clean(req.body.title, 80);
  if (!title) return bad(res, 'Nama kolom wajib diisi');
  const [[{ n, pos }]] = await pool.query(
    'SELECT COUNT(*) AS n, COALESCE(MAX(position) + 1, 0) AS pos FROM columns_board WHERE project_id = ?', [p.id]);
  if (n >= 10) return bad(res, 'Maksimal 10 kolom per project');
  const [r] = await pool.query('INSERT INTO columns_board (project_id, title, position) VALUES (?, ?, ?)', [p.id, title, pos]);
  await log(pool, p.id, req.user.id, 'column_created', `Kolom "${title}" dibuat`);
  res.status(201).json({ id: r.insertId });
}));

app.put('/api/columns/:id', auth, wrap(async (req, res) => {
  const col = await ownColumn(req, res, req.params.id); if (!col) return;
  const title = clean(req.body.title, 80);
  if (!title) return bad(res, 'Nama kolom wajib diisi');
  await pool.query('UPDATE columns_board SET title = ? WHERE id = ?', [title, col.id]);
  await log(pool, col.project_id, req.user.id, 'column_updated', `Kolom "${col.title}" diubah menjadi "${title}"`);
  res.json({ ok: true });
}));

// Menghapus kolom ikut menghapus kartu di dalamnya; kolom terakhir tidak boleh dihapus
app.delete('/api/columns/:id', auth, wrap(async (req, res) => {
  const col = await ownColumn(req, res, req.params.id); if (!col) return;
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM columns_board WHERE project_id = ?', [col.project_id]);
  if (n <= 1) return bad(res, 'Project harus punya minimal satu kolom');
  const [[{ cards }]] = await pool.query('SELECT COUNT(*) AS cards FROM cards WHERE column_id = ?', [col.id]);
  await pool.query('DELETE FROM columns_board WHERE id = ?', [col.id]);
  await log(pool, col.project_id, req.user.id, 'column_deleted',
    `Kolom "${col.title}" dihapus` + (cards ? ` beserta ${cards} kartu` : ''));
  res.json({ ok: true });
}));

// ---------- Kartu ----------
app.post('/api/projects/:id/cards', auth, wrap(async (req, res) => {
  const p = await ownProject(req, res, req.params.id); if (!p) return;
  const title = clean(req.body.title, 150);
  const description = clean(req.body.description, 5000) || null;
  if (!title) return bad(res, 'Judul kartu wajib diisi');
  const ex = cardExtras(req.body);
  if (ex.error) return bad(res, ex.error);
  const [cols] = await pool.query('SELECT id, title FROM columns_board WHERE id = ? AND project_id = ?', [req.body.column_id, p.id]);
  if (!cols.length) return bad(res, 'Kolom tidak valid');
  const [[{ pos }]] = await pool.query('SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM cards WHERE column_id = ?', [cols[0].id]);
  const [r] = await pool.query(
    'INSERT INTO cards (column_id, project_id, title, description, priority, due_date, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [cols[0].id, p.id, title, description, ex.priority, ex.due, pos]);
  await log(pool, p.id, req.user.id, 'card_created', `Kartu "${title}" dibuat di kolom ${cols[0].title}`);
  res.status(201).json({ id: r.insertId });
}));

app.put('/api/cards/:id', auth, wrap(async (req, res) => {
  const c = await ownCard(req, res, req.params.id); if (!c) return;
  const title = clean(req.body.title, 150);
  const description = clean(req.body.description, 5000) || null;
  if (!title) return bad(res, 'Judul kartu wajib diisi');
  const ex = cardExtras(req.body);
  if (ex.error) return bad(res, ex.error);
  await pool.query('UPDATE cards SET title = ?, description = ?, priority = ?, due_date = ? WHERE id = ?',
    [title, description, ex.priority, ex.due, c.id]);
  const notes = [];
  if (title !== c.title) notes.push(`judul menjadi "${title}"`);
  if (ex.priority !== c.priority) notes.push(`prioritas ${c.priority} menjadi ${ex.priority}`);
  const oldDue = c.due_date ? new Date(c.due_date).toLocaleDateString('sv-SE') : null;
  if (ex.due !== oldDue) notes.push(ex.due ? `tenggat ${ex.due}` : 'tenggat dihapus');
  await log(pool, c.project_id, req.user.id, 'card_updated',
    `Kartu "${c.title}" diubah` + (notes.length ? ': ' + notes.join(', ') : ''));
  res.json({ ok: true });
}));

app.delete('/api/cards/:id', auth, wrap(async (req, res) => {
  const c = await ownCard(req, res, req.params.id); if (!c) return;
  await pool.query('DELETE FROM cards WHERE id = ?', [c.id]);
  await log(pool, c.project_id, req.user.id, 'card_deleted', `Kartu "${c.title}" dihapus dari kolom ${c.column_title}`);
  res.json({ ok: true });
}));

// Pindah kartu ke kolom (dan urutan) tertentu
app.patch('/api/cards/:id/move', auth, wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = await ownCard(req, res, req.params.id, conn);
    if (!c) { await conn.rollback(); return; }
    await conn.query('SELECT id FROM projects WHERE id = ? FOR UPDATE', [c.project_id]);
    const [cols] = await conn.query('SELECT id, title FROM columns_board WHERE id = ? AND project_id = ?', [req.body.column_id, c.project_id]);
    if (!cols.length) { await conn.rollback(); return bad(res, 'Kolom tujuan tidak valid'); }
    const target = cols[0];
    const [rows] = await conn.query('SELECT id FROM cards WHERE column_id = ? AND id <> ? ORDER BY position, id', [target.id, c.id]);
    const ids = rows.map((r) => r.id);
    let idx = Number.parseInt(req.body.position, 10);
    if (!Number.isFinite(idx) || idx > ids.length) idx = ids.length;
    if (idx < 0) idx = 0;
    ids.splice(idx, 0, c.id);
    await conn.query('UPDATE cards SET column_id = ? WHERE id = ?', [target.id, c.id]);
    for (const [i, id] of ids.entries()) await conn.query('UPDATE cards SET position = ? WHERE id = ?', [i, id]);
    if (c.column_id !== target.id) {
      const [src] = await conn.query('SELECT id FROM cards WHERE column_id = ? ORDER BY position, id', [c.column_id]);
      for (const [i, r] of src.entries()) await conn.query('UPDATE cards SET position = ? WHERE id = ?', [i, r.id]);
      await log(conn, c.project_id, req.user.id, 'card_moved', `Kartu "${c.title}" dipindah dari ${c.column_title} ke ${target.title}`);
    } else if (c.position !== idx) {
      await log(conn, c.project_id, req.user.id, 'card_reordered', `Urutan kartu "${c.title}" diubah di kolom ${target.title}`);
    }
    await conn.query('UPDATE projects SET updated_at = NOW() WHERE id = ?', [c.project_id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.use('/api', (req, res) => bad(res, 'Endpoint tidak ditemukan', 404));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return bad(res, 'Format JSON tidak valid');
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

app.listen(PORT, () => console.log(`Kanban Board berjalan di http://localhost:${PORT}`));

module.exports = app;