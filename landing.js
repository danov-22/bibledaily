export function renderLandingPage({ loginAvailable = false, loginMessage = '' } = {}) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return `<div class="shell">
    <header class="topbar" >
      <a class="brand" href="./"><span class="brand-mark">B</span><span><span class="brand-name">BibleDaily</span><span class="brand-note">Reading the Word with a schedule</span></span></a>
      <button class="theme-toggle" data-action="toggle-theme" type="button">Warm mode</button>
    </header>
    <section class="page" style="padding-top:46px">
      <div class="page-head"><div><div class="eyebrow">Plan. Read. Repeat.</div><h1>A portion of<br>the Word,<br>every day.</h1><p class="lede">Build a steady reading rhythm with daily Bible portions, thoughtful reflections, and a clear view of your progress.</p></div></div>
      <div class="today-grid">
        <article class="reading-card"><div class="reading-label">Your reading planner</div><h2 class="reading-title">Nourishment for<br>the spirit and soul.</h2><p class="lede">Choose a reading plan, keep a verse close, and make room to reflect.</p><div class="button-row" style="margin-top:28px"><button class="btn google-sign-in" type="button" data-action="google-sign-in" aria-describedby="login-status" ${loginAvailable ? '' : 'disabled'}>Sign in with Google</button><a class="btn secondary" style="display:inline-flex;align-items:center" href="?demo=1#today">Explore the demo</a></div><p class="small-note" id="login-status" role="status" style="margin-top:18px">${escape(loginMessage || 'Google sign-in is not available yet. You can explore the demo without an account.')}</p><p class="small-note">By signing in or registering, you agree to the <a class="legal-link" href="/terms">Terms of Service</a>. See the <a class="legal-link" href="/privacy">Privacy Policy</a> for how your information is handled.</p></article>
        <aside class="panel quote-panel"><div class="quote-mark">&ldquo;</div><p class="quote-copy">Your word is a lamp to my feet, and a light for my path.</p><span class="quote-caption">Psalm 119:105 &middot; WEB</span></aside>
      </div>
    </section>
    <section class="landing-support panel" aria-labelledby="support-title">
      <div class="support-copy"><div class="eyebrow">A little support goes a long way</div><h2 id="support-title">Support BibleDaily<br>and future projects.</h2><p>If this reading planner has been helpful, you can support its maintenance and development and future projects to come. Every contribution is much appreciated.</p></div>
      <div class="support-options"><a class="support-option" href="https://ko-fi.com/danovski_" target="_blank" rel="noopener noreferrer"><span class="support-logo support-logo-kofi" aria-hidden="true"></span><span class="support-platform">Ko-fi <span aria-hidden="true">&nearr;</span></span><span>Support on Ko-fi</span><span class="sr-only"> (opens in a new tab)</span></a><a class="support-option" href="https://teer.id/danovski_" target="_blank" rel="noopener noreferrer"><span class="support-logo support-logo-trakteer" aria-hidden="true"></span><span class="support-platform">Trakteer <span aria-hidden="true">&nearr;</span></span><span>Support on Trakteer</span><span class="sr-only"> (opens in a new tab)</span></a></div>
    </section>
    <section class="landing-reviews panel" id="reader-reviews" aria-labelledby="reviews-title">
      <div class="eyebrow">A word from you</div><h2 id="reviews-title">Leave a review.</h2><p class="review-intro">How has BibleDaily been part of your reading rhythm? Share your thoughts, suggestions, or a little encouragement.</p>
      <div class="reviews-layout"><form class="review-form">
        <label class="review-anonymous"><input type="checkbox" name="anonymous" checked> Post anonymously</label>
        <div class="field" data-review-name-field hidden><label for="review-name">Your display name</label><input id="review-name" name="name" maxlength="60" placeholder="Choose a name" autocomplete="nickname" disabled></div>
        <div class="field"><label for="review-text">Your review</label><textarea id="review-text" name="text" required maxlength="2000" rows="5" placeholder="Share what you think?" aria-describedby="review-public-note review-identity"></textarea><span class="small-note">Up to 2,000 characters.</span></div>
        <p class="small-note" id="review-public-note">Your review and chosen name will be public. Please keep personal or sensitive information out of your review. <a class="legal-link" href="/privacy">Privacy Policy</a></p>
        <p class="small-note" id="review-identity" data-review-identity>You can edit your review from this browser after posting it.</p>
        <div class="button-row"><button class="btn" type="submit" disabled>Post review</button><button class="btn text" type="button" data-review-cancel hidden>Cancel edit</button></div>
        <p class="saved-status" data-review-status role="status" aria-live="polite">Loading reviews?</p>
      </form><div class="reviews-feed"><h3>Reader reviews</h3><div data-review-list aria-live="polite"></div><button class="btn secondary" type="button" data-review-more hidden>Load more reviews</button></div></div>
    </section>
    <footer class="landing-footer"><p>Nourishing the spirit as much as we care for the soul.</p><nav aria-label="Legal"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav></footer>
  </div>`;
}
