// Login, registrasi, logout
import { state } from './state.js';
import { $ } from './utils.js';
import { api } from './api.js';

let registerMode = false;

function setAuthMode(reg) {
  registerMode = reg;
  $('#nameWrap').hidden = !reg;
  $('#aName').required = reg;
  $('#aPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('#authBtn').textContent = reg ? 'Daftar' : 'Masuk';
  $('#authSub').textContent = reg ? 'Buat akun baru.' : 'Masuk untuk mengelola project Anda.';
  $('#switchTxt').textContent = reg ? 'Sudah punya akun?' : 'Belum punya akun?';
  $('#switchLink').textContent = reg ? 'Masuk' : 'Daftar';
  $('#authErr').textContent = '';
}

export function logout() {
  localStorage.removeItem('kb_token');
  state.token = null; state.user = null; state.project = null;
  $('#app').hidden = true; $('#auth').hidden = false;
  location.hash = '';
}

// Tampilkan aplikasi setelah login
export function showApp() {
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#who').textContent = state.user.name;
}

// onLogin dipanggil setelah login/daftar berhasil
export function setupAuth(onLogin) {
  setAuthMode(false);
  $('#switchLink').onclick = () => setAuthMode(!registerMode);
  $('#logout').onclick = logout;
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#authErr').textContent = '';
    try {
      const body = { email: $('#aEmail').value, password: $('#aPass').value };
      if (registerMode) body.name = $('#aName').value;
      const d = await api('POST', registerMode ? '/api/register' : '/api/login', body);
      state.token = d.token; state.user = d.user;
      localStorage.setItem('kb_token', d.token);
      $('#aPass').value = '';
      onLogin();
    } catch (x) { $('#authErr').textContent = x.message; }
  });
}
