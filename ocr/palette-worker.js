import { analyzePalette } from './palette-analysis.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ colors: analyzePalette(data.pixels, data.count) }); }
  catch (error) { self.postMessage({ error: error.message || '色票分析失敗，請重試' }); }
};
