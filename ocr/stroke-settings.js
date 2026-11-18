export function strokeRange(tool) {
  return tool === 'highlight' ? { min: 8, max: 60, initial: 20 } : { min: 1, max: 30, initial: 3 };
}
export function clampStrokeWidth(tool, value) {
  const range = strokeRange(tool), number = Number(value);
  return Number.isFinite(number) ? Math.max(range.min, Math.min(range.max, Math.round(number))) : range.initial;
}
