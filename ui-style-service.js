// Only bundled, fixed CSS assets are returned to our isolated content scripts.
// This avoids exposing extension files through web_accessible_resources.
export function createUiStyleLoader(getURL, fetcher = (...args) => fetch(...args)) {
  let pending;
  return () => {
    if (!pending) pending = Promise.all(['vendor/ui/daisyui.css', 'ocr/ui-theme.css', 'content/ui-components.css'].map(async path => {
      const response = await fetcher(getURL(path));
      if (!response.ok) throw new Error('無法載入本機 UI 樣式，請重新載入擴充功能');
      return response.text();
    })).then(parts => ({ css: parts.join('\n') })).catch(error => { pending = null; throw error; });
    return pending;
  };
}
