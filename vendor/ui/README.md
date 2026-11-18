# 頁匣彈窗 UI 資源

daisyUI 5.8.1，MIT 授權。`daisyui.css` 組合官方 npm 套件的預編譯 base／元件 CSS；所選檔案、npm integrity 與 SHA-256 見 `sources.json`，完整授權見 `LICENSE`。未封裝 Tailwind 瀏覽器執行器或任何第三方 UI JavaScript，不使用 CDN、遠端字型或圖片。

共用主題在 `ocr/ui-theme.css`；外觀客製在 `ocr/ocr.css` 與 `content/ui-components.css`。UI 行為使用原生 HTML details／JavaScript，保留現有 OCR 與 AnnotationEditor；背景只讀取固定本機 CSS，供隔離 Shadow DOM 工具使用。此目錄不影響 OCR 模型快取或下載權限。

1.6.1 加入官方 modal 元件 CSS，配合原生 dialog 顯示集中管理，不加入第三方 UI JavaScript。可見性與焦點過渡由本機樣式／控制器處理，支援系統減動效。

1.7.0 加入官方 range 元件 CSS，用於標註粗細拉桿；色票分析沿用 modal／card／btn／select。沒有更換 UI Kit 或新增遠端執行器。

1.8.0 加入官方 dropdown／input CSS，配合原生 Popover 顯示共用樣式設定，裁切 dialog 沿用 modal／select／checkbox／input／btn；第三方裁切框只在本機載入。主題及元件基礎不更換。

維護時執行 `node scripts/vendor-ui.mjs`：下載固定版本、核對 npm SHA-512，組合官方 CSS 並產出 SHA-256。一般安裝、測試與載入擴充功能不需 npm install 或 build。
