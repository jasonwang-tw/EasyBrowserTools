import { recognizeWithCjkRecovery } from './cjk-recovery.js';

const PAGE_MODES = { auto: '3', document: '6', scattered: '11', columns: '3' };

export function pageSegmentationMode(layout = 'auto') {
  if (!Object.hasOwn(PAGE_MODES, layout)) throw new Error('不支援的辨識版面');
  return PAGE_MODES[layout];
}

// Work on a copy of the OCR canvas pixels, never on the screenshot/annotations.
// A predominantly dark image benefits from light-background grayscale input.
export function prepareOcrPixels(pixels, background = 'auto') {
  if (!['auto', 'original', 'dark'].includes(background)) throw new Error('不支援的圖片底色');
  const luminance = i => Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2]);
  let dark = 0;
  let samples = 0;
  let light = 0;
  let colored = 0;
  const step = Math.max(1, Math.ceil(pixels.length / 4 / 4096)) * 4;
  for (let i = 0; i < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue;
    samples++;
    if (luminance(i) < 110) dark++;
    if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 200) light++;
    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) colored++;
  }
  const inverted = background === 'dark' || (background === 'auto' && samples > 0 && dark / samples > .6);
  // Minimum-channel grayscale preserves orange/blue text which luminance-based
  // binarization can discard. Limit it to predominantly light neutral pages.
  const colorEnhanced = background === 'auto' && !inverted && samples > 0 && light / samples > .5 && colored > 0;
  if (!inverted && !colorEnhanced) return { pixels, inverted: false, colorEnhanced: false };
  const prepared = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    const gray = inverted ? 255 - luminance(i) : Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    const value = Math.round(gray * alpha + 255 * (1 - alpha));
    prepared[i] = prepared[i + 1] = prepared[i + 2] = value;
    prepared[i + 3] = 255;
  }
  return { pixels: prepared, inverted, colorEnhanced };
}

const isInk = (pixels, i) => pixels[i + 3] >= 128 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 160;

// Only split at a wide, full-height light gutter near the middle. Never split
// solely because OCR found words on the same baseline in different columns.
export function detectColumnSplit(pixels, width, height) {
  if (width < 200 || height < 120) return null;
  let start = null;
  let best = null;
  const from = Math.floor(width * .3), to = Math.ceil(width * .7);
  for (let x = from; x <= to; x++) {
    let darkRows = 0;
    if (x < to) for (let y = 0; y < height; y++) if (isInk(pixels, (y * width + x) * 4)) darkRows++;
    const clear = x < to && darkRows / height < .01;
    if (clear && start == null) start = x;
    if (!clear && start != null) {
      const split = Math.floor((start + x) / 2);
      if (x - start >= width * .08 && split >= width * .4 && split <= width * .6
        && (!best || x - start > best.gap)) best = { split, gap: x - start };
      start = null;
    }
  }
  if (!best) return null;
  let left = 0, right = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    if (isInk(pixels, (y * width + x) * 4)) {
      if (x < best.split) left++; else right++;
    }
  }
  return Math.min(left, right) > width * height / 4 * .015 ? best.split : null;
}

// Extract short text bands around large illustrations. Tall connected bands
// belong to photos/diagrams and are not treated as individual text lines.
export function findTextLines(pixels, width, height, left, right) {
  const lines = [];
  let start = null, last = -1;
  const finish = () => {
    if (start == null) return;
    if (last - start + 1 >= 4 && last - start + 1 <= Math.min(64, height * .15)) {
      let x1 = right, x2 = left;
      for (let y = start; y <= last; y++) for (let x = left; x < right; x++) {
        if (isInk(pixels, (y * width + x) * 4)) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
      }
      if (x2 - x1 >= 12) lines.push({ x: x1, y: Math.max(0, start - 1), width: x2 - x1 + 1, height: Math.min(height, last + 2) - Math.max(0, start - 1) });
    }
    start = null;
  };
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = left; x < right; x++) if (isInk(pixels, (y * width + x) * 4)) ink++;
    if (ink >= Math.max(3, (right - left) * .015)) {
      if (start == null) start = y;
      last = y;
    } else if (start != null && y - last > 2) finish();
  }
  finish();
  return lines;
}

