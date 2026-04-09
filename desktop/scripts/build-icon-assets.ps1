param(
  [string]$SourcePng = (Join-Path $PSScriptRoot '..\src\assets\icon.png'),
  [string]$TargetIco = (Join-Path $PSScriptRoot '..\src\assets\icon.ico')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$iconSizes = @(16, 32, 48, 64, 128, 256)
$sourcePath = [System.IO.Path]::GetFullPath($SourcePng)
$targetPath = [System.IO.Path]::GetFullPath($TargetIco)
$targetDir = Split-Path -Parent $targetPath

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Source PNG not found: $sourcePath"
}

if (-not (Test-Path -LiteralPath $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir | Out-Null
}

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($sourcePath)

try {
  $iconEntries = New-Object System.Collections.Generic.List[object]

  foreach ($size in $iconSizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = New-Object System.IO.MemoryStream

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.DrawImage($sourceBitmap, 0, 0, $size, $size)

      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)

      $iconEntries.Add([PSCustomObject]@{
        Size = $size
        Bytes = $stream.ToArray()
      }) | Out-Null
    }
    finally {
      $graphics.Dispose()
      $bitmap.Dispose()
      $stream.Dispose()
    }
  }

  $fileStream = [System.IO.File]::Create($targetPath)
  $writer = New-Object System.IO.BinaryWriter($fileStream)

  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$iconEntries.Count)

    $offset = 6 + (16 * $iconEntries.Count)

    foreach ($entry in $iconEntries) {
      $sizeByte = if ($entry.Size -ge 256) { 0 } else { [byte]$entry.Size }

      $writer.Write([byte]$sizeByte)
      $writer.Write([byte]$sizeByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$offset)

      $offset += $entry.Bytes.Length
    }

    foreach ($entry in $iconEntries) {
      $writer.Write($entry.Bytes)
    }
  }
  finally {
    $writer.Dispose()
    $fileStream.Dispose()
  }
}
finally {
  $sourceBitmap.Dispose()
}
