// Recognize labels embedded in illustrations without copying every glyph-like
// shape from the illustration. Agreement is by text AND location, not a denylist.
export function hasLargeGraphic(pixels, width, height) {
  if (width < 200 || height < 150) return false;
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 500));
  const w = Math.ceil(width / step), h = Math.ceil(height / step);
  const mask = new Uint8Array(w * h);
  let light = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.min(height - 1, y * step) * width + Math.min(width - 1, x * step)) * 4;
    const value = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (pixels[i + 3] < 128 || value > 200) light++;
    if (pixels[i + 3] >= 128 && value < 160) mask[y * w + x] = 1;
  }
  if (light / mask.length < .55) return false;
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 1, x0 = w, y0 = h, x1 = 0, y1 = 0;
    mask[start] = 0;
    queue[0] = start;
    while (head < tail) {
      const position = queue[head++], x = position % w, y = Math.floor(position / w);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++) for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
        const next = ny * w + nx;
        if (mask[next]) { mask[next] = 0; queue[tail++] = next; }
      }
    }
    if (x1 - x0 >= w * .12 && y1 - y0 >= h * .15 && tail >= mask.length * .015) return true;
  }
  return false;
}

export function diagramWords(result, scaleX = 1, scaleY = scaleX) {
  const words = [];
  for (const block of result.data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) for (const word of line.words || []) {
    const b = word.bbox;
    if (!b || ![b.x0, b.y0, b.x1, b.y1, word.confidence].every(Number.isFinite) || b.x1 <= b.x0 || b.y1 <= b.y0) continue;
    const repair = result.recoveredWords?.find(item => Object.keys(b).every(key => item.bbox[key] === b[key]));
    words.push({ text: (repair?.text || word.text).trim(), confidence: repair?.confidence ?? word.confidence,
      bbox: { x0: b.x0 / scaleX, x1: b.x1 / scaleX, y0: b.y0 / scaleY, y1: b.y1 / scaleY } });
  }
  return words;
}

function overlap(a, b) {
  const intersection = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0), areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  return intersection / (areaA + areaB - intersection);
}

export function stableDiagramWords(first, second) {
  const key = text => text.normalize('NFKC').toLowerCase();
  const used = new Set(), stable = [];
  for (const word of first) {
    if (word.confidence < 70 || word.bbox.y1 - word.bbox.y0 < 4) continue;
    const match = second.findIndex((other, index) => !used.has(index) && other.confidence >= 70 && Math.max(word.confidence, other.confidence) >= 80 && key(other.text) === key(word.text) && overlap(word.bbox, other.bbox) >= .5);
    if (match < 0) continue;
    used.add(match);
    stable.push({ ...word, confidence: Math.min(word.confidence, second[match].confidence) });
  }
  // Retain punctuation next to actual text, but not isolated drawing fragments.
  const textWords = stable.filter(word => /[\p{L}\p{N}]/u.test(word.text));
  return stable.filter(word => /[\p{L}\p{N}]/u.test(word.text) || textWords.some(other => {
    const h = Math.max(word.bbox.y1 - word.bbox.y0, other.bbox.y1 - other.bbox.y0);
    return Math.abs((word.bbox.y0 + word.bbox.y1 - other.bbox.y0 - other.bbox.y1) / 2) < h * .6
      && Math.min(Math.abs(word.bbox.x0 - other.bbox.x1), Math.abs(other.bbox.x0 - word.bbox.x1)) < h * .8;
  }));
}

export function formatDiagramWords(words) {
  const rows = [];
  for (const word of [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
    const center = (word.bbox.y0 + word.bbox.y1) / 2, height = word.bbox.y1 - word.bbox.y0;
    const row = rows.find(item => Math.abs(item.center - center) < Math.max(item.height, height) * .55);
    if (row) { row.words.push(word); row.height = Math.max(row.height, height); }
    else rows.push({ center, height, words: [word] });
  }
  const lines = [];
  let previous;
  for (const row of rows.sort((a, b) => a.center - b.center)) {
    if (previous && row.center - previous.center > Math.max(row.height, previous.height) * 2.5) lines.push('');
    const ordered = row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let text = '', last;
    for (const word of ordered) {
      if (last && word.bbox.x0 - last.bbox.x1 > row.height * 3) { lines.push(text); text = ''; }
      if (text) text += ' ';
      text += word.text;
      last = word;
    }
    if (text) lines.push(text);
    previous = row;
  }
  return lines.join('\n').trim();
}

export function mergeDiagramWords(groups) {
  const merged = [];
  for (const word of groups.flat().sort((a, b) => b.confidence - a.confidence)) {
    if (!merged.some(other => overlap(word.bbox, other.bbox) >= .5)) merged.push(word);
  }
  return merged;
}

export async function recognizeDiagram(canvas, recognize, { onSegment = () => {} } = {}) {
  const maxScale = Math.min(2, Math.sqrt(16_000_000 / (canvas.width * canvas.height)));
  // Always retain a native-size pass. Replacing it with two enlarged passes
  // loses small captions surrounded by icon outlines on some diagrams.
  const scales = [1, maxScale > 1.1 ? maxScale : .8];
  // Overlapping bands give small icon captions their own segmentation context.
  // Keep the full image too, so a band boundary cannot erase a line of text.
  const regions = [{ y: 0, height: canvas.height }];
  if (canvas.height >= 240) {
    const lower = Math.floor(canvas.height * .5);
    regions.push({ y: 0, height: Math.ceil(canvas.height * .6) }, { y: lower, height: canvas.height - lower });
  }
  const groups = [];
  let completed = 0;
  for (const region of regions) {
    const passes = [];
    for (const scale of scales) {
      onSegment(completed++, regions.length * scales.length);
      const target = canvas.ownerDocument.createElement('canvas');
      target.width = Math.max(1, Math.floor(canvas.width * scale));
      target.height = Math.max(1, Math.floor(region.height * scale));
      target.getContext('2d').drawImage(canvas, 0, region.y, canvas.width, region.height, 0, 0, target.width, target.height);
      try {
        const result = await recognize(target);
        const words = diagramWords(result, target.width / canvas.width, target.height / region.height)
          .filter(word => (region.y === 0 || word.bbox.y0 > 2)
            && (region.y + region.height === canvas.height || word.bbox.y1 < region.height - 2))
          .map(word => ({ ...word, bbox: { ...word.bbox, y0: word.bbox.y0 + region.y, y1: word.bbox.y1 + region.y } }));
        passes.push(words);
      } finally { target.width = target.height = 0; }
    }
    groups.push(stableDiagramWords(passes[0], passes[1]));
  }
  const stable = mergeDiagramWords(groups);
  const text = formatDiagramWords(stable);
  const confidence = stable.length ? stable.reduce((sum, word) => sum + word.confidence, 0) / stable.length : 0;
  return { data: { text, confidence }, needsReview: true, diagram: true, split: null };
}
