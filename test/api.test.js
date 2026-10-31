// Uji API end-to-end. Server + MySQL harus sudah berjalan.
// BASE_URL default http://localhost:3000 (Docker Compose: http://localhost:8080)
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const rnd = Date.now();

async function call(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

test('alur lengkap: register, login, project, kartu, riwayat, kepemilikan', async () => {
  assert.equal((await call('GET', '/api/projects')).status, 401, 'tanpa token harus 401');

  const email = `budi${rnd}@x.com`;
  const reg = await call('POST', '/api/register', { name: 'Budi', email, password: 'secret1' });
  assert.equal(reg.status, 201);
  assert.equal((await call('POST', '/api/register', { name: 'Budi', email, password: 'secret1' })).status, 409);
  assert.equal((await call('POST', '/api/login', { email, password: 'salah' })).status, 401);
  assert.equal((await call('POST', '/api/login', { email: "' OR 1=1 -- ", password: 'x' })).status, 401);

  const token = (await call('POST', '/api/login', { email, password: 'secret1' })).data.token;
  const other = (await call('POST', '/api/register', { name: 'Ani', email: `ani${rnd}@x.com`, password: 'secret2' })).data.token;

  const pid = (await call('POST', '/api/projects', { name: 'Skripsi' }, token)).data.id;
  let board = (await call('GET', `/api/projects/${pid}/board`, null, token)).data;
  assert.deepEqual(board.columns.map((c) => c.title), ['To Do', 'In Progress', 'Done']);
  const [c1, c2] = board.columns.map((c) => c.id);

  const ids = [];
  for (const title of ['A', 'B', 'C']) ids.push((await call('POST', `/api/projects/${pid}/cards`, { title, column_id: c1 }, token)).data.id);
  assert.equal((await call('PATCH', `/api/cards/${ids[2]}/move`, { column_id: c2, position: 0 }, token)).status, 200);
  assert.equal((await call('PATCH', `/api/cards/${ids[0]}/move`, { column_id: c2, position: 0 }, token)).status, 200);
  assert.equal((await call('PUT', `/api/cards/${ids[1]}`, { title: 'B2' }, token)).status, 200);
  assert.equal((await call('DELETE', `/api/cards/${ids[2]}`, null, token)).status, 200);

  board = (await call('GET', `/api/projects/${pid}/board`, null, token)).data;
  assert.deepEqual(board.columns[0].cards.map((c) => c.title), ['B2']);
  assert.deepEqual(board.columns[1].cards.map((c) => c.title), ['A']);

  const actions = (await call('GET', `/api/projects/${pid}/history`, null, token)).data.map((h) => h.action);
  for (const a of ['project_created', 'card_created', 'card_moved', 'card_updated', 'card_deleted']) assert.ok(actions.includes(a), a);

  // prioritas & tenggat
  const hi = await call('POST', `/api/projects/${pid}/cards`, { title: 'Urgent', column_id: c1, priority: 'tinggi', due_date: '2030-01-15' }, token);
  assert.equal(hi.status, 201);
  assert.equal((await call('POST', `/api/projects/${pid}/cards`, { title: 'X', column_id: c1, priority: 'darurat' }, token)).status, 400);
  assert.equal((await call('POST', `/api/projects/${pid}/cards`, { title: 'X', column_id: c1, due_date: '15-01-2030' }, token)).status, 400);
  assert.equal((await call('PUT', `/api/cards/${hi.data.id}`, { title: 'Urgent', priority: 'rendah', due_date: '' }, token)).status, 200);
  board = (await call('GET', `/api/projects/${pid}/board`, null, token)).data;
  const urgent = board.columns[0].cards.find((c) => c.title === 'Urgent');
  assert.equal(urgent.priority, 'rendah');
  assert.equal(urgent.due_date, null);
  assert.equal(board.columns[0].cards.find((c) => c.title === 'B2').priority, 'sedang');
  const detail = (await call('GET', `/api/projects/${pid}/history`, null, token)).data[0].detail;
  assert.match(detail, /prioritas tinggi menjadi rendah/);
  assert.match(detail, /tenggat dihapus/);

  // kelola kolom
  const nc = await call('POST', `/api/projects/${pid}/columns`, { title: 'Review' }, token);
  assert.equal(nc.status, 201);
  assert.equal((await call('POST', `/api/projects/${pid}/columns`, { title: '  ' }, token)).status, 400);
  assert.equal((await call('PUT', `/api/columns/${nc.data.id}`, { title: 'QA' }, token)).status, 200);
  board = (await call('GET', `/api/projects/${pid}/board`, null, token)).data;
  assert.deepEqual(board.columns.map((c) => c.title), ['To Do', 'In Progress', 'Done', 'QA']);
  assert.equal((await call('PUT', `/api/columns/${nc.data.id}`, { title: 'x' }, other)).status, 404);
  assert.equal((await call('DELETE', `/api/columns/${nc.data.id}`, null, other)).status, 404);
  assert.equal((await call('DELETE', `/api/columns/${nc.data.id}`, null, token)).status, 200);
  board = (await call('GET', `/api/projects/${pid}/board`, null, token)).data;
  assert.equal(board.columns.length, 3);
  const colActions = (await call('GET', `/api/projects/${pid}/history`, null, token)).data.map((h) => h.action);
  for (const a of ['column_created', 'column_updated', 'column_deleted']) assert.ok(colActions.includes(a), a);

  // project dengan satu kolom tidak boleh kehilangan kolom terakhir
  const solo = (await call('POST', '/api/projects', { name: 'Solo' }, token)).data.id;
  const soloCols = (await call('GET', `/api/projects/${solo}/board`, null, token)).data.columns;
  assert.equal((await call('DELETE', `/api/columns/${soloCols[0].id}`, null, token)).status, 200);
  assert.equal((await call('DELETE', `/api/columns/${soloCols[1].id}`, null, token)).status, 200);
  assert.equal((await call('DELETE', `/api/columns/${soloCols[2].id}`, null, token)).status, 400);

  // statistik project
  await call('POST', `/api/projects/${pid}/cards`, { title: 'Telat', column_id: c1, priority: 'tinggi', due_date: '2020-01-01' }, token);
  const st = (await call('GET', `/api/projects/${pid}/stats`, null, token)).data;
  board = (await call('GET', `/api/projects/${pid}/board`, null, token)).data;
  const cardTotal = board.columns.reduce((n, c) => n + c.cards.length, 0);
  assert.equal(st.total, cardTotal);
  assert.equal(st.by_column.length, board.columns.length);
  assert.equal(st.by_priority.tinggi, 1);
  assert.equal(st.overdue, 1);
  assert.ok(st.progress >= 0 && st.progress <= 100);
  assert.equal((await call('GET', `/api/projects/${pid}/stats`, null, other)).status, 404);
  assert.equal((await call('GET', `/api/projects/${pid}/stats`)).status, 401);

  // user lain tidak boleh mengakses
  assert.equal((await call('GET', `/api/projects/${pid}/board`, null, other)).status, 404);
  assert.equal((await call('PUT', `/api/cards/${ids[0]}`, { title: 'x' }, other)).status, 404);
  assert.equal((await call('PATCH', `/api/cards/${ids[0]}/move`, { column_id: c1 }, other)).status, 404);
  assert.equal((await call('DELETE', `/api/projects/${pid}`, null, other)).status, 404);
});
