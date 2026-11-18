# 頁匣 PageKit：免費、免 API Key 本機 OCR 評估

評估日期：2026-11-17。以下比較基準為本地 PageKit 1.2.13；後續已在本地 1.3.0 加入可選 PP-OCRv6 Small，尚未發布。原始評估的 CSP 阻礙已用靜態 OpenCV 綁定修補，實際 MV3 離線測試見 VALIDATION.md；沒有放寬 unsafe-eval。

## 建議

優先評估 **PP-OCRv6 Small** 作為可選的「本機加強辨識」模式。這次對繁中英文混排、尤其 12 px 小字的改善最明顯。保留目前 Tesseract 作為快速模式與備援：既有 Support 清單在目前流程得到完整結果，Paddle 候選仍有底線相關誤字。

這是八張小樣本的實測建議，不能當作所有網站、字型或圖片的準確率排名。新模型尚未加入使用者日常安裝。

## 實測範圍與計分

- 六張既有問題截圖：Support 清單、雙欄產品說明、斜體「開發者」、繁中與英文國名、面板比較圖、深色 RapidChat 海報。
- 兩張新圖：同一份繁中英文內容，分別以 Microsoft JhengHei 18 px 與 12 px 繪製。內容包含 `Jason Wang`、`v1.2.13`、`PD5520`、`500 nits`、`Anti-Glare`、中文標點與數字；未依新圖結果調整正式 OCR 流程或候選模型參數。
- 固定裁切與尺寸，所有引擎使用相同 PNG。既有圖取自聊天附件的可見區域；Support 縮至 308 × 341 px，並非原始 308 × 362 px 圖檔。
- 瀏覽器測試在隔離 Edge，以 WASM 單執行緒、停用 GPU 執行。現有程式與浮點 Tesseract 都沿用 PageKit 的版面、中文校正及文字整理；每張建立新 worker，符合目前產品工作方式。Paddle 使用官方 SDK 原圖管線及各模型預設值，沒有借用 Tesseract 的逐行清單等特殊處理。
- 所有引擎的輸出都套用相同 `normalizeOcrText`。字元比較另做 NFKC、彎引號統一及忽略空白，保留大小寫、繁簡字、數字與標點差異。每張新圖含 **107 個非空白字元**。
- 字元錯誤數為 Levenshtein 編輯距離，包含錯字、漏字、多字。此項不計字距或換行；空白與版面仍須另外核對。
- 45 組關鍵文字只檢查內容是否出現，忽略空白，未驗證位置、閱讀順序或其他雜字；**不是整體準確率**。
- 速度為八張圖片辨識階段的單次測量中位數，不含下載、初次模型初始化與 PNG 讀入。Windows 系統 API 與瀏覽器 WASM 執行環境不同，時間僅供此機參考；未做記憶體、WebGPU、手機或長文件壓力測試。

## 數據

| 引擎／模型 | 新混排圖 18 px：字元錯誤 / 107 | 新小字圖 12 px：字元錯誤 / 107 | 關鍵文字命中 / 45 | 辨識時間中位數 |
|---|---:|---:|---:|---:|
| 現有 Tesseract best_int＋PageKit 處理 | 2 | 35 | 36 | 0.67 秒 |
| Tesseract tessdata_best 浮點＋標準 WASM 核心 | 5 | 42 | 34 | 1.60 秒 |
| PP-OCRv5 Mobile | 2 | 8 | 33 | 2.67 秒 |
| **PP-OCRv6 Small** | **0** | **3** | **42** | **2.90 秒** |
| PP-OCRv6 Tiny | 2 | 5 | 33 | 0.69 秒 |
| Windows OCR：本機現有 zh-Hant-TW 語言包 | 8 | 35 | 11 | 0.07 秒 |

PP-OCRv6 Small 的新小字圖 CER 為 3/107 ≈ 2.8%；現有流程為 35/107 ≈ 32.7%。此數值只描述該張圖，不推論為整體服務品質或所有圖片的改善幅度。

### 各圖片的關鍵文字命中

| 圖片 | 現有 | Tesseract 浮點 | v5 Mobile | v6 Small | v6 Tiny | Windows zh-Hant-TW |
|---|---:|---:|---:|---:|---:|---:|
| Support，8 組 | 8 | 8 | 6 | 7 | 6 | 1 |
| 雙欄圖文，8 組 | 8 | 7 | 8 | 8 | 7 | 2 |
| 斜體繁中，4 組 | 4 | 3 | 2 | 4 | 4 | 1 |
| 中文／國名，8 組 | 7 | 8 | 7 | 8 | 6 | 2 |
| 比較圖，4 組 | 4 | 4 | 4 | 4 | 4 | 2 |
| 深色海報，3 組 | 1 | 1 | 2 | 2 | 1 | 1 |
| 新混排圖，5 組 | 4 | 3 | 3 | 5 | 3 | 2 |
| 新小字圖，5 組 | 0 | 0 | 1 | 4 | 2 | 0 |

