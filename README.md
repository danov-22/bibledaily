# BibleDaily

A static Bible reading companion with daily portions, reading plans, translation links, and a progress journal. The light theme uses the original white, charcoal, and terracotta palette; the optional warm theme uses cream and soft brown tones.

## Run locally

Install Node.js 20 or newer, then run from this folder:

```sh
node server.mjs
```

Open http://localhost:3000 and choose **Explore the demo**. The four app views are Today, Translations, Progress & Journal, and Reading Plan. Demo edits persist in this browser's local storage and use sample progress. Clearing browser data removes those edits.

No package installation is needed. You can also use `npm run dev` (`npm.cmd run dev` in Windows PowerShell when script execution is restricted). Set the PORT environment variable to change the default port.

## Check and build

```sh
npm.cmd run check
npm.cmd run build
```

The build copies the app's files into `dist/`. Any static host can serve that folder. Google Fonts requires an internet connection; the app falls back to system sans-serif fonts.

## Google accounts and Sheets

This export does **not** contain the original Cloudflare Functions, D1 migrations, or Google OAuth backend. Google sign-in and Sheets synchronization are unavailable. The local server reports sign-in as unconfigured, and the demo works independently. To enable accounts, restore and configure the original backend before exposing sign-in. Static hosting alone does not provide account synchronization.

## Source files

- `index.html`: app shell and navigation
- `styles.css`: active app and theme styles
- `app.js`: reading plans, journal, demo persistence, and account integration hooks
- `data.js`: Bible metadata and reading schedules
- `landing.js`: signed-out entry page reconstructed for this export
- `server.mjs`: dependency-free local server
- `build.mjs`: static build

The exported `index.css` and `landing.css` are retained for reference; this app does not load them.

## PDF reading record

On Progress & Journal, use **Download reading record (PDF)** below the progress bar. The PDF includes the selected plan, begin and scheduled end dates, every scheduled reading with its completion status, and saved mood, verse, reflection, and prayer, with notes in a separate right-hand column. The filename includes both plan dates. Export runs locally without uploading journal data. PDF pages are rendered images, so text is not selectable.

Notes can be added or edited in Progress & Journal: expand a book and chapter, then choose **Add notes** or **Edit notes** for a day. Save updates the same daily entry used by Today and the PDF.

## Reading at your own pace

Today opens the first unfinished daily portion. Missing days does not skip portions or create a catch-up requirement. **Complete reading** records the date you submit and moves the remaining dates forward. Saving notes alone does not mark a reading complete. PDF records show original begin/end dates, actual submitted reading dates, and the current projected end. Editing notes preserves the original reading-completion date. Legacy entries without completion timestamps are labeled as having no recorded submission date.

## Production domain

The primary URL is https://bibledaily.site/. The Worker configuration in `wrangler.jsonc` attaches `bibledaily.site` as a Custom Domain on the next deployment. The domain must be an active Cloudflare zone in the same account as the Worker.

Build with `npm.cmd run build` and deploy through the existing Cloudflare pipeline, or run `npx.cmd wrangler deploy` from an authenticated terminal. Alternatively, add `bibledaily.site` in the Worker's Domains settings. Cloudflare manages the domain's Worker DNS record and certificate.

For the future Google sign-in backend, use `https://bibledaily.site` as APP_BASE_URL and register `https://bibledaily.site/api/auth/google/callback` as the Google authorized redirect URI. The backend is still missing from this export.

## Public policy pages and sign-in button

After deployment, Google Auth Platform branding can use:

- Home: https://bibledaily.site/
- Privacy policy: https://bibledaily.site/privacy
- Terms of service: https://bibledaily.site/terms

These pages are public static files and describe the current browser-local demo. The public support and privacy contact is dany10martin@gmail.com. Before enabling accounts, confirm the operator identity and update the policy with the actual account/Sheets data processing, retention and deletion process. The landing page's Google sign-in/register button is disabled until the session API reports configured: true, then uses the existing /api/auth/google/start action. The backend is not included.

Support-card logo assets are hosted locally: Ko-fi cup from https://storage.ko-fi.com/cdn/cup-border.png and Trakteer cup from https://cdn.trakteer.id/images/embed/trbtn-icon.png. CSS masks display them as subtle theme-colored silhouettes without adding external image requests.

## Reader reviews

The landing page includes public reviews below Support. Reviewers can choose Anonymous or a custom display name, then edit their review from the same browser. Edit keys stay in browser storage; only hashes are stored on the server. Edited reviews display their last edited date. The review API is independent of the unfinished Google login backend.

Local preview uses a persistent, ignored file at .local/reviews.json. Production uses Cloudflare D1 through the REVIEWS_DB binding. If the binding or schema is missing, the site continues to serve normally and explains that reviews are unavailable.

To enable reviews on Cloudflare:

1. Run `npx.cmd wrangler d1 create bibledaily-reviews` in an authenticated terminal, or create a D1 database in Cloudflare.
2. Add the returned database ID to `wrangler.jsonc` under a top-level `d1_databases` array (preserve the other settings):

```json
"d1_databases": [
  {
    "binding": "REVIEWS_DB",
    "database_name": "bibledaily-reviews",
    "database_id": "YOUR_RETURNED_DATABASE_ID"
  }
]
```

3. Run `npx.cmd wrangler d1 execute bibledaily-reviews --remote --file=reviews-schema.sql`.
4. Run `npm.cmd run build`, then deploy the repository using its existing Cloudflare pipeline or `npx.cmd wrangler deploy`. The Worker entrypoint is worker.js, with the ASSETS binding for static files. Deploying only dist/ to a static host will not provide the review API.

The schema command creates the review table and index without removing existing data. Public reviews are independent of journal data and reading PDFs. Contact requests for review removal go to dany10martin@gmail.com.
