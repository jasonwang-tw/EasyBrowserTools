# 拆分驗證（2026-11-16）

來源：Open Chat Hub `main`，提交 `6724e5d50c01f8c5a51fde25218949b1ddc9e2dc`。

## 已通過

- `npm test`：15 項服務／背景訊息測試，包含翻譯方向、輸入驗證、服務失敗、朗讀分段、frame 路由、未知訊息與逾時。
- `npm run check`：Manifest V3、版本、權限、manifest 資源路徑、全部 JS 語法與原專案依賴檢查。
- Google 真實服務：`Hello world` 翻譯為「你好世界」；`Hello` 英文 TTS 回傳 6,912 bytes 音訊。
- 隔離 Edge 無頭瀏覽器的內容腳本 UI 測試：選取工具列、翻譯浮窗、譯文複製、Esc、無選取提示、服務錯誤、HTML escape、重複注入與取消晚到結果。這組測試替換 Chrome runtime，並在測試時將 shadow root 改為 open 方便自動操作；產品程式保持 closed。
- 實際將未封裝擴充功能載入隔離 Edge profile：確認 MV3 service worker、正式內容腳本與 closed Shadow DOM；透過背景傳送選取翻譯訊息，呼叫真實 Google 端點，確認浮窗譯文為「你好世界」。此組未替換 Chrome runtime。

拆分版本沒有 build 步驟，可直接載入。

## 驗證邊界與手動確認

- 尚未實際操作瀏覽器原生右鍵選單及工具列圖示；入口及 frame 參數由隔離測試覆蓋。
- 已驗證 TTS 音訊回傳，但尚未以實際喇叭確認朗讀及系統語音備援。
- 尚未進行 Chrome 實機、長文／窄視窗、各網站及商店審查驗證。

手動驗證時停用原 Open Chat Hub，避免兩組選取工具列干擾；在一般網頁測試英中互譯、右鍵、圖示、複製與朗讀。

## 獨立 repository 匯入（2026-11-16）

- 以拆分提交 `2f0ceddc1befb7f0f09984a8a4b43ae745b0eced` 作為來源，匯入 `jasonwang-tw/EasyBrowserTools` 的 main。
- 獨立版本為 1.0.0，更新產品名稱、package、注入版本與維護規範；翻譯服務及主要 UI 行為沿用拆分版本。
- 匯入前重新執行 `npm test` 與 `npm run check`，15 項測試及靜態檢查通過。上列實際 Google／Edge 測試屬於來源拆分版本的驗證，本次沒有重新執行網路或實際載入測試。
