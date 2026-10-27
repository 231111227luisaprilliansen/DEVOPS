// Fungsi bantu DOM & format
export const $ = (s) => document.querySelector(s);

// Buat elemen; teks selalu lewat append(string) sehingga aman dari XSS
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
}

export const fmt = (d) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export function toast(msg) {
  const t = el('div', { id: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

// Tampilkan satu dari tiga tampilan utama
export function show(view) {
  for (const v of ['vProjects', 'vBoard', 'vHistory']) $('#' + v).hidden = v !== view;
}
