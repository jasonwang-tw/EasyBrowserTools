# Easy Browser Tools

獨立維護的 Chrome / Edge 瀏覽器工具擴充功能，目前提供網頁選取翻譯、複製與朗讀。

Repository：[jasonwang-tw/EasyBrowserTools](https://github.com/jasonwang-tw/EasyBrowserTools)，預設開發分支為 `main`。

## 版本

**目前版本：1.0.0**（2026-11-16）。

由 Open Chat Hub 1.41.0 的選取翻譯功能拆出；匯入來源為 [`selection-translate` 的拆分提交 `2f0ceddc`](https://github.com/jasonwang-tw/minimax-chat-extension/commit/2f0ceddc1befb7f0f09984a8a4b43ae745b0eced)。本 repository 從獨立版本 1.0.0 開始，來源歷史保留於原 repository。

## 功能

- 選取網頁文字後顯示浮動工具列，點「翻譯」開啟結果。
- 支援右鍵「翻譯選取文字」，或選取後點擴充功能工具列圖示。
- 沿用原本判斷方式：包含漢字則譯成英文，其餘自動偵測並譯成繁體中文。含漢字的日文也會走前者，精確語言偵測留待後續改善。
- Shadow DOM 浮窗顯示原文／譯文；可分別複製、朗讀。Esc 或點外部關閉。
- Google Translate TTS 失敗時使用瀏覽器 Web Speech API 備援。

本專案只匯入選取翻譯及必要依賴，不包含側邊欄聊天、模型／API Key 設定、單字簿、記憶、知識庫、OCR、檔案或同步功能。後續功能、issue、提交及發布均在本 repository 獨立管理。

## 安裝

1. 在 Chrome 開啟 `chrome://extensions/`（Edge 使用 `edge://extensions/`）。
2. 啟用「開發人員模式」，選擇「載入未封裝項目」。
3. 選擇含本 README 與 manifest.json 的資料夾。
4. 開啟或重新整理一般 HTTP/HTTPS 網頁，選取文字後翻譯。不需 npm 安裝、編譯或 API Key。

本 repository 的本地目錄為 `EasyBrowserTools`，可與原 Open Chat Hub 及其拆分 worktree 並存。為避免顯示兩組選取工具列，測試時請停用原 Open Chat Hub。此擴充功能不會讀取或遷移原專案的資料。

## 開發

需要 Node.js 20 以上，無 npm 依賴。

```sh
npm test
npm run check
```

- `content/translate-popup.js`：由原專案抽出的選取事件、浮窗、複製與音訊播放；保留既有內嵌 Shadow DOM CSS／SVG。
- `translation-service.js`：Google 翻譯、方向判斷與 TTS；可單獨測試與替換 provider。
- `background.js`：MV3 訊息路由、右鍵入口與注入。
- `scripts/check.mjs`：語法、manifest 路徑與版本一致性檢查。
- `test/`：服務、訊息路由的隔離測試；不會呼叫真實第三方服務。
- `icons/`：暫沿用來源圖示，獨立品牌圖示可於後續開發替換。

## 權限與限制

`activeTab`／`scripting` 用於工具列與右鍵入口注入；`contextMenus` 提供右鍵選單。內容腳本在 HTTP/HTTPS 頁面運行以偵測選取，背景跨站請求僅允許 `https://translate.google.com/*`。不需要 storage、tabs、sidePanel、identity、offscreen 或 AI provider 網域權限。

chrome://、瀏覽器商店、瀏覽器 PDF 檢視器等受保護頁面不支援。自動工具列預設只在主框架運行；右鍵入口可在已授權注入的框架處理文字。單次最多 5,000 字。翻譯與朗讀需要網路，沿用來源的 Google 非官方端點，可能受服務變動或速率限制影響。

## 後續開發

- 自訂來源／目標語言及更精確的語言偵測。
- 翻譯 provider 介面、正式 API 與可選設定頁。
- 窄螢幕長文浮窗與鍵盤操作改善。
- 獨立品牌、圖示及商店發布準備。

## Changelog

### [1.0.0] - 2026-11-16

- 從 Open Chat Hub 的 `selection-translate` 拆分版本匯入選取翻譯、複製與朗讀。
- 建立獨立 repository、main 開發流程、README／AGENTS 與驗證紀錄。
- 統一 manifest、package 與內容腳本的獨立專案識別。

隱私說明見 [PRIVACY.md](PRIVACY.md)。原 README 標示 MIT，拆分程式沿用該授權聲明。