### 實際觀察

- 繁中／國名圖中，現有流程的 `United states` 大小寫錯誤與 `推送欄位 : 130%`，在 v6 Small 讀為 `United States` 與 `推送欄位：139筆`。
- 斜體「開發者」在現有流程及 v6 Small、v6 Tiny 均讀回正確中文。v5 Mobile 與浮點 Tesseract 沒有在此例全面勝過現有流程。
- v6 Small 的 Support 結果仍有 `Setting.product data`，而現有流程完整讀到 `Setting product data`。新引擎的圓點保留及文字分區也與現有流程不同。
- 所有候選都無法還原 RapidChat 圖中被浮層遮住的完整文字。關鍵文字改善不等於圖片內全部裝飾字或被遮擋文字都能辨識。
- Windows 確認已有 `zh-Hant-TW` OCR 語言包；僅測此包，未安裝英文包或進行多語言結果融合。速度快，但本次出現英文字母／數字混淆及漏字，不能據此推論所有 Windows OCR 語言組合都差。

## 模型大小與部署

| 方案 | 本次模型資源大小（十進位 MB） | 與頁匣整合的實際狀態 |
|---|---:|---|
| 現有繁中＋英文 best_int | gzip 約 4.61 MB | 已使用；另含 Tesseract 核心、簡中及程式資源 |
| 浮點 tessdata_best 繁中＋英文 | gzip 約 24.74 MB | 本次改用標準 WASM 核心才能完成；體積較大且結果未整體改善 |
| PP-OCRv5 Mobile | det＋rec tar 約 21.54 MB | 瀏覽器原圖推論通過 |
| PP-OCRv6 Small | det＋rec tar 約 31.21 MB | 瀏覽器原圖推論通過；辨識較佳、CPU 時間較長 |
| PP-OCRv6 Tiny | det＋rec tar 約 6.32 MB | 瀏覽器原圖推論通過；速度接近現有流程，整體召回較差 |
| Windows 既有 OCR 語言包 | 未量測，不隨擴充功能分發 | 須透過本機程式／Native Messaging 等橋接，不能直接由一般擴充功能 JS 呼叫 WinRT |

Paddle 的表列大小不含執行環境。本次測試另外使用約 10.90 MB 的打包 JS（含 OpenCV）及約 14.85 MB 的主要 ORT WASM；正式部署可研究裁剪及壓縮，不能只以模型檔估算擴充功能大小。上述為未經 ZIP 封裝的測試資產大小，不是安裝後記憶體需求。

### 必須處理的相容性

1. **Paddle 官方 SDK 尚非 MV3 直接替換品。**以與頁匣相同核心限制的 `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'` 測試時，SDK 0.4.2 使用的 OpenCV.js 在 `createNamedFunction` 呼叫 `new Function`，初始化遭 `EvalError` 擋下。這是本機 HTTP 測試頁的 CSP 相容測試，並非正式擴充功能端到端驗收。Chrome 不允許一般擴充功能頁直接加入 `unsafe-eval`。導入時須改用不依賴動態 JS 編譯的 OpenCV 建置／前後處理，或另行設計符合 MV3 的隔離執行方式。
2. **浮點模型有目前核心的相容風險。**直接沿用自動挑選的 Tesseract 7 Relaxed SIMD 核心時，實測出現缺少 `tesseract::DotProductSSE` 而中止。指定已封裝的非 SIMD LSTM 核心後才完成本表測試；沒有改動正式設定。表內浮點速度不是其最佳化 SIMD 效能。上游已有相同問題回報。
3. 全離線部署須把 JS、WASM、模型及對應字典固定版本封裝在本機，保留授權與雜湊；不能沿用 SDK 的遠端下載預設值。本次已指定所有資源為本機 URL。

## 其他選項

- **RapidOCR**：免費、可離線、以 ONNX 等後端部署 Paddle 模型的工具，不是另一個獨立訓練模型。選用相同 PP-OCRv6 Small 權重時，準確度不能因換成 RapidOCR 就假設再提高。適合後續若接受 Windows 本機輔助程式，研究原生 CPU 執行、常駐載入與封裝；本次未安裝／實測 Python RapidOCR。
- **EasyOCR**：支援 `ch_tra` 與 `en` 組合，可 CPU 執行，屬免費開源選項；官方主要部署方式是 Python／PyTorch。本機目前沒有已安裝的 Python，這次未新增系統 Python、PyTorch 或 EasyOCR，因此沒有它的準確度數據。就頁匣目前免額外安裝的產品方式，列為次要候選，不能宣稱其準確度低於實測模型。
- **PP-OCRv6 Medium／PP-OCRv5 Server**：模型較大，值得在願意增加本機輔助程式或包體時另測；本次沒有下載／實測，不以官方不同測試集的分數直接替代頁匣圖片的結果。

