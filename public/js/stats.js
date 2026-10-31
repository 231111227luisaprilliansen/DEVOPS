// Panel statistik project
import { state } from './state.js';
import { $, el } from './utils.js';
import { api } from './api.js';

const tile = (label, value, cls = '') =>
  el('div', { class: 'tile ' + cls }, el('strong', {}, String(value)), el('span', {}, label));

export async function renderStats() {
  const panel = $('#stats');
  if (panel.hidden) return;
  const s = await api('GET', `/api/projects/${state.project.id}/stats`);
  panel.replaceChildren(
    el('div', { class: 'tiles' },
      tile('Total kartu', s.total),
      tile('Selesai', s.done, 'good'),
      tile('Terlambat', s.overdue, s.overdue ? 'bad' : ''),
      tile('Tenggat 7 hari', s.due_soon, s.due_soon ? 'warn' : ''),
      tile('Prioritas tinggi', s.by_priority.tinggi)),
    el('div', { class: 'progress-wrap' },
      el('div', { class: 'progress-label' }, `Progres ${s.progress}% (kartu di kolom terakhir dianggap selesai)`),
      el('div', { class: 'progress' }, el('div', { class: 'progress-bar', style: `width:${s.progress}%` }))),
    el('div', { class: 'per-col' }, ...s.by_column.map((c) => el('span', {}, `${c.title}: ${c.count}`))));
}

export function setupStats() {
  $('#bStats').onclick = () => {
    const panel = $('#stats');
    panel.hidden = !panel.hidden;
    renderStats().catch(() => {});
  };
}
