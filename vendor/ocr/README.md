# 本機 OCR 資源

Tesseract.js 7.0.0、tesseract.js-core 7.0.0 與 `@tesseract.js-data/{eng,chi_tra,chi_sim}` 1.0.0 的 LSTM 模型。

來源與每個檔案的 SHA-256 記錄於 `sources.json`；`npm run check` 會核對完整性。維護者可執行 `node scripts/vendor-ocr.mjs` 重新下載指定版本，下載時先核對 npm SHA-512 integrity。一般安裝與使用完全不需要此步驟、npm 安裝或網路。

程式與核心依 Apache-2.0 授權散布，授權與內含第三方聲明保留在 `LICENSE.md`、`core/LICENSE` 與 `*.LICENSE.txt`。語言資料由 Tesseract 官方維護者發行的 npm package 取得，來源為 [tessdata](https://github.com/tesseract-ocr/tessdata)（Apache-2.0）；語言模型同適用本目錄的 Apache-2.0 授權全文。

只使用 OEM 1（LSTM），封裝一般、SIMD 與 Relaxed SIMD 三種 LSTM 核心，由引擎選擇。未使用或封裝 Legacy 核心；不要在呼叫端改為 Legacy OEM。

影響評估：資源約 20 MB，辨識期間會消耗 CPU／記憶體；每次工作結束、取消或逾時均終止 worker，無背景常駐服務、連接埠或 npm runtime 相依衝突。替代的雲端 OCR 需要上傳圖片及 API／帳號設定，因此採用封裝本機引擎。移除 OCR 時一併移除 `ocr/`、`ocr-utils.js`、`content/ocr-target.js`、本目錄與背景入口，還原 manifest 的 storage／WASM 設定；session 資料於瀏覽器結束清除，沒有持久 OCR 模型快取。