function enlargeCanvas(canvas, upscale) {
  const scale = upscale ? Math.min(2, Math.sqrt(16_000_000 / (canvas.width * canvas.height))) : 1;
  if (scale <= 1) return canvas;
  const enlarged = canvas.ownerDocument.createElement('canvas');
  enlarged.width = Math.round(canvas.width * scale);
  enlarged.height = Math.round(canvas.height * scale);
  enlarged.getContext('2d').drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
  return enlarged;
}

export async function recognizeCanvas(worker, canvas, { layout = 'auto', background = 'auto', upscale = false, language, recoverCjk = true, onSegment = () => {} } = {}) {
  const budget = { remaining: 4 };
  const recognize = (target, rectangle, mode) => recognizeWithCjkRecovery(worker, target, rectangle, { language, mode, recoverCjk, budget });
  const mode = pageSegmentationMode(layout);
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const prepared = prepareOcrPixels(imageData.data, background);
  if (prepared.inverted || prepared.colorEnhanced) {
    imageData.data.set(prepared.pixels);
    context.putImageData(imageData, 0, 0);
  }
  const split = layout === 'columns' ? Math.floor(canvas.width / 2)
    : layout === 'auto' ? detectColumnSplit(prepared.pixels, canvas.width, canvas.height) : null;
  if (split) {
    let enlarged;
    const columns = [];
    const plans = [[0, split], [split, canvas.width]].map(([left, right]) => ({ left, right, lines: findTextLines(prepared.pixels, canvas.width, canvas.height, left, right) }));
    const total = plans.reduce((sum, plan) => sum + (plan.lines.length >= 2 && plan.lines.length <= 16 ? plan.lines.length : 1), 0);
    let completed = 0;
    for (const { left, right, lines } of plans) {
      const parts = [];
      if (lines.length >= 2 && lines.length <= 16) {
        await worker.setParameters({ tessedit_pageseg_mode: '7' });
        for (const line of lines) {
          onSegment(completed, total);
          const scale = Math.max(1, Math.min(4, 32 / line.height));
          const cropped = canvas.ownerDocument.createElement('canvas');
          cropped.width = Math.ceil(line.width * scale) + 20;
          cropped.height = Math.ceil(line.height * scale) + 20;
          const drawing = cropped.getContext('2d');
          drawing.fillStyle = '#fff';
          drawing.fillRect(0, 0, cropped.width, cropped.height);
          drawing.drawImage(canvas, line.x, line.y, line.width, line.height, 10, 10, line.width * scale, line.height * scale);
          const { data } = await recognize(cropped, null, '7');
          parts.push(data);
          completed++;
          cropped.width = cropped.height = 0;
        }
      } else {
        await worker.setParameters({ tessedit_pageseg_mode: '3' });
        onSegment(completed, total);
        enlarged ||= enlargeCanvas(canvas, upscale);
        const scaledLeft = Math.round(left * enlarged.width / canvas.width);
        const scaledRight = Math.round(right * enlarged.width / canvas.width);
        const { data } = await recognize(enlarged, { rectangle: { left: scaledLeft, top: 0, width: scaledRight - scaledLeft, height: enlarged.height } }, '3');
        parts.push(data);
        completed++;
      }
      columns.push(...parts);
      columns.push({ text: '' });
    }
    const nonempty = columns.filter(part => part.text?.trim());
    const weight = nonempty.reduce((sum, part) => sum + part.text.length, 0);
    const confidence = weight ? nonempty.reduce((sum, part) => sum + (part.confidence || 0) * part.text.length, 0) / weight : 0;
    return { data: { text: columns.map(part => part.text.trim()).join('\n').trim(), confidence }, inverted: prepared.inverted, colorEnhanced: prepared.colorEnhanced, split };
  }
  onSegment(0, 1);
  await worker.setParameters({ tessedit_pageseg_mode: mode });
  const result = await recognize(enlargeCanvas(canvas, upscale), null, mode);
  return { ...result, inverted: prepared.inverted, colorEnhanced: prepared.colorEnhanced, split: null };
}
