import { translateOcrText } from '../translation-service.js';
import { isModelPage as isEditorPage } from './model-download.js';

export function installOcrTranslation(api = chrome, { translate = translateOcrText } = {}) {
  api.runtime.onConnect.addListener(port => {
    if (port.name !== 'pagekit-ocr-translation' || !isEditorPage(port.sender, api.runtime)) return;
    let controller = null, closed = false;
    const post = message => { if (!closed) { try { port.postMessage(message); } catch {} } };
    port.onDisconnect.addListener(() => { closed = true; controller?.abort(); });
    port.onMessage.addListener(message => {
      if (message?.type !== 'START' || controller) return;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new DOMException('翻譯逾時，請稍後重試或縮短文字', 'TimeoutError')), 90000);
      void translate(message.text, message.target, { signal: controller.signal, progress: value => post({ type: 'PROGRESS', ...value }) })
        .then(result => { if (!controller.signal.aborted) post({ type: 'DONE', ...result }); })
        .catch(error => post({ type: 'ERROR', error: error.name === 'TimeoutError' ? '翻譯逾時，請稍後重試或縮短文字' : error instanceof TypeError ? '翻譯連線失敗，請確認網路後重試。' : error.message || '翻譯失敗，請稍後再試' }))
        .finally(() => clearTimeout(timeout));
    });
  });
}
