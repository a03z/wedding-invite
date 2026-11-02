import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return false;
    return decoded.slice(0, sep) === 'admin' && decoded.slice(sep + 1) === process.env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="wedding", charset="UTF-8"');
    return res.status(401).send('Нужен пароль');
  }

  const keys = await redis.keys('rsvp:*');
  const rows = [];
  for (const key of keys) {
    const v = await redis.get(key);
    if (v) rows.push(JSON.parse(v));
  }
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const total = rows.length;
  const alcohol = {};
  const soft = {};
  for (const r of rows) {
    alcohol[r.alcohol] = (alcohol[r.alcohol] || 0) + 1;
    soft[r.soft_drink] = (soft[r.soft_drink] || 0) + 1;
  }

  const table = rows.length
    ? `<table>
       <thead><tr><th>#</th><th>Имя</th><th>Алкоголь</th><th>Безалкогольный</th><th>Когда</th></tr></thead>
       <tbody>${rows
         .map(
           (r, i) => `<tr>
             <td>${i + 1}</td>
             <td><strong>${escapeHtml(r.name)}</strong></td>
             <td>${escapeHtml(r.alcohol)}</td>
             <td>${escapeHtml(r.soft_drink)}</td>
             <td class="muted">${new Date(r.created_at).toLocaleString('ru-RU')}</td>
           </tr>`
         )
         .join('')}</tbody>
     </table>`
    : '<p class="empty">Ответов пока нет</p>';

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ответы гостей · Админка</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 28px 14px 60px; font-family: "Neucha", "Segoe Print", cursive; color: #2f3a54; background-color: #d6d0c2; background-image: radial-gradient(120% 80% at 50% 0%, #e7e1d3, #c6bfae); }
.paper { max-width: 960px; margin: 0 auto; padding: 34px clamp(18px, 4vw, 48px) 44px; background: #fdfbf3; border-radius: 3px; box-shadow: 0 16px 20px rgba(52, 40, 24, .2); }
h1 { font-family: "Caveat", "Segoe Print", cursive; font-size: 44px; line-height: 1; margin: 0 0 6px; }
.meta { margin: 0 0 22px; font-size: 17px; color: #5b6478; }
.meta b { color: #2f5c42; }
.links { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 0 0 22px; }
a { color: #2f5c42; }
table { width: 100%; border-collapse: collapse; font-size: 17px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px dashed rgba(47, 58, 84, .25); }
th { font-family: "Caveat", cursive; font-size: 21px; white-space: nowrap; }
.muted { color: #6b7280; font-size: 15px; }
.empty { font-size: 20px; color: #5b6478; }
</style>
</head>
<body>
<main class="paper">
<h1>Ответы гостей</h1>
<p class="meta">Всего: <b>${total}</b> · ${Object.entries(alcohol).map(([k, v]) => `${escapeHtml(k)}: ${v}`).join(' · ')} · ${Object.entries(soft).map(([k, v]) => `${escapeHtml(k)}: ${v}`).join(' · ')}</p>
<p class="links"><a href="/">← на сайт</a><a href="/admin.csv">Скачать CSV (для Excel)</a><a href="/admin">Обновить</a></p>
${table}
</main>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
}
