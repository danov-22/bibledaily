const KEY = 'bibledaily-review-edit-v1';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dateLabel = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export async function mountReviews(root) {
  if (!root) return;
  const form = root.querySelector('form');
  const status = root.querySelector('[data-review-status]');
  const list = root.querySelector('[data-review-list]');
  const submit = form.querySelector('[type="submit"]');
  const cancel = form.querySelector('[data-review-cancel]');
  const loadMore = root.querySelector('[data-review-more]');
  const identityNote = root.querySelector('[data-review-identity]');
  let credentials = null, reviews = [], offset = 0, editing = false, available = false;
  try {
    credentials = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!/^[a-f0-9-]{36}$/.test(credentials?.id || '') || !/^[a-f0-9]{64}$/.test(credentials?.token || '')) credentials = null;
    // Editing depends on keeping a private key in this browser.
    const testKey = KEY + '-check'; localStorage.setItem(testKey, '1'); localStorage.removeItem(testKey);
  } catch {
    status.textContent = 'Enable browser storage to post a review and keep your edit access.';
    return;
  }
  const request = async (path = '', options = {}) => {
    const response = await fetch('/api/reviews' + path, { cache: 'no-store', ...options });
    let data;
    try { data = await response.json(); } catch { throw Error('Reviews are not available yet. Please try again later.'); }
    if (!response.ok) throw Error(data.error || 'Could not load reviews.');
    return data;
  };
  const updateName = () => {
    const anonymous = form.elements.namedItem('anonymous').checked;
    const name = form.elements.namedItem('name');
    name.disabled = anonymous; name.required = !anonymous;
    root.querySelector('[data-review-name-field]').hidden = anonymous;
  };
  const renderList = () => {
    list.innerHTML = reviews.length ? reviews.map(review => `<article class="reader-review"><div class="review-byline"><strong>${escape(review.name)}</strong><time datetime="${escape(review.createdAt)}">${escape(dateLabel(review.createdAt))}</time></div><p class="review-text">${escape(review.text)}</p><div class="review-meta">${review.editedAt ? `<span>Last edited <time datetime="${escape(review.editedAt)}">${escape(dateLabel(review.editedAt))}</time></span>` : ''}${credentials?.id === review.id ? `<button class="btn text" type="button" data-review-edit="${escape(review.id)}">Edit your review</button>` : ''}</div></article>`).join('') : '<p class="small-note">No reviews yet. Share the first one.</p>';
  };
  const startEditing = review => {
    editing = true;
    form.elements.namedItem('anonymous').checked = review.anonymous;
    form.elements.namedItem('name').value = review.anonymous ? '' : review.name;
    form.elements.namedItem('text').value = review.text;
    submit.textContent = 'Save changes'; cancel.hidden = false; updateName();
    status.textContent = 'Editing your review. Changes will be marked with the last edited date.';
  };
  const reset = () => {
    editing = false; form.reset(); updateName(); cancel.hidden = true; submit.textContent = 'Post review';
  };
  const refresh = async (append = false) => {
    const data = await request('?offset=' + (append ? offset : 0));
    if (!root.isConnected) return;
    if (!append) { reviews = []; offset = 0; }
    offset += data.reviews.length;
    reviews = [...new Map([...reviews, ...data.reviews].map(review => [review.id, review])).values()];
    if (!append && credentials && !reviews.some(review => review.id === credentials.id)) {
      try { const own = await request('/' + credentials.id); reviews.unshift(own.review); } catch { /* It may be a key saved before a failed first submission. */ }
    }
    loadMore.hidden = !data.hasMore;
    identityNote.textContent = data.storage === 'local'
      ? 'Local preview: reviews stay on this computer. Keep this browser’s site data to edit your review.'
      : 'Reviews are public. Your edit key stays in this browser; keep its site data to edit later.';
    available = true; submit.disabled = false; renderList();
  };
  form.addEventListener('change', updateName);
  cancel.addEventListener('click', () => { reset(); status.textContent = 'Changes cancelled.'; });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-review-edit]');
    if (!button) return;
    const review = reviews.find(item => item.id === button.dataset.reviewEdit);
    if (review && credentials?.id === review.id) { startEditing(review); form.elements.namedItem('text').focus(); }
  });
  loadMore.addEventListener('click', async () => {
    loadMore.disabled = true;
    try { await refresh(true); } catch (error) { status.textContent = error.message; }
    finally { loadMore.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!available || submit.disabled) return;
    // One review per browser; later submissions edit the original rather than duplicate it.
    const own = reviews.find(review => review.id === credentials?.id);
    if (!editing && own) editing = true;
    submit.disabled = true; cancel.disabled = true;
    status.textContent = editing ? 'Saving changes…' : 'Posting your review…';
    try {
      if (!credentials) {
        const nextCredentials = { id: crypto.randomUUID(), token: Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('') };
        localStorage.setItem(KEY, JSON.stringify(nextCredentials));
        credentials = nextCredentials;
      }
      const data = await request(editing ? '/' + credentials.id : '', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credentials.token },
        body: JSON.stringify({ id: credentials.id, anonymous: form.elements.namedItem('anonymous').checked, name: form.elements.namedItem('name').value, text: form.elements.namedItem('text').value })
      });
      reviews = [data.review, ...reviews.filter(review => review.id !== data.review.id)];
      const wasEditing = editing;
      reset(); renderList();
      status.textContent = wasEditing ? 'Review updated. The last edited date is shown below.' : 'Thank you for sharing your review. You can edit it below.';
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = !available; cancel.disabled = false; }
  });
  updateName();
  try { await refresh(); status.textContent = ''; }
  catch (error) { status.textContent = error.message; list.textContent = 'Reader reviews will appear here when available.'; }
}
