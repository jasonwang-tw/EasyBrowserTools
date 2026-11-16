# 以純色 SVG 母稿輸出擴充功能 PNG；僅使用 Windows 內建 System.Drawing。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot = Split-Path -Parent $PSScriptRoot
$iconDirectory = Join-Path $iconRoot 'icons'
[xml]$iconSvg = Get-Content -LiteralPath (Join-Path $iconDirectory 'easy-browser-tools-yellow.svg') -Raw -Encoding UTF8
$iconMaster = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$iconCanvas = [System.Drawing.Graphics]::FromImage($iconMaster)
try {
    $iconCanvas.Clear([System.Drawing.Color]::Transparent)
    $iconCanvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $iconCanvas.ScaleTransform(8, 8)
    foreach ($iconElement in $iconSvg.svg.ChildNodes) {
        if ($iconElement.LocalName -ne 'path') { continue }
        $iconPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        try {
            $iconPath.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate
            $iconTokens = [regex]::Matches($iconElement.GetAttribute('d'), '[MLCZ]|-?\d+(?:\.\d+)?')
            $iconIndex = 0
            $iconX = 0.0
            $iconY = 0.0
            while ($iconIndex -lt $iconTokens.Count) {
                $iconCommand = $iconTokens[$iconIndex++].Value
                switch ($iconCommand) {
                    'M' {
                        $iconPath.StartFigure()
                        $iconX = [float]::Parse($iconTokens[$iconIndex++].Value, [cultureinfo]::InvariantCulture)
                        $iconY = [float]::Parse($iconTokens[$iconIndex++].Value, [cultureinfo]::InvariantCulture)
                    }
                    'L' {
                        $iconNextX = [float]::Parse($iconTokens[$iconIndex++].Value, [cultureinfo]::InvariantCulture)
                        $iconNextY = [float]::Parse($iconTokens[$iconIndex++].Value, [cultureinfo]::InvariantCulture)
                        $iconPath.AddLine($iconX, $iconY, $iconNextX, $iconNextY)
                        $iconX = $iconNextX
                        $iconY = $iconNextY
                    }
                    'C' {
                        $iconCurve = @()
                        for ($iconCoordinate = 0; $iconCoordinate -lt 6; $iconCoordinate++) {
                            $iconCurve += [float]::Parse($iconTokens[$iconIndex++].Value, [cultureinfo]::InvariantCulture)
                        }
                        $iconPath.AddBezier($iconX, $iconY, $iconCurve[0], $iconCurve[1], $iconCurve[2], $iconCurve[3], $iconCurve[4], $iconCurve[5])
                        $iconX = $iconCurve[4]
                        $iconY = $iconCurve[5]
                    }
                    'Z' { $iconPath.CloseFigure() }
                    default { throw "Unsupported SVG path command: $iconCommand" }
                }
            }
            if ($iconElement.GetAttribute('fill') -ne 'none') {
                $iconBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($iconElement.GetAttribute('fill')))
                try { $iconCanvas.FillPath($iconBrush, $iconPath) } finally { $iconBrush.Dispose() }
            }
            if ($iconElement.HasAttribute('stroke')) {
                $iconStrokeWidth = [float]::Parse($iconElement.GetAttribute('stroke-width'), [cultureinfo]::InvariantCulture)
                $iconPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($iconElement.GetAttribute('stroke')), $iconStrokeWidth)
                try {
                    $iconPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
                    if ($iconElement.GetAttribute('stroke-linecap') -eq 'round') {
                        $iconPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
                        $iconPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
                    }
                    $iconCanvas.DrawPath($iconPen, $iconPath)
                } finally { $iconPen.Dispose() }
            }
        } finally { $iconPath.Dispose() }
    }
    $iconMaster.Save((Join-Path $iconDirectory 'easy-browser-tools-yellow-master.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    foreach ($iconSize in @(16, 32, 48, 128)) {
        $iconBitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
        try {
            $iconGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $iconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $iconGraphics.DrawImage($iconMaster, (New-Object System.Drawing.Rectangle(0, 0, $iconSize, $iconSize)))
            $iconBitmap.Save((Join-Path $iconDirectory "easy-browser-tools-yellow-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $iconGraphics.Dispose(); $iconBitmap.Dispose() }
    }
} finally { $iconCanvas.Dispose(); $iconMaster.Dispose() }
Write-Output '已從純色 SVG 輸出母圖及 16／32／48／128 px PNG。'
