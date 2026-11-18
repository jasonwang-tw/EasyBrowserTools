# 本機去背資源

BiRefNet Lite Web 512 模型來自 [clevr-tools/birefnet-lite-web](https://huggingface.co/clevr-tools/birefnet-lite-web)，原始 BiRefNet 由 Peng Zheng 等人開發，模型及轉換檔 MIT 授權，見 LICENSE／NOTICE。

只封裝 onnxruntime-web 1.31.1 WASM 入口 JS；WASM 與 MIT／第三方授權沿用 `../paddle/ort/`、`../paddle/licenses/`。不載入遠端 JS、Python、自訂遠端程式、WebGPU 或 CDN。模型固定 revision、大小、SHA-256 記於 sources.json，首次自選下載約 101.1 MB，不在 ZIP 中。

512×512 ImageNet 正規化輸入，輸出 logits 經 sigmoid，遮罩放回原圖尺寸，以 destination-in 保留來源 alpha。原圖、OCR 與既有標註分離。玻璃、細髮、低對比與多主體仍可能去背不完整，請預覽核對。

維護：`node scripts/vendor-background-removal.mjs`，需先備妥與既有 OCR 相同的固定 npm 維護環境。一般安裝不需 npm install 或 build；模型權重不得加到此目錄。
