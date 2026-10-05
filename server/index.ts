import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { loadWclEnv } from './env.js';
import { createApiHandler } from './handler.js';

loadWclEnv();

const dist = resolve(import.meta.dirname, '../dist');
const port = Number(process.env.PORT ?? 8787);
const api = createApiHandler();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Sensible defaults for a public site: only our own scripts, fonts from Google, icons from Warcraft Logs. */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: https://assets.rpglogs.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function serveStatic(pathname: string, res: import('node:http').ServerResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, safe);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  if (file.includes(`${join(dist, 'assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  void api(req, res, () => serveStatic(new URL(req.url ?? '/', 'http://x').pathname, res));
}).listen(port, () => {
  console.log(`Parsecheck listening on port ${port}`);
});
