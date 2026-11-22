// Tiny static file server for hosting on Railway (or anywhere that runs Node).
// No dependencies. Serves only the app's own files, from memory, with ETags,
// gzip and sensible security headers. Listens on $PORT (Railway sets it).
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// Only these files/folders are public; everything else (tests, .git, README…) is not.
const PUBLIC = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.webmanifest', '.svg']);

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

function walk(path, out = []) {
  if (statSync(path).isDirectory()) for (const f of readdirSync(path)) walk(join(path, f), out);
  else out.push(path);
  return out;
}

// Load everything once at startup: the app is ~100 KB, and a deploy restarts the server.
const files = new Map();
for (const entry of PUBLIC) {
  for (const abs of walk(join(ROOT, entry))) {
    const ext = extname(abs);
    if (!TYPES[ext]) continue;
    const body = readFileSync(abs);
    const url = '/' + relative(ROOT, abs).split(sep).join('/');
    files.set(url, {
      body,
      gz: COMPRESSIBLE.has(ext) ? gzipSync(body, { level: 9 }) : null,
      type: TYPES[ext],
      etag: '"' + createHash('sha1').update(body).digest('base64url').slice(0, 16) + '"',
    });
  }
}
files.set('/', files.get('/index.html'));

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok');
    return;
  }
  const file = files.get(path);
  if (!file) {
    res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const headers = {
    ...HEADERS,
    'Content-Type': file.type,
    ETag: file.etag,
    // File names aren't hashed, so always revalidate (cheap 304s); the service worker handles offline.
    'Cache-Control': 'no-cache',
    Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304, headers).end();
    return;
  }
  const gzip = file.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzip ? file.gz : file.body;
  if (gzip) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, () => console.log(`Guitarmageddon serving ${files.size - 1} files on port ${PORT}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
