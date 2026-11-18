# PageKit 本機加強 OCR 執行資源

本目錄僅封裝程式及 WASM，不包含 PP-OCRv6 Small 模型。固定模型的來源、位元組數、SHA-256 位於 `ocr/model-store.js`；約 31.2 MB，使用者同意後由背景下載、驗證並存入 IndexedDB。辨識圖片不外傳，無 API Key 或原生服務。

程式版本及資源 SHA-256 見 `sources.json`。PaddleOCR.js 0.4.2／OpenCV.js 4.10.0 使用 Apache-2.0，ONNX Runtime Web 1.31.1 為 MIT，Clipper 6.4.2 為 Boost 1.0（含 JSBN attribution），js-yaml 4.3.2 為 MIT；完整聲明保留於 `licenses/`。ONNX Runtime 的 LICENSE／ThirdPartyNotices 對應官方 `v1.31.1`；PaddleOCR 官方 Apache 聲明也包含於此。

PageKit 於 2026-11-17 修改 SDK／OpenCV，修補可由 `scripts/vendor-paddle.mjs` 重現：

- 四個 Embind 動態 Function 產生器改為靜態閉包，保留參數轉換、回傳及解構流程；沒有使用 eval 或字串直譯器。
- SDK 使用 OffscreenCanvas／matFromImageData，執行於專用 module worker；每次辨識完成、失敗、逾時或關閉視窗後銷毀 worker。
- ONNX Runtime 只封裝 CPU WASM 入口與對應 mjs／wasm，單執行緒、不使用代理 blob worker；明確指定本機路徑。SDK 未使用的 CDN 備援改為相對本機路徑。
- 自訂 fetch 只回傳已驗證的兩份模型資料；OCR 頁維持 `connect-src 'self'`，worker 只載入固定本機執行資源。背景另有模型下載來源的選用權限。

一般安裝不需 npm。維護時在專案的 `output/` 安裝固定開發工具，再重建（不納入上架包）：

```powershell
npm install --prefix output/vendor-runtime --no-save @paddleocr/paddleocr-js@0.4.2 @techstark/opencv-js@4.10.0-release.1 onnxruntime-web@1.31.1 clipper-lib@6.4.2 js-yaml@4.3.2 esbuild@0.25.12
node scripts/vendor-paddle.mjs output/vendor-runtime/node_modules
npm test
npm run check
```

腳本檢查版本及 SDK／OpenCV 原始碼 SHA-256，遇版本漂移即中止。所有產出更新後須重測實際 MV3 頁面；不得放寬為 unsafe-eval。模型檔案不可放進此目錄。
