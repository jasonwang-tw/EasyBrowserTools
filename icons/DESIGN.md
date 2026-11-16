# Easy Browser Tools 圖示

2026-11-16，版號維持 1.2.4。

依使用者指定改為一般 tools icon：暖黃色圓角底，搭配單一深色扳手。使用粗實心輪廓及簡單造型，方便在小尺寸工具列辨識。

色彩：底色 #F6C445，扳手 #302717；沒有漸層、陰影或紋理。

母稿為專案內自行繪製的 easy-browser-tools-yellow.svg，未使用外部圖庫或生成圖片。透過 Windows 內建 System.Drawing 輸出 1024 px 母圖與 16／32／48／128 px 透明 PNG。工具列、管理頁與截圖編輯彈窗均沿用黃色 PNG 路徑。

重建指令（Windows PowerShell，專案根目錄）：

```powershell
./scripts/render-icons.ps1
```

舊藍色資產保留但未引用。
