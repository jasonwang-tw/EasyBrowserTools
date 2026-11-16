// Image identity stays in this frame. Browser-supplied srcUrl is used only for
// transient DOM matching after a reload; it is never fetched or stored.
(() => {
  const previous = window.__easyBrowserOcrTarget;
  previous?.dispose?.();
  const state = { image: previous?.image?.isConnected ? previous.image : null };
  window.__easyBrowserOcrTarget = state;
  const channel = 'easy-browser-image-coordinates-v1';
  function elements(selector, root = document) {
    const result = [...root.querySelectorAll(selector)];
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) result.push(...elements(selector, element.shadowRoot));
    return result;
  }
  function clip(rect, viewport) {
    if (!rect || !viewport || ![rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) throw new Error('圖片範圍無效，請重新右鍵點選圖片');
    const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
    const right = Math.min(viewport.width, rect.x + rect.width), bottom = Math.min(viewport.height, rect.y + rect.height);
    if (right - x < 3 || bottom - y < 3) throw new Error('圖片目前不在可見範圍，請先捲動到圖片');
    return { rect: { x, y, width: right - x, height: bottom - y }, viewport };
  }
  function toTop(target) {
    const clipped = clip(target.rect, target.viewport);
    if (window === window.top) return Promise.resolve(clipped);
    return new Promise((resolve, reject) => {
      const token = crypto.getRandomValues(new Uint32Array(4)).join('-');
      const timer = setTimeout(() => finish(null, new Error('無法換算 iframe 圖片範圍，請重新整理網頁後再試')), 1200);
      function finish(value, error) {
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        if (error) reject(error); else resolve(value);
      }
      function receive(event) {
        if (event.source !== window.parent || event.data?.channel !== channel || event.data.type !== 'response' || event.data.token !== token) return;
        if (event.data.error) finish(null, new Error(event.data.error));
        else { try { finish(clip(event.data.target.rect, event.data.target.viewport)); } catch (error) { finish(null, error); } }
      }
      window.addEventListener('message', receive);
      window.parent.postMessage({ channel, type: 'request', token, target: clipped }, '*');
    });
  }
  async function frameMessage(event) {
    if (event.data?.channel !== channel || event.data.type !== 'request' || typeof event.data.token !== 'string' || event.data.token.length > 100) return;
    const frame = elements('iframe,frame').find(element => element.contentWindow === event.source);
    if (!frame) return;
    try {
      const local = clip(event.data.target?.rect, event.data.target?.viewport);
      const bounds = frame.getBoundingClientRect();
      for (let element = frame; element; element = element.parentElement) {
        const transform = getComputedStyle(element).transform;
        if (transform && transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(transform);
          if (!matrix.is2D || Math.abs(matrix.b) > .001 || Math.abs(matrix.c) > .001) throw new Error('此 iframe 有旋轉或傾斜，無法自動擷取圖片');
        }
      }
      if (!frame.offsetWidth || !frame.offsetHeight) throw new Error('圖片所在 iframe 不可見');
      const style = getComputedStyle(frame);
      const paddingLeft = parseFloat(style.paddingLeft) || 0, paddingTop = parseFloat(style.paddingTop) || 0;
      const innerWidth = frame.clientWidth - paddingLeft - (parseFloat(style.paddingRight) || 0);
      const innerHeight = frame.clientHeight - paddingTop - (parseFloat(style.paddingBottom) || 0);
      const sx = bounds.width / frame.offsetWidth, sy = bounds.height / frame.offsetHeight;
      const target = await toTop({
        rect: {
          x: bounds.x + (frame.clientLeft + paddingLeft + local.rect.x * innerWidth / local.viewport.width) * sx,
          y: bounds.y + (frame.clientTop + paddingTop + local.rect.y * innerHeight / local.viewport.height) * sy,
          width: local.rect.width * innerWidth / local.viewport.width * sx,
          height: local.rect.height * innerHeight / local.viewport.height * sy
        },
        viewport: { width: window.innerWidth, height: window.innerHeight }
      });
      event.source.postMessage({ channel, type: 'response', token: event.data.token, target }, '*');
    } catch (error) { event.source.postMessage({ channel, type: 'response', token: event.data.token, error: error.message }, '*'); }
  }
  function contextMenu(event) {
    state.image = event.composedPath().find(node => node instanceof HTMLImageElement) || null;
  }
  function onMessage(message, _sender, respond) {
    if (message.type !== 'OCR_IMAGE_RECT') return;
    (async () => {
      const matches = image => image.isConnected && (!message.srcUrl || (image.currentSrc || image.src) === message.srcUrl);
      let image = state.image && matches(state.image) ? state.image : null;
      if (!image && message.srcUrl) {
        const candidates = elements('img').filter(matches).filter(item => {
          const rect = item.getBoundingClientRect();
          return rect.width >= 3 && rect.height >= 3 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
        });
        if (candidates.length === 1) image = candidates[0];
        else if (candidates.length > 1) throw new Error('畫面有多張相同圖片，請重新右鍵點選要擷取的圖片');
      }
      if (!image) throw new Error('無法定位右鍵圖片，請重新整理網頁後再右鍵點選');
      const rect = image.getBoundingClientRect();
      return toTop({ rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: window.innerWidth, height: window.innerHeight } });
    })().then(respond).catch(error => respond({ error: error.message }));
    return true;
  }
  document.addEventListener('contextmenu', contextMenu, true);
  window.addEventListener('message', frameMessage);
  chrome.runtime.onMessage.addListener(onMessage);
  state.dispose = () => {
    document.removeEventListener('contextmenu', contextMenu, true);
    window.removeEventListener('message', frameMessage);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* Previous extension context may already be gone. */ }
  };
})();
