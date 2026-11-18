const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
export function cutoutInput(rgba, size = 512) {
  if (rgba.length !== size * size * 4) throw Error('去背輸入尺寸不符');
  const plane = size * size, input = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) for (let channel = 0; channel < 3; channel++) {
    // Transparent source pixels are composited on white for segmentation only.
    const alpha = rgba[i * 4 + 3] / 255;
    const value = (rgba[i * 4 + channel] * alpha + 255 * (1 - alpha)) / 255;
    input[channel * plane + i] = (value - MEAN[channel]) / STD[channel];
  }
  return input;
}
export function cutoutMask(logits, size = 512) {
  if (logits.length !== size * size) throw Error('去背模型輸出尺寸不符');
  const rgba = new Uint8ClampedArray(logits.length * 4);
  for (let i = 0; i < logits.length; i++) {
    if (!Number.isFinite(logits[i])) throw Error('去背模型回傳無效數值，原圖已保留');
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.round(255 / (1 + Math.exp(-logits[i])));
  }
  return rgba;
}
export const IMPORT_MAX_BYTES = 30 * 1024 * 1024;
export const IMPORT_MAX_PIXELS = 16_000_000;
export function validateImportedImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('請選擇 PNG、JPEG 或 WebP 圖片');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > IMPORT_MAX_BYTES) throw Error('圖片須小於 30 MB');
}
export function validateImageSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > IMPORT_MAX_PIXELS) throw Error('圖片尺寸超過上限（1,600 萬像素或單邊 16,384px），請先縮小圖片');
}
