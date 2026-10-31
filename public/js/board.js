// Papan kanban: kolom, kartu, drag and drop
import { state } from './state.js';
import { $, el, toast, show } from './utils.js';
import { api } from './api.js';
import { modal, confirmBox } from './modal.js';
import { renderStats, setupStats } from './stats.js';

export async function loadBoard(id) {
  const d = await api('GET', `/api/projects/${id}/board`);
  state.project = d.project;
  state.columns = d.columns;
  show('vBoard');
  renderBoard();
  renderStats().catch(() => {});
}

const reload = () => loadBoard(state.project.id);

function renderBoard() {
  const p = state.project;
  $('#bTitle').textContent = p.name;
  $('#bDesc').textContent = p.description || '';
  $('#bDesc').hidden = !p.description;
  const board = $('#board');
  board.replaceChildren();
  for (const col of state.columns) board.append(columnEl(col));
}

function columnEl(col) {
  const body = el('div', { class: 'cards' });
  for (const c of col.cards) body.append(cardEl(c, col));
  const head = el('div', { class: 'col-head' },
    el('h3', {}, col.title, el('span', {}, String(col.cards.length))),
    el('div', { class: 'col-acts' },
      el('button', { class: 'icon', title: 'Ganti nama kolom', onclick: () => renameColumn(col) }, 'Ubah'),
      el('button', { class: 'icon', title: 'Hapus kolom', onclick: () => delColumn(col) }, 'Hapus')));
  const colEl = el('div', { class: 'column', 'data-col': col.id }, head, body,
    el('button', { class: 'add-card', onclick: () => addCard(col) }, '+ Tambah kartu'));

  colEl.addEventListener('dragover', (e) => { e.preventDefault(); colEl.classList.add('over'); });
  colEl.addEventListener('dragleave', (e) => { if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('over'); });
  colEl.addEventListener('drop', (e) => {
    e.preventDefault();
    colEl.classList.remove('over');
    const cardId = Number(e.dataTransfer.getData('text/plain'));
    if (!cardId) return;
    // posisi sisip: sebelum kartu pertama yang titik tengahnya di bawah kursor
    const kids = [...body.querySelectorAll('.card:not(.dragging)')];
    let idx = kids.findIndex((k) => { const r = k.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (idx < 0) idx = kids.length;
    moveCard(cardId, col.id, idx);
  });
  return colEl;
}

function cardEl(c, col) {
  const sel = el('select', { class: 'moveSel', title: 'Pindah ke kolom', onchange: (e) => moveCard(c.id, Number(e.target.value), 1e6) },
    el('option', { value: '' }, 'Pindah ke…'));
  for (const o of state.columns) if (o.id !== col.id) sel.append(el('option', { value: o.id }, o.title));

  const today = new Date().toLocaleDateString('sv-SE');
  const overdue = c.due_date && c.due_date < today && col.title !== 'Done';
  const meta = el('div', { class: 'meta' },
    el('span', { class: 'prio ' + c.priority }, PRIORITY_LABEL[c.priority] || c.priority),
    c.due_date ? el('span', { class: 'due' + (overdue ? ' late' : '') }, 'Tenggat ' + fmtDate(c.due_date)) : null);

  const card = el('div', { class: 'card', draggable: 'true' },
    el('h4', {}, c.title), c.description ? el('p', {}, c.description) : null, meta,
    el('div', { class: 'acts' },
      el('button', { class: 'btn ghost sm', onclick: () => editCard(c) }, 'Ubah'),
      el('button', { class: 'btn ghost sm', onclick: () => delCard(c) }, 'Hapus'), sel));
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(c.id));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => card.classList.add('dragging'), 0);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

const PRIORITY_LABEL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'medium' });

const cardFields = (c = {}) => [
  { name: 'title', label: 'Judul', required: true, value: c.title },
  { name: 'description', label: 'Deskripsi', long: true, max: 5000, value: c.description },
  { name: 'priority', label: 'Prioritas', value: c.priority || 'sedang',
    options: Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label })) },
  { name: 'due_date', label: 'Tenggat (opsional)', type: 'date', value: c.due_date },
];

const addCard = (col) => modal(`Kartu baru di ${col.title}`, cardFields(), 'Tambah', async (v) => {
  await api('POST', `/api/projects/${state.project.id}/cards`, { ...v, column_id: col.id });
  await reload();
});

const editCard = (c) => modal('Ubah kartu', cardFields(c), 'Simpan', async (v) => {
  await api('PUT', '/api/cards/' + c.id, v);
  await reload();
});

const delCard = (c) => confirmBox(`Hapus kartu "${c.title}"?`, async () => {
  await api('DELETE', '/api/cards/' + c.id);
  await reload();
});

const addColumn = () => modal('Kolom baru', [
  { name: 'title', label: 'Nama kolom', required: true, max: 80 },
], 'Tambah', async (v) => {
  await api('POST', `/api/projects/${state.project.id}/columns`, v);
  await reload();
});

const renameColumn = (col) => modal('Ganti nama kolom', [
  { name: 'title', label: 'Nama kolom', required: true, max: 80, value: col.title },
], 'Simpan', async (v) => {
  await api('PUT', '/api/columns/' + col.id, v);
  await reload();
});

const delColumn = (col) => confirmBox(
  col.cards.length ? `Hapus kolom "${col.title}" beserta ${col.cards.length} kartu di dalamnya?` : `Hapus kolom "${col.title}"?`,
  async () => { await api('DELETE', '/api/columns/' + col.id); await reload(); });

async function moveCard(id, columnId, position) {
  try { await api('PATCH', `/api/cards/${id}/move`, { column_id: columnId, position }); }
  catch (x) { toast(x.message); }
  await reload();
}

export function setupBoard() {
  $('#bBack').onclick = () => { location.hash = ''; };
  $('#bAddCol').onclick = addColumn;
  setupStats();
  $('#bHistory').onclick = () => { location.hash = `#/project/${state.project.id}/history`; };
  $('#bEdit').onclick = () => modal('Ubah project', [
    { name: 'name', label: 'Nama project', required: true, max: 120, value: state.project.name },
    { name: 'description', label: 'Deskripsi', long: true, value: state.project.description },
  ], 'Simpan', async (v) => { await api('PUT', '/api/projects/' + state.project.id, v); await reload(); });
  $('#bDelete').onclick = () => confirmBox(`Hapus project "${state.project.name}" beserta semua kartu dan riwayatnya?`, async () => {
    await api('DELETE', '/api/projects/' + state.project.id);
    location.hash = '';
  });
}
