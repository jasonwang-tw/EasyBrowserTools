# 專案規範

- 本專案為 `jasonwang-tw/EasyBrowserTools`，獨立於 Open Chat Hub 維護；預設開發分支為 `main`，目前版本 1.0.0。
- 修改前先讀 README.md 與本檔。Git commit 訊息使用繁體中文。
- 提交、推送、建立遠端分支及發布只能使用 GitHub App connector；不可使用 git add／commit／push 或 gh 作為替代。
- 任何額外專案初始化或另建 repository，須先詢問使用者並建立 README.md／AGENTS.md。
- 除非使用者明確要求建立分支，直接提交預設 main；Git commit 訊息使用繁體中文。
- 維持 Manifest V3、純 JavaScript 與本機封裝程式碼；目前沒有 npm 依賴或 build 步驟。
- 選取及浮窗在 content script；第三方網路請求僅由背景服務執行。UI 接收的文字必須 escape，並保持 Shadow DOM 隔離。
- 現有內嵌 CSS／SVG 隨抽出程式保留；新圖示延續 Lucide 風格，禁止以 emoji 代替。
- 不引入聊天、AI Key、單字簿或雲端同步依賴；新增權限時須說明實際用途。
- 完成變更執行 `npm test`、`npm run check`；瀏覽器／第三方服務未實測時，須明確說明驗證範圍。
- connector 提交後驗證遠端 SHA；本地同步前核對所有內容與未追蹤檔案，避免覆蓋使用者變更。完成條件包含本地 HEAD 與 origin/main 一致、工作區乾淨；不能用 reset --hard 或刪除本地變更。
- 新增版本時同步 manifest.json、package.json、README 與內容腳本的注入版本識別。
