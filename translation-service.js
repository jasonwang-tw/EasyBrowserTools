// 從 Open Chat Hub background.js 抽出；不依賴聊天、儲存或 AI provider。
export const MAX_TEXT_LENGTH = 5000;
export const MAX_OCR_TRANSLATION_LENGTH = 30000;
export const TRANSLATION_LANGUAGES = Object.freeze([
  ['zh-TW', '繁體中文'], ['zh-CN', '簡體中文'], ['en', '英文'], ['ja', '日文'], ['ko', '韓文'],
  ['de', '德文'], ['fr', '法文'], ['es', '西班牙文'], ['it', '義大利文'], ['pt', '葡萄牙文'],
  ['vi', '越南文'], ['th', '泰文'], ['id', '印尼文'], ['ru', '俄文'], ['ar', '阿拉伯文']
]);

function validateText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('請先選取文字');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`請選取 ${MAX_TEXT_LENGTH} 字以內的文字`);
  return text.trim();
}

export function getTranslationDirection(text) {
  const isChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
  return isChinese ? { from: 'zh-TW', to: 'en' } : { from: 'auto', to: 'zh-TW' };
}

export async function translateTextGoogle(input) {
  const original = validateText(input);
  const { from, to } = getTranslationDirection(original);
  return fetchTranslation(original, from, to);
}

async function fetchTranslation(original, from, to, signal) {
  const url = new URL('https://translate.google.com/translate_a/single');
  url.search = new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q: original });
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit' });
  if (!response.ok) throw new Error(`翻譯服務暫時無法使用（HTTP ${response.status}）`);
  const data = await response.json();
  if (!Array.isArray(data?.[0])) throw new Error('翻譯服務回傳格式錯誤');
  const translated = data[0].map(segment => typeof segment?.[0] === 'string' ? segment[0] : '').join('');
  if (!translated.trim()) throw new Error('翻譯服務未回傳譯文');
  return { original, translated, from, to };
}

export function validateOcrTranslation(text, target) {
  if (typeof text !== 'string' || !text.trim()) throw Error('請先辨識或輸入要翻譯的文字');
  if (text.length > MAX_OCR_TRANSLATION_LENGTH) throw Error('文字超過 30,000 字上限，請先縮短內容；不會只翻譯一部分');
  if (!TRANSLATION_LANGUAGES.some(([code]) => code === target)) throw Error('不支援的翻譯目標語言');
  try { encodeURIComponent(text); } catch { throw Error('文字含無效 Unicode 字元，請重新貼上後再試'); }
}

// Bound the encoded GET query without breaking surrogate pairs or dropping text.
export function splitTranslationText(text, budget = 4000) {
  if (!Number.isInteger(budget) || budget < 12) throw Error('無效的翻譯分段大小');
  const chunks = []; let current = '', cost = 0, lastBreak = 0;
  for (const char of text) {
    const encoded = encodeURIComponent(char).length;
    if (cost + encoded > budget) {
      const split = lastBreak >= current.length / 2 ? lastBreak : current.length;
      chunks.push(current.slice(0, split)); current = current.slice(split);
      cost = encodeURIComponent(current).length; lastBreak = 0;
    }
    current += char; cost += encoded;
    if (/[\s.!?。！？]/u.test(char)) lastBreak = current.length;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function translateOcrText(text, target, { signal, progress = () => {} } = {}) {
  validateOcrTranslation(text, target);
  const chunks = splitTranslationText(text); let translated = '';
  for (let index = 0; index < chunks.length; index++) {
    signal?.throwIfAborted();
    const chunk = chunks[index], core = chunk.trim();
    if (core) {
      const result = await fetchTranslation(core, 'auto', target, signal);
      signal?.throwIfAborted();
      translated += chunk.match(/^\s*/u)[0] + result.translated + chunk.match(/\s*$/u)[0];
    } else translated += chunk;
    progress({ completed: index + 1, total: chunks.length });
  }
  return { original: text, translated, from: 'auto', to: target };
}

export function splitTextChunks(text, maxLength = 180) {
  const characters = Array.from(text);
  const chunks = [];
  for (let i = 0; i < characters.length; i += maxLength) {
    chunks.push(characters.slice(i, i + maxLength).join(''));
  }
  return chunks;
}

export async function fetchGoogleTTS(input, language) {
  const text = validateText(input);
  if (typeof language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language)) {
    throw new Error('不支援的朗讀語言');
  }
  const buffers = [];
  for (const chunk of splitTextChunks(text)) {
    if (!chunk.trim()) continue;
    const url = new URL('https://translate.google.com/translate_tts');
    url.search = new URLSearchParams({ ie: 'UTF-8', q: chunk, tl: language, client: 'gtx', ttsspeed: '1' });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), credentials: 'omit' });
    if (!response.ok) throw new Error(`朗讀服務暫時無法使用（HTTP ${response.status}）`);
    buffers.push(new Uint8Array(await response.arrayBuffer()));
  }
  let binary = '';
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i += 8192) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
    }
  }
  return btoa(binary);
}