## 建議的後續實作順序

1. 先解決 v6 Small 的 MV3 執行環境相容性，所有資源仍走本機、維持圖片不外傳。
2. 增加「引擎：快速／本機加強」選項，切換後沿用現有的自動辨識、編輯及自動複製流程；保留已調整好的標註、清單與既有入口。
3. 對更多未曾用於調整的繁中英文截圖測試，分別統計正文、標點、型號、版本號、字距與閱讀順序，補做記憶體／中止清理與正式擴充功能驗證，再決定預設引擎。

以上為 1.2.13 評估階段的建議與記錄。後續 1.3.0 已完成第 1、2 項並於隔離擴充功能測試下載、離線自動辨識與刪除；保留內建引擎為預設，不宣稱所有圖片都更準。尚未操作使用者日常瀏覽器重新載入、提交或推送。

## 版本、證據與重現

- Tesseract.js／core：7.0.0；目前量化模型來源為專案 `@tesseract.js-data` 1.0.0 的 `4.0.0_best_int`。
- 浮點模型：`tesseract-ocr/tessdata_best` commit `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`，繁中、英文。
- PaddleOCR.js：0.4.2；npm tarball SHA-512 與 registry integrity 核對相符。
- ONNX Runtime Web：1.31.1；OpenCV.js：4.10.0-release.1；esbuild：0.25.12。
- 模型、字典沿用官方 det/rec tar；下載網址、檔案大小及下載後 SHA-256 記錄在 `output/ocr-evaluation/model-sources.json`。雜湊是重現依據，不是額外取得的供應商簽章。
- 原始輸出、逐案例時間／座標與計分：`output/ocr-evaluation/{tesseract-current,tesseract-best-float,paddle-v5-mobile,paddle-v6-small,paddle-v6-tiny,windows-native}.json`、`summary.json`。
- 固定輸入及參考字串：`output/ocr-evaluation/fixtures.mjs`；PNG 位於同目錄的 `fixtures/`。只有合成圖具有完整字元參考，其餘只做事先指定關鍵文字檢查。
- CSP 實際錯誤：`output/ocr-evaluation/csp-result.json`。
- 資源、圖片與結果均留在本機；瀏覽器測試設定阻擋非 localhost HTTP/HTTPS 請求，沒有使用雲端 OCR、上傳圖片、API Key 或系統剪貼簿。

完成準備後，可從專案根目錄執行以下命令啟動隔離評估頁；讀取測試圖片需要保留本機 `output/` 檔案。這是評估工具，非正式頁匣功能：

```powershell
node output/ocr-evaluation/server.mjs
# 在隔離瀏覽器開啟 http://127.0.0.1:45081/output/ocr-evaluation/index.html
# 評估頁定義 window.startModel(name)，依序執行且等前一模型完成：
# tesseract-current / tesseract-best-float / paddle-v5-mobile /
# paddle-v6-small / paddle-v6-tiny
# Windows 原生測試須使用 Windows PowerShell 5 與已安裝語言包：
powershell.exe -NoProfile -File output/ocr-evaluation/windows-ocr.ps1
node output/ocr-evaluation/analyze.mjs
```

首次 sandbox 權限下的 WinRT 檔案讀取曾回報存取拒絕，正常使用者環境重新執行成功；未變更檔案 ACL、安裝語言包或註冊本機橋接。評估完成後測試瀏覽器及本機伺服器已關閉。

## 官方來源

- [PP-OCRv6 介紹](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html)：單模型繁中、英文等語言支援；官方測試集不等同這份小樣本。
- [PaddleOCR.js SDK](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)：瀏覽器、v5/v6、明確指定本機模型與執行資源。
- [PaddleOCR 原始碼與 Apache-2.0 授權](https://github.com/PaddlePaddle/PaddleOCR)。
- [Tesseract 模型差異](https://tesseract-ocr.github.io/tessdoc/Data-Files.html)、[浮點／Relaxed SIMD 問題 #1080](https://github.com/naptha/tesseract.js/issues/1080)。
- [RapidOCR](https://github.com/RapidAI/RapidOCR)、[EasyOCR](https://github.com/JaidedAI/EasyOCR)。
- [Windows OcrEngine](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine)、[PowerToys OCR 語言包說明](https://learn.microsoft.com/en-us/windows/powertoys/text-extractor)。
- [Chrome 擴充功能 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)、[ONNX Runtime Web 部署](https://onnxruntime.ai/docs/tutorials/web/deploy.html)。
