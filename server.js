'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

const ALCOHOL = ['Вино', 'Водка', 'Безалкогольное'];
const SOFT_DRINKS = ['Сок', 'Кола', 'Спрайт'];

const CSP =
  "default-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; " +
  "connect-src 'self'; base-uri 'none'; form-action 'self'";

const ADMIN_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'none'; " +
  "connect-src 'self'; base-uri 'none'; form-action 'self'";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'wedding.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS rsvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id TEXT,
    name TEXT NOT NULL,
    alcohol TEXT NOT NULL,
    soft_drink TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (guest_id, name)
  )
`);

const saveAnswer = db.prepare(`
  INSERT INTO rsvp (guest_id, name, alcohol, soft_drink, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guest_id, name) DO UPDATE SET
    alcohol = excluded.alcohol,
    soft_drink = excluded.soft_drink,
    created_at = excluded.created_at
`);

const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/tear-top.svg': ['tear-top.svg', 'image/svg+xml'],
  '/tear-bottom.svg': ['tear-bottom.svg', 'image/svg+xml'],
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;

  const user = decoded.slice(0, separator);
  const password = Buffer.from(decoded.slice(separator + 1));
  const expected = Buffer.from(ADMIN_PASSWORD);

  return (
    user === 'admin' &&
    password.length === expected.length &&
    crypto.timingSafeEqual(password, expected)
  );
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(fail(413, 'Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

function tally(rows, key, options) {
  return options.map((option) => `${option}: ${rows.filter((row) => row[key] === option).length}`);
}

function adminPage() {
  const rows = db.prepare('SELECT name, alcohol, soft_drink, created_at FROM rsvp ORDER BY id DESC').all();
  const table = rows.length
    ? `<table>
        <thead><tr><th>#</th><th>Имя</th><th>Алкоголь</th><th>Безалкогольный</th><th>Когда</th></tr></thead>
        <tbody>${rows
          .map(
            (row, index) => `<tr>
              <td>${rows.length - index}</td>
              <td><strong>${escapeHtml(row.name)}</strong></td>
              <td>${escapeHtml(row.alcohol)}</td>
              <td>${escapeHtml(row.soft_drink)}</td>
              <td class="muted">${escapeHtml(new Date(row.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }))}</td>
            </tr>`,
          )
          .join('')}
        </tbody>
      </table>`
    : '<p class="empty">Пока никто не ответил.</p>';

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Ответы гостей</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Neucha&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 28px 14px 60px;
      font-family: "Neucha", "Segoe Print", cursive; color: #2f3a54;
      background-color: #d6d0c2;
      background-image: radial-gradient(120% 80% at 50% 0%, #e7e1d3, #c6bfae);
    }
    .paper {
      max-width: 960px; margin: 0 auto; padding: 34px clamp(18px, 4vw, 48px) 44px;
      background: #fdfbf3; border-radius: 3px;
      box-shadow: 0 16px 20px rgba(52, 40, 24, .2);
    }
    h1 { font-family: "Caveat", cursive; font-size: 44px; line-height: 1; margin: 0 0 6px; }
    .meta { margin: 0 0 22px; font-size: 17px; color: #5b6478; }
    .meta b { color: #2f5c42; }
    .links { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 0 0 22px; }
    a { color: #2f5c42; }
    table { width: 100%; border-collapse: collapse; font-size: 17px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px dashed rgba(47, 58, 84, .25); }
    th { font-family: "Caveat", cursive; font-size: 21px; white-space: nowrap; }
    .muted { color: #6b7280; font-size: 15px; }
    .empty { font-size: 20px; color: #5b6478; }
    @media (max-width: 620px) {
      th:nth-child(5), td:nth-child(5) { display: none; }
      th, td { padding: 7px 5px; }
    }
  </style>
</head>
<body>
  <main class="paper">
    <h1>Ответы гостей</h1>
    <p class="meta">Всего: <b>${rows.length}</b> · ${escapeHtml(tally(rows, 'alcohol', ALCOHOL).join(' · '))}<br>
      ${escapeHtml(tally(rows, 'soft_drink', SOFT_DRINKS).join(' · '))}</p>
    <p class="links"><a href="/">← на сайт</a><a href="/admin.csv">Скачать CSV (для Excel)</a><a href="/admin">Обновить</a></p>
    ${table}
  </main>
</body>
</html>`;
}

function csvCell(value) {
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;

  // Нормализуем trailing slash: /admin/ работает как /admin (браузер часто добавляет слэш)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  try {
    if (req.method === 'GET' && staticFiles[pathname]) {
      const [file, type] = staticFiles[pathname];
      const body = fs.readFileSync(path.join(PUBLIC_DIR, file));
      return send(res, 200, body, {
        'Content-Type': type,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': CSP,
      });
    }

    if (req.method === 'GET' && pathname.startsWith('/plants/')) {
      const file = path.join(PUBLIC_DIR, 'plants', path.basename(pathname));
      if (!file.endsWith('.jpg') || !fs.existsSync(file)) {
        return send(res, 404, 'Не найдено', { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      return send(res, 200, fs.readFileSync(file), {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=604800',
      });
    }

    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname === '/api/rsvp') {
      const raw = await readBody(req, 10_000);
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw fail(400, 'Некорректный запрос');
      }

      const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim() : '';
      if (!name || name.length > 80) throw fail(400, 'Укажите имя (до 80 символов)');
      if (!ALCOHOL.includes(data.alcohol)) throw fail(400, 'Выберите алкогольный напиток');
      if (!SOFT_DRINKS.includes(data.soft_drink)) throw fail(400, 'Выберите безалкогольный напиток');

      const guestId =
        typeof data.guest_id === 'string' && data.guest_id.length <= 64 ? data.guest_id : null;

      saveAnswer.run(guestId, name, data.alcohol, data.soft_drink, new Date().toISOString());
      return sendJson(res, 201, { ok: true });
    }

    if (req.method === 'GET' && (pathname === '/admin' || pathname === '/admin.csv')) {
      if (!authorized(req)) {
        return send(res, 401, 'Нужен пароль', {
          'Content-Type': 'text/plain; charset=utf-8',
          'WWW-Authenticate': 'Basic realm="wedding", charset="UTF-8"',
          'Cache-Control': 'no-store',
        });
      }

      if (pathname === '/admin') {
        return send(res, 200, adminPage(), {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': ADMIN_CSP,
        });
      }

      const rows = db.prepare('SELECT name, alcohol, soft_drink, created_at FROM rsvp ORDER BY id').all();
      const csv = ['\uFEFFИмя;Алкоголь;Безалкогольный напиток;Когда']
        .concat(rows.map((row) => [row.name, row.alcohol, row.soft_drink, row.created_at].map(csvCell).join(';')))
        .join('\r\n');
      return send(res, 200, csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="wedding-rsvp.csv"',
        'Cache-Control': 'no-store',
      });
    }

    return send(res, 404, 'Не найдено', { 'Content-Type': 'text/plain; charset=utf-8' });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Внутренняя ошибка' : error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Сайт:    http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin  (логин admin, пароль ${ADMIN_PASSWORD})`);
});
