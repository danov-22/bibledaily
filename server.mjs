import { handleReviews } from './reviews-api.js';
import { localReviewStore } from './reviews-local.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const allowed = new Set(['index.html', 'styles.css', 'app.js', 'data.js', 'landing.js', 'reviews.js', 'pdf-export.js', 'favicon.svg', 'kofi-logo.png', 'trakteer-logo.png', 'privacy.html', 'terms.html']);
const reviews = localReviewStore(path.join(root, '.local'));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/reviews' || url.pathname.startsWith('/api/reviews/')) {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        chunks.push(chunk); size += chunk.length;
        if (size > 16000) { res.writeHead(413); res.end('Review too long'); return; }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const request = new Request(new URL(req.url, 'http://' + req.headers.host), { method: req.method, headers: req.headers, ...(['POST', 'PUT'].includes(req.method) ? {body} : {}) });
      const response = await handleReviews(request, reviews, 'local');
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: 'Could not process review.'})); }
    return;
  }
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
