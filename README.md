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
