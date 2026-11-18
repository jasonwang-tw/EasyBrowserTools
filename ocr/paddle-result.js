// Only isolated, very uncertain ASCII fragments with graphic-like geometry are
// candidates for omission. No word blacklist; the UI can restore every item.
function noiseCandidates(items) {
  const anchors = items.filter(item => item.score >= 0.85 && [...item.text.trim()].length >= 3 && item.height > 0);
  if (anchors.length < 2) return new Set();
  const heights = anchors.map(item => item.height).sort((a, b) => a - b);
  const typicalHeight = heights[Math.floor(heights.length / 2)];
  return new Set(items.filter(item => {
    const text = item.text.trim();
    if (!Number.isFinite(item.score) || item.score >= 0.5 || !/^[a-z\d]{1,2}$/i.test(text)) return false;
    const tinyDigit = /^\d+$/.test(text) && item.score < 0.35 && item.height < typicalHeight * 0.65;
    const aspect = item.width / item.height;
    const graphicFragment = /[a-z]/i.test(text) && aspect >= 0.6 && aspect <= 2.5 && item.height <= typicalHeight * 2;
    if (!tinyDigit && !graphicFragment) return false;
    // Keep short words, units and list numbers beside actual text. An icon
    // above/below a caption is separate from that caption's text baseline.
    return !items.some(other => {
      if (other === item) return false;
      const overlap = Math.min(item.y + item.height, other.y + other.height) - Math.max(item.y, other.y);
      const gap = Math.max(0, other.x - item.x - item.width, item.x - other.x - other.width);
      return overlap >= Math.min(item.height, other.height) * 0.6 && gap <= Math.max(item.height, other.height) * 3;
    });
  }));
}

export function paddleResult(result, columns = false, width = 0, { includeUncertain = false } = {}) {
  const allItems = (Array.isArray(result) ? result : result?.items || []).filter(item => item.text?.trim() && item.poly?.length).map(item => {
    const xs = item.poly.map(p => Array.isArray(p) ? p[0] : p.x);
    const ys = item.poly.map(p => Array.isArray(p) ? p[1] : p.y);
    return { ...item, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }).filter(item => [item.x, item.y, item.width, item.height].every(Number.isFinite) && item.width > 0 && item.height > 0);
  const uncertain = noiseCandidates(allItems);
  const items = includeUncertain ? allItems : allItems.filter(item => !uncertain.has(item));
  const filteredCount = includeUncertain ? 0 : uncertain.size;
  const blocks = columns ? [items.filter(i => i.x < width / 2), items.filter(i => i.x >= width / 2)] : [items];
  const lines = [];
  for (const block of blocks) {
    const rows = [];
    for (const item of block.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows.find(row => Math.abs(row.y - item.y) <= Math.max(2, Math.min(row.height, item.height) * 0.45));
      if (row) row.items.push(item); else rows.push({ y: item.y, height: item.height, items: [item] });
    }
    lines.push(...rows.map(row => row.items.sort((a, b) => a.x - b.x).map(i => i.text.trim()).join(' ')));
  }
  return { data: { text: lines.join('\n'), confidence: items.length ? items.reduce((sum, i) => sum + i.score * 100, 0) / items.length : 0 }, filteredCount, needsReview: filteredCount > 0 || items.some(i => i.score < 0.75) };
}
