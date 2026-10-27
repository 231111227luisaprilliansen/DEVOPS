// Dialog form dan konfirmasi
import { $, el, toast } from './utils.js';

const close = () => $('#modalRoot').replaceChildren();

export function modal(title, fields, submitText, onSubmit) {
  const form = el('form', { class: 'modal' }, el('h3', {}, title));
  const inputs = {};
  for (const f of fields) {
    let input;
    if (f.options) {
      input = el('select', {}, ...f.options.map((o) => el('option', { value: o.value }, o.label)));
    } else if (f.long) {
      input = el('textarea', { rows: 4, maxlength: f.max || 500 });
    } else {
      input = el('input', f.type === 'date' ? { type: 'date' } : { maxlength: f.max || 150 });
    }
    input.value = f.value || '';
    if (f.required) input.required = true;
    inputs[f.name] = input;
    form.append(el('label', {}, f.label), input);
  }
  const err = el('div', { class: 'error' });
  form.append(err, el('div', { class: 'row' },
    el('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Batal'),
    el('button', { type: 'submit', class: 'btn' }, submitText)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
    try { await onSubmit(vals); close(); } catch (x) { err.textContent = x.message; }
  });
  const ov = el('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) close(); } }, form);
  $('#modalRoot').replaceChildren(ov);
  Object.values(inputs)[0]?.focus();
}

export function confirmBox(text, onYes) {
  const box = el('div', { class: 'modal' }, el('h3', {}, 'Konfirmasi'), el('p', {}, text),
    el('div', { class: 'row' },
      el('button', { class: 'btn ghost', onclick: close }, 'Batal'),
      el('button', { class: 'btn danger', onclick: async () => { try { await onYes(); } catch (x) { toast(x.message); } close(); } }, 'Ya, hapus')));
  $('#modalRoot').replaceChildren(el('div', { class: 'overlay' }, box));
}
