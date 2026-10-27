// Daftar project
import { $, el, fmt, show } from './utils.js';
import { api } from './api.js';
import { modal } from './modal.js';

export async function loadProjects() {
  show('vProjects');
  const list = await api('GET', '/api/projects');
  const g = $('#projectGrid');
  g.replaceChildren();
  if (!list.length) g.append(el('div', { class: 'empty' }, 'Belum ada project. Klik "+ Project Baru" untuk memulai.'));
  for (const p of list) {
    g.append(el('div', { class: 'pcard', onclick: () => { location.hash = '#/project/' + p.id; } },
      el('h3', {}, p.name), el('p', {}, p.description || 'Tanpa deskripsi'),
      el('small', {}, `${p.card_count} kartu · diubah ${fmt(p.updated_at)}`)));
  }
}

export function setupProjects() {
  $('#logo').onclick = () => { location.hash = ''; };
  $('#newProject').onclick = () => modal('Project Baru', [
    { name: 'name', label: 'Nama project', required: true, max: 120 },
    { name: 'description', label: 'Deskripsi (opsional)', long: true },
  ], 'Buat', async (v) => {
    const p = await api('POST', '/api/projects', v);
    location.hash = '#/project/' + p.id;
  });
}
