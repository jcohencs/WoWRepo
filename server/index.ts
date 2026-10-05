import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createApiHandler } from './handler.js';

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

function serveStatic(pathname: string, res: import('node:http').ServerResponse) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, safe);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  if (file.includes(`${join(dist, 'assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  void api(req, res, () => serveStatic(new URL(req.url ?? '/', 'http://x').pathname, res));
}).listen(port, () => {
  console.log(`Parsecheck on http://localhost:${port}`);
});
