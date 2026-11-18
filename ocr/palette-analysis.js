import { getPaletteSync } from '../vendor/palette/color-thief.js';

export const PALETTE_COUNTS = [3, 5, 8, 12];
export const MAX_PALETTE_PIXELS = 65_536;
export function paletteSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('沒有可分析的圖片');
  const scale = Math.min(1, Math.sqrt(MAX_PALETTE_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
export function analyzePalette({ data, width, height }, count = 5) {
  if (!PALETTE_COUNTS.includes(count)) throw new Error('色票數量無效');
  if (!(data instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || width <= 0 || height <= 0 || width * height > MAX_PALETTE_PIXELS || data.length !== width * height * 4) throw new Error('色票圖片資料無效');
  let total = 0;
  for (let i = 3; i < data.length; i += 4) total += data[i] / 255;
  if (!total) return [];
  // Do not use the library's default white/alpha filters or its population:
  // PageKit includes neutral backgrounds and weights translucent pixels.
  const palette = getPaletteSync(new ImageData(data, width, height), { colorCount: count, quality: 1, ignoreWhite: false, alphaThreshold: 1, colorSpace: 'oklch' }) || [];
  const colors = [...new Map(palette.map(color => [color.hex(), color.array()])).values()].slice(0, count);
  if (!colors.length) throw new Error('無法擷取代表色，請重新分析');
  const groups = colors.map(() => ({ weight: 0, sums: [0, 0, 0] }));
  for (let i = 0; i < data.length; i += 4) {
    const weight = data[i + 3] / 255;
    if (!weight) continue;
    let nearest = 0, distance = Infinity;
    colors.forEach((rgb, index) => {
      const d = (rgb[0] - data[i]) ** 2 + (rgb[1] - data[i + 1]) ** 2 + (rgb[2] - data[i + 2]) ** 2;
      if (d < distance) { nearest = index; distance = d; }
    });
    const group = groups[nearest]; group.weight += weight;
    for (let channel = 0; channel < 3; channel++) group.sums[channel] += data[i + channel] * weight;
  }
  const merged = new Map();
  for (const group of groups) {
    if (!group.weight) continue;
    const rgb = group.sums.map(sum => Math.round(sum / group.weight));
    const hex = '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const existing = merged.get(hex);
    if (existing) existing.weight += group.weight;
    else merged.set(hex, { hex, rgb, weight: group.weight });
  }
  return [...merged.values()].sort((a, b) => b.weight - a.weight || a.hex.localeCompare(b.hex))
    .map(({ hex, rgb, weight }) => ({ hex, rgb, percent: weight / total * 100 }));
}
