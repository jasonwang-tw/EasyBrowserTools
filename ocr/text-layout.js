const ink = (pixels, i) => pixels[i + 3] >= 128 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 160;

// Short horizontal text bands; tall photo regions are not text lines.
export function findTextLines(pixels, width, height, left, right, maxHeight = Math.min(64, height * .15)) {
  const lines = [];
  let start = null, last = -1;
  const finish = () => {
    if (start == null) return;
    if (last - start + 1 >= 4 && last - start + 1 <= maxHeight) {
      let x1 = right, x2 = left;
      for (let y = start; y <= last; y++) for (let x = left; x < right; x++) {
        if (ink(pixels, (y * width + x) * 4)) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
      }
      if (x2 - x1 >= 12) lines.push({ x: x1, y: Math.max(0, start - 1), width: x2 - x1 + 1, height: Math.min(height, last + 2) - Math.max(0, start - 1) });
    }
    start = null;
  };
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = left; x < right; x++) if (ink(pixels, (y * width + x) * 4)) count++;
    if (count >= Math.max(3, (right - left) * .015)) {
      if (start == null) start = y;
      last = y;
    } else if (start != null && y - last > 2) finish();
  }
  finish();
  return lines;
}

export function structuredTextLines(pixels, width, height) {
  if (width < 80 || height < 80) return null;
  // Screenshot edges sometimes include a one-pixel editor/card rule. Exclude
  // long rules at the outer edge from line bounds, rather than OCRing them as |.
  let cleaned;
  const edge = Math.max(1, Math.ceil(width * .025));
  for (let x = 0; x < width; x++) {
    if (x >= edge && x < width - edge) continue;
    let count = 0;
    for (let y = 0; y < height; y++) if (ink(pixels, (y * width + x) * 4)) count++;
    if (count < height * .8) continue;
    cleaned ||= new Uint8ClampedArray(pixels);
    for (let y = 0; y < height; y++) cleaned.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
  }
  pixels = cleaned || pixels;
  const lines = findTextLines(pixels, width, height, 0, width, Math.min(128, height * .2));
  if (lines.length < 4 || lines.length > 32 || lines.at(-1).y - lines[0].y < height * .45) return null;
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const typicalHeight = median(lines.map(line => line.height));
  if (lines.filter(line => line.height <= typicalHeight * 1.8).length < lines.length * .75) return null;
  if (median(lines.slice(1).map((line, index) => line.y - lines[index].y - lines[index].height)) < typicalHeight * .4) return null;
  let button = false;
  const markers = [];
  for (const line of lines) {
    const row = new Uint8ClampedArray(line.width * line.height * 4);
    let filled = 0;
    for (let y = 0; y < line.height; y++) {
      row.set(pixels.subarray(((line.y + y) * width + line.x) * 4, ((line.y + y) * width + line.x + line.width) * 4), y * line.width * 4);
      for (let x = 0; x < line.width; x++) if (ink(row, (y * line.width + x) * 4)) filled++;
    }
    if (leadingBullet(row, line.width, line.height)) markers.push(line.x);
    if (filled / (line.width * line.height) > .75 && line.height > typicalHeight * 1.5) button = true;
  }
  // A loose paragraph is still a paragraph. Use row OCR only when the image
  // supplies aligned list markers or a solid button among the text lines.
  if (!button && !markers.some(x => markers.filter(other => Math.abs(x - other) < typicalHeight * .4).length >= 2)) return null;
  const covered = new Uint8Array(height);
  for (const line of lines) covered.fill(1, line.y, line.y + line.height);
  let total = 0, outside = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (ink(pixels, (y * width + x) * 4)) {
    total++;
    if (!covered[y]) outside++;
  }
  return total && outside / total < .1 ? lines : null;
}

// Detect an actual round list marker from pixels, not OCR punctuation guesses.
export function leadingBullet(pixels, width, height) {
  const columns = new Uint8Array(width);
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) if (ink(pixels, (y * width + x) * 4)) columns[x] = 1;
  const x0 = columns.indexOf(1);
  if (x0 < 0) return null;
  let x1 = x0;
  while (x1 < width && columns[x1]) x1++;
  let next = x1;
  while (next < width && !columns[next]) next++;
  let y0 = height, y1 = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = x0; x < x1; x++) if (ink(pixels, (y * width + x) * 4)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); count++; }
  const w = x1 - x0, h = y1 - y0 + 1, center = (y0 + y1) / 2;
  if (w < 2 || h < 2 || w > height * .65 || h > height * .65 || w / h < .65 || w / h > 1.5
    || center < height * .25 || center > height * .7 || count / (w * h) < .5 || next - x1 < height * .35 || next === width) return null;
  return { left: next, x0, x1, y0, y1 };
}

// Locate a thin blue hyperlink underline for a separate OCR candidate. Never
// erase it directly from the original image or rewrite the recognized string.
export function blueUnderlineRows(pixels, width, height, left = 0) {
  const rows = [];
  for (let y = Math.floor(height * .75); y < height; y++) {
    let run = 0, longest = 0, count = 0;
    for (let x = left; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 2] > pixels[i] + 30 && pixels[i + 2] > pixels[i + 1] + 20) { longest = Math.max(longest, ++run); count++; }
      else run = 0;
    }
    if (longest > (width - left) * .7 || (count > (width - left) * .8 && longest > (width - left) * .5)) rows.push(y);
  }
  return rows.length <= Math.max(2, Math.ceil(height * .15)) ? rows : [];
}

export function withoutBlueUnderline(pixels, original, width, height, rows, left = 0) {
  const result = new Uint8ClampedArray(pixels);
  const preserve = new Uint8Array(width);
  // Preserve strokes that extend below the underline (g, p, q, y, etc.).
  for (let y = (rows.at(-1) ?? height) + 1; y < height; y++) for (let x = left; x < width; x++) {
    const i = (y * width + x) * 4;
    if (original[i + 2] > original[i] + 30 && original[i + 2] > original[i + 1] + 20) preserve.fill(1, Math.max(left, x - 1), Math.min(width, x + 2));
  }
  for (const y of rows) for (let x = left; x < width; x++) if (!preserve[x]) {
    const i = (y * width + x) * 4;
    result[i] = result[i + 1] = result[i + 2] = 255;
  }
  return result;
}

export function thresholdDarkRow(pixels) {
  // Otsu separates light letters from the dominant dark button background.
  const bins = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) bins[pixels[i]]++;
  const total = pixels.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * bins[i];
  let weight = 0, partial = 0, best = -1, threshold = 127;
  for (let i = 0; i < 255; i++) {
    weight += bins[i]; partial += i * bins[i];
    if (!weight || weight === total) continue;
    const difference = partial / weight - (sum - partial) / (total - weight);
    const score = weight * (total - weight) * difference * difference;
    if (score > best) { best = score; threshold = i; }
  }
  const result = new Uint8ClampedArray(pixels);
  for (let i = 0; i < result.length; i += 4) result[i] = result[i + 1] = result[i + 2] = pixels[i] <= threshold ? 0 : 255;
  return result;
}
