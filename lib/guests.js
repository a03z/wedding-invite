import { Redis } from '@upstash/redis';

let redis;

export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('Не заданы UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN');
  }
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

export function readJsonBody(req) {
  const body = req.body;
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8') || '{}');
  if (typeof body === 'string') return body ? JSON.parse(body) : {};
  if (body && typeof body === 'object') return body;
  return {};
}

export function authorized(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return { ok: false, configured: false };

  const headerValue = req.headers.authorization;
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue || '';
  if (!header.startsWith('Basic ')) return { ok: false, configured: true };

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return { ok: false, configured: true };
    const ok = decoded.slice(0, sep) === 'admin' && decoded.slice(sep + 1) === password;
    return { ok, configured: true };
  } catch {
    return { ok: false, configured: true };
  }
}

export function requireAdmin(req, res) {
  const auth = authorized(req);
  if (!auth.configured) {
    res.status(500).send('Не задан ADMIN_PASSWORD');
    return false;
  }
  if (!auth.ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="wedding", charset="UTF-8"');
    res.status(401).send('Нужен пароль');
    return false;
  }
  return true;
}

function parseRecord(value) {
  try {
    const record = typeof value === 'string' ? JSON.parse(value) : value;
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    return record;
  } catch {
    return null;
  }
}

export async function saveRsvp(record) {
  const client = getRedis();
  await client.set(`rsvp:${record.guest_id}:${record.name}`, record);
}

export async function listRsvps() {
  const client = getRedis();
  const found = await client.keys('rsvp:*');
  const keys = Array.isArray(found) ? found : [];
  const rows = [];

  for (let i = 0; i < keys.length; i += 100) {
    const values = await client.mget(...keys.slice(i, i + 100));
    for (const value of values || []) {
      const record = parseRecord(value);
      if (record) rows.push(record);
    }
  }

  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows;
}
