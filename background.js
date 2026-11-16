import { translateTextGoogle, fetchGoogleTTS } from './translation-service.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'instant-translate',
      title: '翻譯選取文字',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
});

async function requestSelectionTranslation(tabId, frameId = 0, text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['content/translate-popup.js']
    });
    await chrome.tabs.sendMessage(tabId, {
      type: 'TRANSLATE_SELECTION',
      data: { text }
    }, { frameId });
  } catch (error) {
    // chrome://、商店及其他受保護頁面無法注入。
    console.warn('[Easy Browser Tools] 無法在此頁面翻譯：', error.message);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'instant-translate' && tab?.id != null && info.selectionText?.trim()) {
    return requestSelectionTranslation(tab.id, info.frameId ?? 0, info.selectionText.trim());
  }
});

chrome.action.onClicked.addListener(tab => {
  if (tab?.id != null) return requestSelectionTranslation(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  let request;
  if (message.type === 'TRANSLATE_WORD') {
    request = translateTextGoogle(message.data?.text);
  } else if (message.type === 'TTS_FETCH') {
    request = fetchGoogleTTS(message.data?.text, message.data?.lang).then(base64 => ({ base64 }));
  } else {
    return false;
  }
  request
    .then(result => sendResponse({ success: true, ...result }))
    .catch(error => sendResponse({ success: false, error: error.name === 'TimeoutError' ? '服務連線逾時，請稍後再試' : error.message }));
  return true;
});
