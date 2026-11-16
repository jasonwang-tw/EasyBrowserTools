export const MAX_CAPTURE_LENGTH = 8_000_000;
export const JOB_TTL = 5 * 60 * 1000;

// Clean CJK word segmentation spaces without collapsing English or layout lines.
// Tabs and line separators are deliberately excluded from the space class.
export function normalizeOcrText(text, language = 'chi_tra+eng') {
  const value = text.trim();
  if (!language.split('+').some(code => ['chi_tra', 'chi_sim'].includes(code))) return value;
  const space = '[ \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]';
  const han = '\\p{Script=Han}';
  const punctuation = { ',': '，', '.': '。', ';': '；', ':': '：', '!': '！', '?': '？' };
  return value
    .replace(new RegExp(`(${han})${space}+(?=${han})`, 'gu'), '$1')
    // Only reinterpret ASCII punctuation when surrounded by Han, or at a CJK line end.
    .replace(new RegExp(`(${han})${space}*([,.;:!?])${space}*(?=${han}|$|[\\r\\n\\u2028\\u2029])`, 'gu'),
      (_match, character, mark) => character + punctuation[mark])
    .replace(new RegExp(`${space}*([，。！？、；：「」『』（）【】《》〈〉〔〕［］｛｝…])${space}*`, 'gu'), '$1');
}

// Convert CSS viewport coordinates to actual screenshot pixels (zoom / HiDPI).
export function screenshotRect(rect, viewport, width, height) {
  if (!rect || !viewport || ![rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height, width, height].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0 || width <= 0 || height <= 0) {
    throw new Error('無法取得圖片範圍，請改用截圖 OCR 框選');
  }
  const left = Math.max(0, Math.min(width, Math.floor(rect.x * width / viewport.width)));
  const top = Math.max(0, Math.min(height, Math.floor(rect.y * height / viewport.height)));
  const right = Math.max(0, Math.min(width, Math.ceil((rect.x + rect.width) * width / viewport.width)));
  const bottom = Math.max(0, Math.min(height, Math.ceil((rect.y + rect.height) * height / viewport.height)));
  if (right - left < 3 || bottom - top < 3) throw new Error('範圍太小或圖片不在可見區域，請重新框選');
  return { x: left, y: top, width: right - left, height: bottom - top };
}
