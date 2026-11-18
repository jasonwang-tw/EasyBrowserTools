// CSS preview scaling only. Annotation and OCR coordinates stay in native pixels.
export function fitPreviewWidth(imageWidth, imageHeight, availableWidth, availableHeight) {
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return 0;
  return Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * imageWidth / imageHeight)));
}
