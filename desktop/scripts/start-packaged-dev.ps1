param(
  [switch]$Build
)

$ErrorActionPreference = 'Stop'

$desktopRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$exePath = Join-Path $desktopRoot 'dist\win-unpacked\Juice Journal.exe'

if ($Build) {
  Get-Process -Name 'Juice Journal' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $exePath } |
    Stop-Process -Force

  Push-Location $desktopRoot
  try {
    & npm.cmd run pack
    if ($LASTEXITCODE -ne 0) {
      throw "Packaged dev build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Packaged Juice Journal executable was not found: $exePath"
}

Start-Process -FilePath $exePath -ArgumentList '--dev'
Write-Host "Started packaged dev runtime: $exePath"
