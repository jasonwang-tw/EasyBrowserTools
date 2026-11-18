export function recoveryCandidates(data, width, height) {
  const candidates = [];
  let cursor = 0;
  for (const block of data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) for (const word of line.words || []) {
    const start = data.text.indexOf(word.text, cursor);
    if (start < 0) continue;
    cursor = start + word.text.length;
    const box = word.bbox;
    if (!box || !Number.isFinite(word.confidence) || word.confidence >= 75 || !/^[A-Za-z]{2,12}[:：,;!?]?$/u.test(word.text)) continue;
    const w = box.x1 - box.x0, h = box.y1 - box.y0;
    if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || box.x0 < 0 || box.y0 < 0 || box.x1 > width || box.y1 > height || h < 12 || w / h < 1.8 || w / h > 10) continue;
    candidates.push({ ...word, start, end: cursor });
  }
  return candidates;
}

// Require agreement between two independently rendered slant/scale variants.
// No dictionary substitution: only text actually recognized inside this box.
export function agreedCjkText(results, original) {
  if (results.length !== 2) return null;
  const values = results.map(result => result.text.trim().replace(/\s+/gu, '').replace(/[:：,;!?，；！？]+$/u, ''));
  if (values[0] !== values[1] || !/^\p{Script=Han}{2,8}$/u.test(values[0])) return null;
  const scores = results.map(result => result.confidence);
  if (!scores.every(Number.isFinite) || Math.min(...scores) < 70 || Math.max(...scores) < 80 || Math.max(...scores) < original.confidence + 15) return null;
  const ratio = (original.bbox.x1 - original.bbox.x0) / (original.bbox.y1 - original.bbox.y0);
  if (ratio < values[0].length * .65 || ratio > values[0].length * 1.8) return null;
  return values[0] + (original.text.match(/[:：,;!?]+$/u)?.[0] || '');
}

export async function recognizeWithCjkRecovery(worker, canvas, rectangle, { language, mode, recoverCjk = true, budget, withBlocks = false }) {
  const chinese = language?.split('+').find(code => ['chi_tra', 'chi_sim'].includes(code));
  const enabled = recoverCjk && chinese && budget.remaining > 0;
  const result = await worker.recognize(canvas, rectangle || {}, enabled || withBlocks ? { text: true, blocks: true } : { text: true });
  if (!enabled) return result;
  const candidates = recoveryCandidates(result.data, canvas.width, canvas.height).slice(0, budget.remaining);
  if (!candidates.length) return result;
  const repairs = [];
  try {
    // All models are already loaded by the original mixed-language worker.
    await worker.reinitialize(chinese, 1);
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    for (const word of candidates) {
      budget.remaining--;
      const left = Math.max(0, word.bbox.x0 - 3), top = Math.max(0, word.bbox.y0 - 3);
      const width = Math.min(canvas.width, word.bbox.x1 + 3) - left;
      const height = Math.min(canvas.height, word.bbox.y1 + 3) - top;
      const variants = [];
      for (const [shear, scale] of [[.2, 1], [.25, .75]]) {
        const crop = canvas.ownerDocument.createElement('canvas');
        crop.width = Math.max(200, Math.ceil((width + height * shear) * scale + 40));
        crop.height = Math.max(100, Math.ceil(height * scale + 40));
        try {
          const drawing = crop.getContext('2d');
          drawing.fillStyle = '#fff';
          drawing.fillRect(0, 0, crop.width, crop.height);
          drawing.setTransform(scale, 0, shear * scale, scale, 20, 20);
          drawing.drawImage(canvas, left, top, width, height, 0, 0, width, height);
          const { data } = await worker.recognize(crop);
          variants.push(data);
        } finally { crop.width = crop.height = 0; }
      }
      const text = agreedCjkText(variants, word);
      if (text) repairs.push({ start: word.start, end: word.end, text, bbox: word.bbox, confidence: Math.min(...variants.map(variant => variant.confidence)) });
    }
  } finally {
    await worker.reinitialize(language, 1);
    await worker.setParameters({ tessedit_pageseg_mode: mode });
  }
  let text = result.data.text;
  for (const repair of repairs.reverse()) text = text.slice(0, repair.start) + repair.text + text.slice(repair.end);
  return { ...result, data: { ...result.data, text }, recoveredWords: repairs.map(({ bbox, text, confidence }) => ({ bbox, text, confidence })) };
}
