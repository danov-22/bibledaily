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
        <article class="reading-card"><div class="reading-label">Your reading planner</div><h2 class="reading-title">Nourishment for<br>the spirit and soul.</h2><p class="lede">Choose a reading plan, keep a verse close, and make room to reflect.</p><div class="button-row" style="margin-top:28px"><button class="btn google-sign-in" type="button" data-action="google-sign-in" aria-describedby="login-status" ${loginAvailable ? '' : 'disabled'}>Sign in or register with Google</button><a class="btn secondary" style="display:inline-flex;align-items:center" href="?demo=1#today">Explore the demo</a></div><p class="small-note" id="login-status" role="status" style="margin-top:18px">${escape(loginMessage || 'Google sign-in is not available yet. You can explore the demo without an account.')}</p><p class="small-note">By signing in or registering, you agree to the <a class="legal-link" href="/terms">Terms of Service</a>. See the <a class="legal-link" href="/privacy">Privacy Policy</a> for how your information is handled.</p></article>
        <aside class="panel quote-panel"><div class="quote-mark">&ldquo;</div><p class="quote-copy">Your word is a lamp to my feet, and a light for my path.</p><span class="quote-caption">Psalm 119:105 &middot; WEB</span></aside>
      </div>
    </section>
    <footer class="landing-footer"><p>Nourishing the spirit as much as we care for the soul.</p><nav aria-label="Legal"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav></footer>
  </div>`;
}
