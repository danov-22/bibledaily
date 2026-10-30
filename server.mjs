import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const allowed = new Set(['index.html', 'styles.css', 'app.js', 'data.js', 'landing.js', 'pdf-export.js', 'favicon.svg', 'privacy.html', 'terms.html']);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/auth/session') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ configured: false, authenticated: false }));
  }
  const file = url.pathname === '/' ? 'index.html' : ({ '/privacy': 'privacy.html', '/terms': 'terms.html' }[url.pathname] || url.pathname.slice(1));
  if (!allowed.has(file)) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await readFile(path.join(root, file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  console.log('BibleDaily: http://localhost:' + server.address().port);
});
