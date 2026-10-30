import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export function localReviewStore(directory) {
  const file = path.join(directory, 'reviews.json');
  let pending = Promise.resolve();
  const read = async () => {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  const mutate = (callback) => {
    const task = pending.then(async () => {
      const rows = await read();
      callback(rows);
      await mkdir(directory, { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(rows));
      await rename(file + '.tmp', file);
    });
    pending = task.catch(() => {});
    return task;
  };
  return {
    list: async (limit, offset) => { await pending; return (await read()).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(offset, offset + limit); },
    get: async id => { await pending; return (await read()).find(row => row.id === id); },
    create: review => mutate(rows => { if (rows.some(row => row.id === review.id)) throw Error('Duplicate review'); rows.push(review); }),
    update: review => mutate(rows => { const index = rows.findIndex(row => row.id === review.id); if (index < 0) throw Error('Missing review'); rows[index] = review; })
  };
}
