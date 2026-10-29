// PDF pages embed browser-rendered images to preserve Unicode journal text.
export async function createReadingPdf(report) {
  await document.fonts?.ready;
  const width = 1240, height = 1754, margin = 86, bottom = height - margin;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF export needs canvas support in this browser.');
  const pages = [];
  let y;
  const font = (size = 24, weight = 400) => { context.font = weight + ' ' + size + 'px "DM Sans", sans-serif'; };
  const text = (value, x, at, size = 24, weight = 400, color = '#171816') => {
    font(size, weight); context.fillStyle = color; context.fillText(value, x, at);
  };
  function wrap(value, maxWidth, size = 24, weight = 400) {
    font(size, weight);
    const result = [];
    for (const paragraph of String(value).split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.match(/\S+\s*|\s+/gu) || ['']) {
        if (line && context.measureText(line + word).width > maxWidth) { result.push(line.trimEnd()); line = ''; }
        const segments = typeof Intl.Segmenter === 'function'
          ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word)].map(item => item.segment) : [...word];
        for (const char of segments) {
          if (line && context.measureText(line + char).width > maxWidth) { result.push(line); line = ''; }
          line += char;
        }
      }
      result.push(line.trimEnd());
    }
    return result;
  }
  function beginPage() {
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    y = margin;
    if (pages.length) {
      text('BibleDaily / Your reading notes', margin, y, 22, 600, '#686b66');
      y += 55;
    }
  }
  function finishPage() {
    text('BibleDaily | Page ' + (pages.length + 1), margin, height - 45, 20, 400, '#686b66');
    const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    pages.push(Uint8Array.from(atob(base64), char => char.charCodeAt(0)));
  }
  function nextPage() { finishPage(); beginPage(); }
  function fullText(value, size = 24, weight = 400, color = '#171816') {
    for (const line of wrap(value, width - margin * 2, size, weight)) {
      if (y > bottom) nextPage();
      text(line, margin, y, size, weight, color); y += Math.ceil(size * 1.5);
    }
  }
  beginPage();
  fullText('BibleDaily', 58, 700);
  y += 2;
  fullText('Your reading notes', 27, 500, '#a45f42');
  y += 12;
  fullText(report.subtitle, 24, 400, '#686b66');
  y += 22;
  fullText(report.plan, 32, 600);
  fullText('Old Testament: ' + report.otPlan, 24);
  fullText('New Testament: ' + report.ntPlan, 24);
  y += 20;
  const facts = [['ORIGINAL BEGIN', report.begin], ['ORIGINAL END', report.end],
    ['READING PROGRESS', report.progress], ['PARTIALLY READ', report.partial],
    ['ACTUAL READING DATES', report.actualRange], ['CURRENT PROJECTED END', report.adjustedEnd],
    ['EXPORTED', report.exported], ['TRANSLATION', report.translation]];
  for (let i = 0; i < facts.length; i += 2) {
    let rowHeight = 0;
    for (let column = 0; column < 2; column++) {
      const [label, value] = facts[i + column];
      const x = margin + column * 554;
      text(label, x, y, 19, 700, '#a45f42');
      const lines = wrap(value, 505, 25, 600);
      lines.forEach((line, index) => text(line, x, y + 34 + index * 34, 25, 600));
      rowHeight = Math.max(rowHeight, 70 + lines.length * 34);
    }
    y += rowHeight;
  }
  y += 10;
  fullText('Reading plan & daily notes', 32, 700);
  fullText('Submitted readings show the actual reading date. Original and updated dates appear below.', 22, 400, '#686b66');
  y += 15;
  for (let index = 0; index < report.days.length; index++) {
    const day = report.days[index];
    const hasNotes = day.notes.length > 0;
    const leftWidth = hasNotes ? 475 : width - margin * 2;
    const left = [day.status, ...day.schedule].flatMap(value => wrap(value, leftWidth));
    const right = day.notes.flatMap(note => [...wrap(note.label.toUpperCase(), 495, 21, 700), ...wrap(note.value, 495), '']);
    let offset = 0;
    const total = Math.max(left.length, right.length);
    // Keep short daily entries together, and continue long notes across pages.
    if (y + 110 + total * 35 > bottom && 110 + total * 35 < bottom - margin - 55) nextPage();
    do {
      if (y + 145 > bottom) nextPage();
      context.fillStyle = '#e6e7e3'; context.fillRect(margin, y - 15, width - margin * 2, 2);
      fullText(day.heading + (offset ? ' (continued)' : ''), 27, 700);
      text('SCHEDULE', margin, y, 19, 700, '#a45f42');
      if (hasNotes) text('NOTES', 650, y, 19, 700, '#a45f42');
      y += 36;
      const available = Math.max(1, Math.floor((bottom - y) / 35));
      const count = Math.min(available, total - offset);
      if (hasNotes) { context.fillStyle = '#e6e7e3'; context.fillRect(610, y - 24, 2, Math.max(35, count * 35)); }
      for (let row = 0; row < count; row++) {
        if (left[offset + row]) text(left[offset + row], margin, y);
        if (right[offset + row]) text(right[offset + row], 650, y);
        y += 35;
      }
      offset += count; y += 40;
      if (offset < total) nextPage();
    } while (offset < total);
    if (index % 12 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  finishPage();

  const encode = (text) => new TextEncoder().encode(text);
  const chunks = [];
  const offsets = [0];
  let length = 0;
  function append(data) {
    const bytes = typeof data === 'string' ? encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  }
  function object(id, content, stream) {
    offsets[id] = length;
    append(`${id} 0 obj\n${content}`);
    if (stream) { append('\nstream\n'); append(stream); append('\nendstream'); }
    append('\nendobj\n');
  }
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((jpeg, index) => {
    const id = 3 + index * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Image ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
    const commands = encode('q 595.28 0 0 841.89 0 0 cm /Image Do Q');
    object(id + 2, `<< /Length ${commands.length} >>`, commands);
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
