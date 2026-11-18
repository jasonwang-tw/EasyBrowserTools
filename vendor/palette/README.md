# Color Thief（本機色票分析）

固定 3.5.0，MIT：https://github.com/lokesh/color-thief

僅封裝官方 dependency-free `dist/index.browser.js` 為 `color-thief.js` 及 LICENSE。維護用 `node scripts/vendor-palette.mjs` 核對 npm tarball SHA-512；個別 SHA-256 見 sources.json。使用端無 npm install／build／CDN／模型下載。

`ocr/palette-worker.js` 僅對取樣原圖進行代表色分析；占比與透明像素加權由 `ocr/palette-analysis.js` 處理。函式庫未修改；sourceMappingURL 僅供維護識別，不封裝開發用 map。
