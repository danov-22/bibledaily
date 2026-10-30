import { handleReviews, d1ReviewStore } from './reviews-api.js';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/reviews' || path.startsWith('/api/reviews/')) return handleReviews(request, d1ReviewStore(env.REVIEWS_DB));
    if (path === '/api/auth/session') return Response.json({ configured: false, authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
    if (path.startsWith('/api/')) return Response.json({ error: 'Not found.' }, { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
