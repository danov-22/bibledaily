import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'data.js', 'landing.js', 'reviews.js', 'pdf-export.js', 'favicon.svg', 'kofi-logo.png', 'trakteer-logo.png', 'privacy.html', 'terms.html']) await copyFile(file, 'dist/' + file);
console.log('Built BibleDaily in dist/');
