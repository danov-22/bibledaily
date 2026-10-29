import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'data.js', 'landing.js', 'pdf-export.js', 'favicon.svg']) await copyFile(file, 'dist/' + file);
console.log('Built BibleDaily in dist/');
