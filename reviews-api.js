const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const publicReview = ({ id, name, anonymous, text, created_at, edited_at }) => ({
  id, name: anonymous ? 'Anonymous' : name, anonymous: Boolean(anonymous), text,
  createdAt: created_at, editedAt: edited_at || null
});
const digest = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, '0')).join('');

export async function handleReviews(request, store, storage = 'public') {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/reviews(?:\/([a-f0-9-]{36}))?\/?$/);
  if (!match) return json({ error: 'Not found.' }, 404);
  if (!store) return json({ error: 'Reviews are not available yet. Please try again later.' }, 503);
  try {
    const id = match[1];
    if (request.method === 'GET') {
      if (id) {
        const review = await store.get(id);
        return review ? json({ review: publicReview(review), storage }) : json({ error: 'Review not found.' }, 404);
      }
      const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
      const reviews = await store.list(21, Math.floor(offset));
      return json({ reviews: reviews.slice(0, 20).map(publicReview), hasMore: reviews.length > 20, storage });
    }
    if (!['POST', 'PUT'].includes(request.method) || (request.method === 'PUT' && !id)) return json({ error: 'Method not allowed.' }, 405);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Please submit from BibleDaily.' }, 403);
    if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Expected JSON.' }, 415);
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Your edit key is missing. Use the browser where you posted this review.' }, 401);
    const reader = request.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16000) { await reader.cancel(); return json({ error: 'Your review is too long.' }, 413); }
        chunks.push(value);
      }
    }
    const raw = await new Response(new Blob(chunks)).text();
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid review.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid review.' }, 400);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const anonymous = body.anonymous === true;
    const name = anonymous ? '' : typeof body.name === 'string' ? body.name.trim() : '';
    if (!text || text.length > 2000 || (!anonymous && (!name || name.length > 60))) return json({ error: 'Write a review of 1–2,000 characters and choose Anonymous or a name of up to 60 characters.' }, 400);
    const reviewId = id || body.id;
    if (!/^[a-f0-9-]{36}$/.test(reviewId || '')) return json({ error: 'Invalid review ID.' }, 400);
    const tokenHash = await digest(token);
    const existing = await store.get(reviewId);
    if (existing && existing.token_hash !== tokenHash) return json({ error: 'Only the original reviewer can edit this review.' }, 403);
    if (request.method === 'PUT' && !existing) return json({ error: 'Review not found.' }, 404);
    // A repeated POST returns the original result, avoiding duplicates after a lost response.
    if (request.method === 'POST' && existing) return json({ review: publicReview(existing), storage });
    const now = new Date().toISOString();
    const review = { id: reviewId, name, anonymous: anonymous ? 1 : 0, text, token_hash: tokenHash, created_at: existing?.created_at || now, edited_at: existing ? now : null };
    if (existing) await store.update(review);
    else await store.create(review);
    return json({ review: publicReview(review), storage }, existing ? 200 : 201);
  } catch {
    return json({ error: 'Reviews could not be saved or loaded. Please try again.' }, 503);
  }
}

export function d1ReviewStore(db) {
  if (!db) return null;
  return {
    list: async (limit, offset) => (await db.prepare('SELECT id, name, anonymous, text, created_at, edited_at FROM reviews ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?').bind(limit, offset).all()).results,
    get: id => db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first(),
    create: review => db.prepare('INSERT INTO reviews (id, name, anonymous, text, token_hash, created_at, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(review.id, review.name, review.anonymous, review.text, review.token_hash, review.created_at, review.edited_at).run(),
    update: review => db.prepare('UPDATE reviews SET name = ?, anonymous = ?, text = ?, edited_at = ? WHERE id = ?').bind(review.name, review.anonymous, review.text, review.edited_at, review.id).run()
  };
}
