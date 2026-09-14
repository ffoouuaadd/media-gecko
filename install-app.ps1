$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pnpm = "C:\Users\PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
Set-Location $projectDirectory
if (-not (Test-Path -LiteralPath $pnpm)) { throw "Bundled pnpm was not found." }
& $pnpm install
Write-Host "Media Gecko installed. Run start-app.cmd"
