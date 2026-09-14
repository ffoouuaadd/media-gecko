$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsDirectory = Join-Path $projectDirectory "tools"
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("sound-grabber-" + [guid]::NewGuid())

New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null

try {
    Write-Host "Downloading yt-dlp..."
    Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile (Join-Path $toolsDirectory "yt-dlp.exe")

    Write-Host "Downloading FFmpeg..."
    $ffmpegArchive = Join-Path $temporaryDirectory "ffmpeg.zip"
    Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $ffmpegArchive
    Expand-Archive -LiteralPath $ffmpegArchive -DestinationPath $temporaryDirectory -Force
    $ffmpeg = Get-ChildItem -Path $temporaryDirectory -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
    $ffprobe = Get-ChildItem -Path $temporaryDirectory -Filter "ffprobe.exe" -Recurse | Select-Object -First 1
    Copy-Item -LiteralPath $ffmpeg.FullName -Destination (Join-Path $toolsDirectory "ffmpeg.exe") -Force
    Copy-Item -LiteralPath $ffprobe.FullName -Destination (Join-Path $toolsDirectory "ffprobe.exe") -Force
    Write-Host "Media Gecko tools ready. Run start-app.cmd"
}
finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}
