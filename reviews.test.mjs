import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleReviews } from './reviews-api.js';
import { localReviewStore } from './reviews-local.js';
import worker from './worker.js';
import { renderLandingPage } from './landing.js';

function fixture() {
  const rows = new Map();
  const store = {
    list: async (limit, offset) => [...rows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(offset, offset + limit),
    get: async id => rows.get(id),
    create: async row => { rows.set(row.id, row); },
    update: async row => { rows.set(row.id, row); }
  };
  const id = crypto.randomUUID();
  const token = 'a'.repeat(64);
  const request = (method = 'GET', body, suffix = '', secret = token, origin = 'https://bibledaily.site') => new Request('https://bibledaily.site/api/reviews' + suffix, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret, Origin: origin },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { rows, store, id, token, request };
}

test('anonymous reviews hide names and edit keys; only the owner can edit', async () => {
  const { rows, store, id, request } = fixture();
  const create = await handleReviews(request('POST', { id, anonymous: true, name: 'Hidden name', text: 'A thoughtful app.' }), store);
  assert.equal(create.status, 201);
  const posted = (await create.json()).review;
  assert.equal(posted.name, 'Anonymous');
  assert.equal(posted.editedAt, null);
  assert.equal(rows.get(id).name, '');
  assert.equal(rows.get(id).token_hash.length, 64);
  const other = await handleReviews(request('PUT', { anonymous: false, name: 'Impostor', text: 'Changed' }, '/' + id, 'b'.repeat(64)), store);
  assert.equal(other.status, 403);
  const originalDate = posted.createdAt;
  const edit = await handleReviews(request('PUT', { anonymous: false, name: 'Reader', text: 'Edited text \u4f60\u597d' }, '/' + id), store);
  assert.equal(edit.status, 200);
  const updated = (await edit.json()).review;
  assert.equal(updated.name, 'Reader');
  assert.equal(updated.createdAt, originalDate);
  assert.ok(updated.editedAt);
  assert.equal(updated.text, 'Edited text \u4f60\u597d');
  const list = await (await handleReviews(request(), store)).json();
  assert.equal(list.reviews.length, 1);
  assert.equal(JSON.stringify(list).includes('token_hash'), false);
  const repeat = await handleReviews(request('POST', { id, anonymous: true, text: 'Duplicate retry' }), store);
  assert.equal(repeat.status, 200);
  assert.equal(rows.size, 1);
  assert.equal(rows.get(id).text, 'Edited text \u4f60\u597d');
});

test('invalid requests and cross-origin writes are rejected', async () => {
  const { store, id, request } = fixture();
  for (const body of [{ id, anonymous: true, text: '' }, { id, anonymous: false, name: '', text: 'Hello' }, { id, anonymous: true, text: 'x'.repeat(2001) }]) {
    assert.equal((await handleReviews(request('POST', body), store)).status, 400);
  }
  assert.equal((await handleReviews(request('POST', { id, anonymous: true, text: 'Hello' }, '', 'a'.repeat(64), 'https://other.example'), store)).status, 403);
  assert.equal((await handleReviews(request('POST', { id, anonymous: true, text: 'Hello' }, '', ''), store)).status, 401);
  assert.equal((await handleReviews(request('PUT', { anonymous: true, text: 'Hello' }, '/' + id), store)).status, 404);
  assert.equal((await handleReviews(request(), null)).status, 503);
});

test('reviews paginate, survive a local server restart, and do not expose edit secrets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bibledaily-review-test-'));
  try {
    const local = localReviewStore(directory);
    const { id, request } = fixture();
    assert.equal((await handleReviews(request('POST', { id, anonymous: false, name: 'Test reader', text: 'Local review' }), local, 'local')).status, 201);
    const reopened = localReviewStore(directory);
    const response = await (await handleReviews(request(), reopened, 'local')).json();
    assert.equal(response.storage, 'local');
    assert.equal(response.reviews[0].name, 'Test reader');
    assert.equal(JSON.stringify(response).includes('token_hash'), false);
    assert.ok((await readFile(path.join(directory, 'reviews.json'), 'utf8')).includes('token_hash'));
  } finally {
    await unlink(path.join(directory, 'reviews.json'));
    await rmdir(directory);
  }
  const { rows, store, request } = fixture();
  for (let index = 0; index < 23; index++) rows.set(String(index), { id: String(index), anonymous: 1, name: '', text: 'Review ' + index, created_at: new Date(2026, 9, index + 1).toISOString() });
  const page1 = await (await handleReviews(request(), store)).json();
  const page2 = await (await handleReviews(request('GET', null, '?offset=20'), store)).json();
  assert.equal(page1.reviews.length, 20); assert.equal(page1.hasMore, true);
  assert.equal(page2.reviews.length, 3); assert.equal(page2.hasMore, false);
});

test('landing placement and Worker routing keep static assets and login separate', async () => {
  const html = renderLandingPage();
  assert.ok(html.indexOf('id="reader-reviews"') > html.indexOf('class="landing-support'));
  assert.ok(html.indexOf('id="reader-reviews"') < html.indexOf('<footer'));
  assert.ok(html.includes('name="anonymous" checked'));
  assert.ok(html.includes('name="name"'));
  assert.ok(html.includes('data-review-list'));
  const missing = await worker.fetch(new Request('https://bibledaily.site/api/reviews'), {});
  assert.equal(missing.status, 503);
  const auth = await worker.fetch(new Request('https://bibledaily.site/api/auth/session'), {});
  assert.equal((await auth.json()).configured, false);
  const asset = await worker.fetch(new Request('https://bibledaily.site/'), { ASSETS: { fetch: () => new Response('Static asset') } });
  assert.equal(await asset.text(), 'Static asset');
});
