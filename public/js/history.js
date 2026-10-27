// Riwayat aktivitas project
import { state } from './state.js';
import { $, el, fmt, show } from './utils.js';
import { api } from './api.js';

const ACTION = {
  project_created: 'Project', project_updated: 'Project', card_created: 'Dibuat',
  card_updated: 'Diubah', card_deleted: 'Dihapus', card_moved: 'Dipindah', card_reordered: 'Urutan',
};

export async function loadHistory(id) {
  const [rows, board] = await Promise.all([api('GET', `/api/projects/${id}/history`), api('GET', `/api/projects/${id}/board`)]);
  state.project = board.project;
  $('#hTitle').textContent = 'Riwayat: ' + board.project.name;
  const ul = $('#hList');
  ul.replaceChildren();
  if (!rows.length) ul.append(el('li', {}, 'Belum ada aktivitas.'));
  for (const r of rows) {
    ul.append(el('li', {}, el('span', { class: 't' }, fmt(r.created_at)), el('span', { class: 'tag' }, ACTION[r.action] || r.action),
      el('span', {}, el('span', { class: 'u' }, r.user_name), ' — ' + r.detail)));
  }
  show('vHistory');
}

export function setupHistory() {
  $('#hBack').onclick = () => { location.hash = '#/project/' + state.project.id; };
}
