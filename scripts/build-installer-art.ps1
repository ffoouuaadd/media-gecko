$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectDirectory = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sourcePath = Join-Path $projectDirectory "assets\gecko-main.png"
$buildDirectory = Join-Path $projectDirectory "build"
New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null

$source = [System.Drawing.Image]::FromFile($sourcePath)
$offsets = @(0, -3, -6, -3, 0, 3, 6, 3)
$orange = [System.Drawing.Color]::FromArgb(255, 255, 104, 28)
$dark = [System.Drawing.Color]::FromArgb(255, 18, 18, 20)
$panel = [System.Drawing.Color]::FromArgb(255, 28, 28, 31)
$muted = [System.Drawing.Color]::FromArgb(255, 144, 144, 151)

for ($index = 0; $index -lt $offsets.Count; $index++) {
    $bitmap = New-Object System.Drawing.Bitmap 164, 314
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.Clear($dark)
    $graphics.FillRectangle((New-Object System.Drawing.SolidBrush $panel), 8, 8, 148, 298)
    $graphics.FillRectangle((New-Object System.Drawing.SolidBrush $orange), 8, 8, 148, 5)
    for ($y = 22; $y -lt 300; $y += 12) {
        for ($x = 16; $x -lt 154; $x += 12) {
            if ((($x + $y) / 12) % 2 -eq 0) { $graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 34, 38))), $x, $y, 3, 3) }
        }
    }
    $logoY = 69 + $offsets[$index]
    $graphics.DrawImage($source, 25, $logoY, 114, 114)
    $font = New-Object System.Drawing.Font "Segoe UI", 11, ([System.Drawing.FontStyle]::Bold)
    $smallFont = New-Object System.Drawing.Font "Consolas", 7, ([System.Drawing.FontStyle]::Regular)
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString("MEDIA GECKO", $font, (New-Object System.Drawing.SolidBrush $orange), (New-Object System.Drawing.RectangleF 8, 201, 148, 28), $center)
    $graphics.DrawString("SEARCH  PREVIEW  DRAG", $smallFont, (New-Object System.Drawing.SolidBrush $muted), (New-Object System.Drawing.RectangleF 8, 232, 148, 18), $center)
    $heights = @(8, 16, 25, 16, 8)
    for ($bar = 0; $bar -lt $heights.Count; $bar++) {
        $height = $heights[$bar] + ($(if ($bar -eq ($index % 5)) { 5 } else { 0 }))
        $graphics.FillRectangle((New-Object System.Drawing.SolidBrush $orange), 57 + ($bar * 11), 278 - [int]($height / 2), 6, $height)
    }
    $pngPath = Join-Path $buildDirectory ("installer-gecko-{0:D2}.png" -f $index)
    $bmpPath = Join-Path $buildDirectory ("installer-gecko-{0:D2}.bmp" -f $index)
    $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Save($bmpPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    if ($index -eq 0) { $bitmap.Save((Join-Path $buildDirectory "installer-gecko-sidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp) }
    $center.Dispose(); $font.Dispose(); $smallFont.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$source.Dispose()

$ffmpeg = Join-Path $projectDirectory "tools\ffmpeg.exe"
if (Test-Path -LiteralPath $ffmpeg) {
    & $ffmpeg -hide_banner -loglevel error -y -framerate 8 -i (Join-Path $buildDirectory "installer-gecko-%02d.png") -vf "scale=164:314:flags=lanczos" -loop 0 (Join-Path $buildDirectory "installer-gecko.gif")
}

Write-Host "Installer Gecko animation built in $buildDirectory"
