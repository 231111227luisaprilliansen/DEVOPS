// Titik masuk frontend: wajib login, lalu routing berbasis hash
import { state } from './state.js';
import { toast } from './utils.js';
import { api, setUnauthorizedHandler } from './api.js';
import { setupAuth, showApp, logout } from './auth.js';
import { loadProjects, setupProjects } from './projects.js';
import { loadBoard, setupBoard } from './board.js';
import { loadHistory, setupHistory } from './history.js';

async function route() {
  const m = location.hash.match(/^#\/project\/(\d+)(\/history)?$/);
  try {
    if (!m) return await loadProjects();
    if (m[2]) return await loadHistory(m[1]);
    await loadBoard(m[1]);
  } catch (x) {
    toast(x.message);
    if (m) location.hash = '';
  }
}

function enterApp() {
  showApp();
  route();
}

async function init() {
  setUnauthorizedHandler(logout);
  setupAuth(enterApp);
  setupProjects();
  setupBoard();
  setupHistory();
  window.addEventListener('hashchange', () => { if (state.user) route(); });

  if (state.token) {
    try {
      state.user = (await api('GET', '/api/me')).user;
      return enterApp();
    } catch { /* token tidak valid */ }
  }
  logout();
}

init();
