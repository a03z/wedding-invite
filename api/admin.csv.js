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

function csvCell(value) {
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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

  const csv = ['\uFEFFИмя;Алкоголь;Безалкогольный напиток;Когда']
    .concat(rows.map((r) => [r.name, r.alcohol, r.soft_drink, r.created_at].map(csvCell).join(';')))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wedding-rsvp.csv"');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(csv);
}
