# 頁匣 PageKit 圖示

2026-11-17，隨 1.2.12 更名為 PageKit；沿用截圖與文 A 圖案。

依使用者指定改為截圖與翻譯圖示：暖黃色圓角底，四個深色框選角代表截圖，中央「文」在左上、「A」在右下交錯重疊。前方 A 周圍留同底色細邊，避免重疊筆畫黏成一塊。

色彩：底色 #F6C445，框選角與文字 #302717；沒有漸層、陰影或紋理。

母稿為專案內的 pagekit.svg：框選角使用簡潔圓頭線條，「文」由 Windows Microsoft JhengHei 粗體、「A」由 Segoe UI 粗體轉成固定向量路徑。SVG 不需外部字型或圖片，避免不同電腦缺字或排版變動。透過 Windows 內建 System.Drawing 輸出 1024 px 母圖與 16／32／48／128 px PNG，圓角底外保留透明。工具列、管理頁與截圖編輯彈窗均沿用黃色 PNG 路徑。

重建指令（Windows PowerShell，專案根目錄）：

```powershell
./scripts/render-icons.ps1
```

舊藍色資產保留但未引用。
