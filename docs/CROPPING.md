# 本機裁切與社群尺寸（1.8.0）

## 已確認需求（2026-11-18）

- 截圖及匯入圖片皆可再次裁切；同頁 daisyUI 裁切 dialog，不新增頁籤。
- 比例包含自由、原比例、1:1、4:3／3:4、16:9／9:16、3:2／2:3、4:5／5:4；可切直／橫。
- 第一版形狀只有矩形、圓角矩形、正圓。正圓鎖定 1:1；非正方形固定尺寸不能輸出正圓，需更換尺寸。
- 社群第一版包含 Facebook、Instagram、Threads、YouTube、X、LinkedIn、LINE，依平台與用途分組。
- 社群預設固定像素輸出；使用者詢問小圖處理，另明確選擇「允許放大，套用前提示可能變模糊」。在套用前顯示裁切原像素、目標尺寸、放大倍率；一般縮放不新增細節、不含 AI 擴圖。自由裁切可保留選區像素。
- 保留標註為向量，套用裁切後仍可編輯；復原須還原圖片範圍、尺寸、形狀、標註位置及去背預覽。新標註也遵守形狀遮罩。
- 原始匯入檔不覆寫；同一視窗保留原圖與裁切配方，不將每一步完整像素堆入歷史。換圖／關閉釋放；裁切深度上限 20，單圖／輸出延續 1600 萬像素與單邊 16384px 上限。

## 選型與設計

已比較 Cropper.js（約 13.9k stars，MIT）與 Filerobot Image Editor（約 1.9k，MIT）。前者原生 JS、專注裁切、有比例與形狀圓角選區；後者完整編輯器，與既有標註重疊且帶入 React 生態，成本較高。採固定 Cropper.js 2.3.1 本機 dependency-free 瀏覽器 ESM，tarball integrity 與 SHA-256 記錄於 vendor/cropper/sources.json；保留 MIT，不載 CDN。

沿用既定 daisyUI 5.8.1、暖黃、深淺色、字體及短淡入／reduced-motion。裁切框隨滑鼠即時反應，不加拖延動畫。尺寸與形狀為 select，輸出寬高為 input，套用／取消為 btn；裁切 dialog 管理鍵盤焦點、Esc、關閉與返回入口。第三方框選只負責 UI；原圖、向量、遮罩與匯出由本機裁切配方管理，不壓平標註。

## 平台尺寸來源與界線

核對日期 2026-11-18。X 大頭貼 400×400／封面 1500×500 為官方建議；YouTube 橫幅 2560×1440 為官方建議，官方以最小尺寸 2048×1152 的中央 1235×338 指定文字安全區；安全框按比例換算並標記僅為參考、不寫入輸出。LinkedIn 公司頁封面採目前官方 1512×256，不沿用舊 1128×191。

- X：https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo
- YouTube：https://support.google.com/youtube/answer/10456525
- LinkedIn 公司頁：https://www.linkedin.com/help/linkedin/answer/a563309
- LinkedIn 個人封面：https://www.linkedin.com/help/recruiter/answer/a549049
- LINE 圖文選單：https://developers.line.biz/en/docs/messaging-api/using-rich-menus/
- Meta／Instagram 官方說明本次受登入／429 限制；未核實項目不可標示為官方尺寸。其餘正方形／直式／封面等標為「PageKit 常用範本」，可自訂；不宣稱平台僅接受單一尺寸。LINE 區分一般大頭貼／圖片範本與官方帳號圖文選單，不將已廢止的 Timeline 封面尺寸當成目前通用規範。
- 預設資料須包含類型、來源與核對日期；尺寸是輸出預設，不會登入／上傳／發文。PNG 檔案容量仍依內容而定，不能保證滿足平台 MB 上限。

## 資料與驗收

- 對乾淨工作圖裁切；OCR／色票讀裁切後乾淨工作圖，不含標註／去背。裁切、裁切復原／重做後清除舊 OCR／譯文並依既有流程重新辨識。
- 去背預覽與乾淨工作圖套用相同座標及形狀；還原背景維持目前裁切，裁切復原可回到先前去背預覽。
- 測試比例、固定尺寸、小圖提示、形狀透明像素、跨步裁切／復原／重做、文字與編號仍可選取編輯、原圖與向量座標、尺寸限制、取消與失敗不變更原圖、模組／權限、深淺色／320px、剪貼簿與 PNG。

AI 延伸圖片與送至 AI App 仍屬另外評估，沒有納入裁切版本，亦不自動下載任何模型或傳送圖片。

## AI App 擴圖延伸評估（尚未實作）

可沿用「圖片＋輸入文字送至 AI App」概念，加入目標比例／尺寸、原圖在新畫布的位置，以及延伸背景的描述。乾淨原圖為編輯來源，標註圖可作第二張指示參考；不要讓箭頭、編號與圈選直接成為要保留的成品內容。需要精確保留原圖時，後續須提供遮罩或在本機合成回原圖，不能只靠文字保證像素不變。

目的地須支援圖片編輯／擴圖；能接收圖片進行分析，不代表能產生新圖片。第一階段可提供圖片與指令的手動交接，生成後再匯入；自動填入既有對話、自動送出與結果回傳，要逐一確認目標 App 的正式介面、權限和穩定性，不能先宣稱 Codex Cloud 等所有 App 都支援。雲端處理會傳送使用者選定的圖片；若要求全程本機，須另外評估本機擴圖服務及硬體資源。

參考：[Diffusers outpainting](https://huggingface.co/docs/diffusers/advanced_inference/outpaint)、[OpenAI 圖片編輯介面](https://developers.openai.com/api/docs/guides/image-generation)。以上僅供可行性評估，API 能力不等同於對話 App 的可用串接能力。
