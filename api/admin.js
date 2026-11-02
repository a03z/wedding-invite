import { listRsvps, requireAdmin } from '../lib/guests.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const rows = await listRsvps();
    const total = rows.length;
    const alcohol = {};
    const soft = {};
    for (const row of rows) {
      alcohol[row.alcohol] = (alcohol[row.alcohol] || 0) + 1;
      soft[row.soft_drink] = (soft[row.soft_drink] || 0) + 1;
    }

    const table = rows.length
      ? `<table>
       <thead><tr><th>#</th><th>Имя</th><th>Алкоголь</th><th>Безалкогольный</th><th>Когда</th></tr></thead>
       <tbody>${rows
         .map(
           (row, i) => `<tr>
             <td>${i + 1}</td>
             <td><strong>${escapeHtml(row.name)}</strong></td>
             <td>${escapeHtml(row.alcohol)}</td>
             <td>${escapeHtml(row.soft_drink)}</td>
             <td class="muted">${new Date(row.created_at).toLocaleString('ru-RU')}</td>
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return res.status(500).send('Не удалось прочитать ответы. Проверьте Upstash Redis и переменные окружения.');
  }
}
