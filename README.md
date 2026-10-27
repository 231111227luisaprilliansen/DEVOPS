# Kanban Board

Website Kanban dengan login, project tersimpan per user, dan riwayat aktivitas.
Tiga bagian terpisah: `public/` (frontend), `server.js` (backend Express.js), `database.sql` (skema MySQL).

```
public/
  index.html        kerangka halaman
  css/style.css     seluruh gaya
  js/               modul: main (routing), api, auth, projects, board, history, modal, utils, state
server.js           backend Express + JWT
database.sql        skema MySQL
docker-compose.yml  3 container: frontend (nginx), backend, database
```

## Menjalankan dengan Docker (3 container)
`docker compose up -d`, lalu buka http://localhost:8080

## Menjalankan manual
1. Pasang Node.js 18+ dan MySQL 8 (atau MariaDB 10.4+).
2. Impor skema: `mysql -u root -p < database.sql` (membuat database `kanban_board`).
3. `npm install`
4. Salin `.env.example` menjadi `.env`, lalu isi `DB_USER`, `DB_PASSWORD`, dan `JWT_SECRET` (string acak panjang).
5. `npm start`, buka http://localhost:3000

## Alur
Daftar akun -> masuk -> buat project (otomatis kolom To Do / In Progress / Done) -> tambah, ubah, hapus, dan seret kartu antar kolom -> tombol **Riwayat** menampilkan siapa melakukan apa dan kapan.

## Keamanan
Password di-hash (bcrypt), JWT 7 hari (disimpan di localStorage), query MySQL berparameter, setiap endpoint project/kartu memeriksa kepemilikan (user lain mendapat 404), UI memakai `textContent` (anti-XSS).

## API ringkas
`POST /api/register`, `POST /api/login`, `GET /api/me`, `GET/POST /api/projects`, `PUT/DELETE /api/projects/:id`, `GET /api/projects/:id/board`, `GET /api/projects/:id/history`, `POST /api/projects/:id/cards`, `PUT/DELETE /api/cards/:id`, `PATCH /api/cards/:id/move`.

## CI/CD (GitHub Actions)
`.github/workflows/ci-cd.yml`:
- **CI** (setiap push dan pull request): `npm ci`, cek syntax, jalankan MySQL + server, lalu `npm test` (uji API end-to-end).
- **CD** (push ke `main`, jika CI lulus): build image backend dan frontend, kirim ke GitHub Container Registry (`ghcr.io/<user>/<repo>-backend` dan `-frontend`).

Uji lokal terhadap stack Docker: `set BASE_URL=http://localhost:8080` lalu `npm test`.
