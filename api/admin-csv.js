import { listRsvps, requireAdmin } from '../lib/guests.js';

function csvCell(value) {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const rows = await listRsvps();
    const csv = ['\uFEFFИмя;Алкоголь;Безалкогольный напиток;Когда']
      .concat(rows.map((row) => [row.name, row.alcohol, row.soft_drink, row.created_at].map(csvCell).join(';')))
      .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wedding-rsvp.csv"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(csv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return res.status(500).send('Не удалось выгрузить ответы. Проверьте Upstash Redis и переменные окружения.');
  }
}
