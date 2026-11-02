import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import rsvp from './api/rsvp.js';
import admin from './api/admin.js';
import adminCsv from './api/admin-csv.js';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.PORT) || 3000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

async function loadEnv() {
  try {
    const text = await readFile(new URL('./.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Локальный запуск без .env: страница открывается, сохранение ответов нет.
  }
}

function attachHelpers(req, res, rawBody) {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/json')) req.body = rawBody;
  else if (contentType.includes('application/x-www-form-urlencoded')) {
    req.body = Object.fromEntries(new URLSearchParams(rawBody));
  }

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.send = (body) => {
    if (res.writableEnded) return res;
    let payload = body;
    if (Buffer.isBuffer(payload)) {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/octet-stream');
    } else if (payload !== null && typeof payload === 'object') {
      payload = JSON.stringify(payload);
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } else {
      payload = payload == null ? '' : String(payload);
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.end(payload);
    return res;
  };
  res.json = (value) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(value));
  };
}

async function serveStatic(res, pathname) {
  const relative = (pathname === '/' ? 'index.html' : pathname.slice(1)).replaceAll('\\', '/');
  const filePath = normalize(join(publicRoot, relative));
  if (!filePath.startsWith(normalize(publicRoot))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.setHeader('Content-Type', types[extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

await loadEnv();

const routes = new Map([
  ['/api/rsvp', rsvp],
  ['/admin', admin],
  ['/api/admin', admin],
  ['/admin.csv', adminCsv],
  ['/api/admin-csv', adminCsv],
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const handler = routes.get(pathname);

    if (handler) {
      attachHelpers(req, res, rawBody);
      await handler(req, res);
      if (!res.writableEnded) res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }

    await serveStatic(res, pathname);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Server error');
    }
  }
});

server.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
