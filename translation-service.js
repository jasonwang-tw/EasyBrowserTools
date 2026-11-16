// 從 Open Chat Hub background.js 抽出；不依賴聊天、儲存或 AI provider。
export const MAX_TEXT_LENGTH = 5000;

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
  const url = new URL('https://translate.google.com/translate_a/single');
  url.search = new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q: original });
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), credentials: 'omit' });
  if (!response.ok) throw new Error(`翻譯服務暫時無法使用（HTTP ${response.status}）`);
  const data = await response.json();
  if (!Array.isArray(data?.[0])) throw new Error('翻譯服務回傳格式錯誤');
  const translated = data[0].map(segment => typeof segment?.[0] === 'string' ? segment[0] : '').join('');
  if (!translated.trim()) throw new Error('翻譯服務未回傳譯文');
  return { original, translated, from, to };
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
