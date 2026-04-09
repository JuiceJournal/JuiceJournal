# Desktop Icon Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy PoeFarm-era desktop icon assets with a new Juice Journal journal-plus-Divine-Orb icon that stays on the current dark-and-gold palette and is reproducible from source.

**Architecture:** Keep the implementation local and deterministic. Add a source manifest for the approved icon direction, a PowerShell renderer that draws the icon with Windows-native `System.Drawing`, and a verification script that checks the generated `png`, `ico`, and tray assets before the desktop package uses them.

**Tech Stack:** Electron, PowerShell, System.Drawing, Windows `.ico` container generation, npm scripts

---

### Task 1: Add an asset verification gate before changing the icon

**Files:**
- Create: `desktop/scripts/test-icon-assets.ps1`
- Test: `desktop/src/assets/icon-source.json`
- Test: `desktop/src/assets/icon.png`
- Test: `desktop/src/assets/icon.ico`
- Test: `desktop/src/assets/tray-icon.png`

- [ ] **Step 1: Write the failing verification script**

```powershell
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'src/assets/icon-source.json'
$iconPngPath = Join-Path $root 'src/assets/icon.png'
$iconIcoPath = Join-Path $root 'src/assets/icon.ico'
$trayPath = Join-Path $root 'src/assets/tray-icon.png'

if (-not (Test-Path $manifestPath)) {
  throw "Missing icon source manifest: $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

if ($manifest.name -ne 'juice-journal-desktop-icon') {
  throw "Unexpected icon manifest name: $($manifest.name)"
}

if ($manifest.motif -ne 'closed-journal-divine-orb') {
  throw "Unexpected icon motif: $($manifest.motif)"
}

foreach ($path in @($iconPngPath, $iconIcoPath, $trayPath)) {
  if (-not (Test-Path $path)) {
    throw "Missing generated icon asset: $path"
  }
}

$iconPng = [System.Drawing.Image]::FromFile($iconPngPath)
try {
  if ($iconPng.Width -ne 1024 -or $iconPng.Height -ne 1024) {
    throw "icon.png must be 1024x1024, got $($iconPng.Width)x$($iconPng.Height)"
  }
} finally {
  $iconPng.Dispose()
}

$trayPng = [System.Drawing.Image]::FromFile($trayPath)
try {
  if ($trayPng.Width -ne 32 -or $trayPng.Height -ne 32) {
    throw "tray-icon.png must be 32x32, got $($trayPng.Width)x$($trayPng.Height)"
  }
} finally {
  $trayPng.Dispose()
}

$icoBytes = [System.IO.File]::ReadAllBytes($iconIcoPath)
if ($icoBytes.Length -lt 22) {
  throw "icon.ico is too small to contain a valid header"
}

if ($icoBytes[0] -ne 0 -or $icoBytes[1] -ne 0 -or $icoBytes[2] -ne 1 -or $icoBytes[3] -ne 0) {
  throw "icon.ico does not have a valid ICO header"
}

Write-Host 'PASS: icon assets validated'
```

- [ ] **Step 2: Run the verification script to confirm it fails before implementation**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File desktop/scripts/test-icon-assets.ps1`

Expected: FAIL with `Missing icon source manifest`

- [ ] **Step 3: Commit the failing test scaffold**

```bash
git add desktop/scripts/test-icon-assets.ps1
git commit -m "test(desktop): add icon asset verification script"
```

### Task 2: Add the new icon source manifest and deterministic icon renderer

**Files:**
- Create: `desktop/src/assets/icon-source.json`
- Create: `desktop/scripts/build-icon-assets.ps1`
- Modify: `desktop/package.json`
- Modify: `desktop/src/assets/icon.png`
- Modify: `desktop/src/assets/icon.ico`
- Modify: `desktop/src/assets/tray-icon.png`
- Test: `desktop/scripts/test-icon-assets.ps1`

- [ ] **Step 1: Add the icon source manifest**

```json
{
  "name": "juice-journal-desktop-icon",
  "version": 1,
  "motif": "closed-journal-divine-orb",
  "style": "modern-app-icon",
  "palette": {
    "bgOuter": "#0f0c0a",
    "bgInner": "#181310",
    "bgHighlight": "#2b2018",
    "journalBody": "#211913",
    "journalSpine": "#130f0c",
    "journalEdge": "#3a2c20",
    "gold": "#c6a15b",
    "goldLight": "#e8c98d",
    "goldShadow": "#8c6a39",
    "shadow": "#080706"
  },
  "surfaces": {
    "appIconSize": 1024,
    "trayIconSize": 32
  }
}
```

- [ ] **Step 2: Add the deterministic renderer that draws the approved icon and writes `png` + `ico` outputs**

```powershell
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root 'src/assets'
$manifestPath = Join-Path $assetDir 'icon-source.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

function New-Color([string]$hex, [int]$alpha = 255) {
  $clean = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    $alpha,
    [Convert]::ToInt32($clean.Substring(0, 2), 16),
    [Convert]::ToInt32($clean.Substring(2, 2), 16),
    [Convert]::ToInt32($clean.Substring(4, 2), 16)
  )
}

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2

  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function Add-OrbSpoke([System.Drawing.Drawing2D.GraphicsPath]$path, [float]$cx, [float]$cy, [float]$innerRadius, [float]$outerRadius, [float]$angleDegrees, [float]$spreadDegrees) {
  $angle = [Math]::PI * $angleDegrees / 180
  $spread = [Math]::PI * $spreadDegrees / 180

  $points = New-Object System.Drawing.PointF[] 4
  $points[0] = [System.Drawing.PointF]::new(
    ($cx + [Math]::Cos($angle - $spread) * $innerRadius),
    ($cy + [Math]::Sin($angle - $spread) * $innerRadius)
  )
  $points[1] = [System.Drawing.PointF]::new(
    ($cx + [Math]::Cos($angle) * $outerRadius),
    ($cy + [Math]::Sin($angle) * $outerRadius)
  )
  $points[2] = [System.Drawing.PointF]::new(
    ($cx + [Math]::Cos($angle + $spread) * $innerRadius),
    ($cy + [Math]::Sin($angle + $spread) * $innerRadius)
  )
  $points[3] = [System.Drawing.PointF]::new(
    ($cx + [Math]::Cos($angle) * ($innerRadius - 22)),
    ($cy + [Math]::Sin($angle) * ($innerRadius - 22))
  )

  $path.AddPolygon($points)
}

function New-ArgbBitmap([int]$size) {
  return New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Get-PngBytes([System.Drawing.Bitmap]$bitmap) {
  $stream = New-Object System.IO.MemoryStream
  try {
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return $stream.ToArray()
  } finally {
    $stream.Dispose()
  }
}

function Resize-Bitmap([System.Drawing.Bitmap]$source, [int]$size) {
  $target = New-ArgbBitmap $size
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($source, 0, 0, $size, $size)
  } finally {
    $graphics.Dispose()
  }

  return $target
}

function Write-Ico([System.Collections.Generic.List[object]]$frames, [string]$path) {
  $file = [System.IO.File]::Open($path, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($file)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$frames.Count)

    $offset = 6 + (16 * $frames.Count)

    foreach ($frame in $frames) {
      $size = [int]$frame.Size
      $bytes = [byte[]]$frame.Bytes

      $entrySize = if ($size -ge 256) { 0 } else { $size }
      $writer.Write([byte]$entrySize)
      $writer.Write([byte]$entrySize)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$bytes.Length)
      $writer.Write([UInt32]$offset)

      $offset += $bytes.Length
    }

    foreach ($frame in $frames) {
      $writer.Write([byte[]]$frame.Bytes)
    }
  } finally {
    $writer.Dispose()
    $file.Dispose()
  }
}

$palette = $manifest.palette
$appSize = [int]$manifest.surfaces.appIconSize
$traySize = [int]$manifest.surfaces.trayIconSize

$bgOuter = New-Color $palette.bgOuter
$bgInner = New-Color $palette.bgInner
$bgHighlight = New-Color $palette.bgHighlight
$journalBody = New-Color $palette.journalBody
$journalSpine = New-Color $palette.journalSpine
$journalEdge = New-Color $palette.journalEdge
$gold = New-Color $palette.gold
$goldLight = New-Color $palette.goldLight
$goldShadow = New-Color $palette.goldShadow
$shadow = New-Color $palette.shadow

$icon = New-ArgbBitmap $appSize
$graphics = [System.Drawing.Graphics]::FromImage($icon)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $tilePath = New-RoundedPath 48 48 928 928 220
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(96, 48)),
    ([System.Drawing.PointF]::new(928, 976)),
    $bgHighlight,
    $bgOuter
  )
  $graphics.FillPath($bgBrush, $tilePath)

  $vignetteBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($tilePath)
  $vignetteBrush.CenterColor = [System.Drawing.Color]::FromArgb(0, $bgInner)
  $vignetteBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(140, $shadow))
  $graphics.FillPath($vignetteBrush, $tilePath)

  $tileOutline = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, $gold), 6)
  $graphics.DrawPath($tileOutline, $tilePath)

  $journalShadow = New-RoundedPath 198 192 612 676 92
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, $shadow))
  $graphics.TranslateTransform(18, 22)
  $graphics.FillPath($shadowBrush, $journalShadow)
  $graphics.ResetTransform()

  $journalPath = New-RoundedPath 180 170 612 676 92
  $journalBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(180, 170)),
    ([System.Drawing.PointF]::new(792, 846)),
    $journalEdge,
    $journalBody
  )
  $graphics.FillPath($journalBrush, $journalPath)

  $spinePath = New-RoundedPath 180 170 102 676 92
  $spineBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(180, 170)),
    ([System.Drawing.PointF]::new(282, 846)),
    $journalSpine,
    $journalEdge
  )
  $graphics.FillPath($spineBrush, $spinePath)

  $pageEdgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(36, 255, 255, 255))
  $graphics.FillRectangle($pageEdgeBrush, 720, 226, 24, 560)
  $graphics.FillRectangle($pageEdgeBrush, 290, 218, 386, 14)

  $journalOutline = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, $goldShadow), 4)
  $graphics.DrawPath($journalOutline, $journalPath)

  $strapPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(110, $goldShadow), 16)
  $graphics.DrawLine($strapPen, 300, 330, 672, 330)

  $orbCenterX = 486
  $orbCenterY = 500
  $orbOuter = 150
  $orbInner = 102

  $orbGlowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34, $goldLight))
  $graphics.FillEllipse($orbGlowBrush, $orbCenterX - 196, $orbCenterY - 196, 392, 392)

  $orbOuterBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(($orbCenterX - $orbOuter), ($orbCenterY - $orbOuter))),
    ([System.Drawing.PointF]::new(($orbCenterX + $orbOuter), ($orbCenterY + $orbOuter))),
    $goldLight,
    $goldShadow
  )
  $graphics.FillEllipse($orbOuterBrush, $orbCenterX - $orbOuter, $orbCenterY - $orbOuter, $orbOuter * 2, $orbOuter * 2)

  $spokePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  foreach ($angle in @(0, 45, 90, 135, 180, 225, 270, 315)) {
    Add-OrbSpoke $spokePath $orbCenterX $orbCenterY $orbInner $($orbOuter + 32) $angle 9
  }
  $spokeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(($orbCenterX - 120), ($orbCenterY - 120))),
    ([System.Drawing.PointF]::new(($orbCenterX + 120), ($orbCenterY + 120))),
    $goldLight,
    $gold
  )
  $graphics.FillPath($spokeBrush, $spokePath)

  $orbInnerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(($orbCenterX - $orbInner), ($orbCenterY - $orbInner))),
    ([System.Drawing.PointF]::new(($orbCenterX + $orbInner), ($orbCenterY + $orbInner))),
    [System.Drawing.Color]::FromArgb(255, 37, 29, 22),
    [System.Drawing.Color]::FromArgb(255, 18, 13, 10)
  )
  $graphics.FillEllipse($orbInnerBrush, $orbCenterX - $orbInner, $orbCenterY - $orbInner, $orbInner * 2, $orbInner * 2)

  $orbRingPen = New-Object System.Drawing.Pen($goldLight, 14)
  $graphics.DrawEllipse($orbRingPen, $orbCenterX - ($orbInner + 18), $orbCenterY - ($orbInner + 18), ($orbInner + 18) * 2, ($orbInner + 18) * 2)

  $orbCoreBrush = New-Object System.Drawing.SolidBrush($gold)
  $graphics.FillEllipse($orbCoreBrush, $orbCenterX - 36, $orbCenterY - 36, 72, 72)

  $highlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, $goldLight), 8)
  $graphics.DrawArc($highlightPen, 100, 84, 560, 560, 198, 42)

  $cornerGlowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, $goldLight))
  $graphics.FillEllipse($cornerGlowBrush, 660, 110, 190, 190)
} finally {
  $graphics.Dispose()
}

$iconPngPath = Join-Path $assetDir 'icon.png'
$trayPngPath = Join-Path $assetDir 'tray-icon.png'
$iconIcoPath = Join-Path $assetDir 'icon.ico'

Save-Png $icon $iconPngPath

$trayBitmap = Resize-Bitmap $icon $traySize
Save-Png $trayBitmap $trayPngPath

$frames = New-Object 'System.Collections.Generic.List[object]'
foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
  $frameBitmap = Resize-Bitmap $icon $size
  try {
    $frames.Add([PSCustomObject]@{
      Size = $size
      Bytes = Get-PngBytes $frameBitmap
    })
  } finally {
    $frameBitmap.Dispose()
  }
}

Write-Ico $frames $iconIcoPath

$trayBitmap.Dispose()
$icon.Dispose()

Write-Host "Built desktop icon assets at $assetDir"
```

- [ ] **Step 3: Wire the renderer and verifier into `desktop/package.json`**

```json
{
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "pack": "electron-builder --dir",
    "icon:build": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-icon-assets.ps1",
    "icon:test": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-icon-assets.ps1",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

- [ ] **Step 4: Generate the new assets and verify they pass**

Run: `cd desktop; npm run icon:build; npm run icon:test`

Expected:
- `icon.png` regenerated at `1024x1024`
- `tray-icon.png` regenerated at `32x32`
- `icon.ico` regenerated with a valid ICO header
- `PASS: icon assets validated`

- [ ] **Step 5: Commit the renderer, manifest, package script updates, and generated assets**

```bash
git add desktop/scripts/build-icon-assets.ps1 desktop/scripts/test-icon-assets.ps1 desktop/package.json desktop/src/assets/icon-source.json desktop/src/assets/icon.png desktop/src/assets/icon.ico desktop/src/assets/tray-icon.png
git commit -m "feat(desktop): refresh application icon assets"
```

### Task 3: Document the icon workflow and run packaging smoke checks

**Files:**
- Modify: `desktop/README.md`
- Test: `desktop/main.js`
- Test: `desktop/package.json`

- [ ] **Step 1: Add a short maintenance section to `desktop/README.md`**

````markdown
## Icon Assets

The desktop icon assets are generated from `src/assets/icon-source.json`.

To rebuild them after changing the icon design:

```bash
npm run icon:build
npm run icon:test
```

Generated files:
- `src/assets/icon.png`
- `src/assets/icon.ico`
- `src/assets/tray-icon.png`
````

- [ ] **Step 2: Verify the desktop runtime still points at the regenerated assets**

Run: `Select-String -Path desktop/main.js,desktop/package.json -Pattern 'icon.ico|icon.png|tray-icon.png'`

Expected:
- `desktop/main.js` still references `src/assets/icon.ico`
- `desktop/main.js` still references `src/assets/icon.png`
- `desktop/main.js` still references `src/assets/tray-icon.png`
- `desktop/package.json` still uses `src/assets/icon.ico` for Windows packaging

- [ ] **Step 3: Run a Windows packaging smoke check**

Run: `cd desktop; npm run build:win`

Expected:
- Electron Builder completes without missing-icon errors
- the generated installer metadata resolves the refreshed `icon.ico`

- [ ] **Step 4: Commit the README update after the smoke check passes**

```bash
git add desktop/README.md
git commit -m "docs(desktop): document icon asset workflow"
```

## Self-Review

### Spec Coverage

- Palette retention: covered by `desktop/src/assets/icon-source.json`
- Journal + Divine Orb motif: covered by `desktop/scripts/build-icon-assets.ps1`
- Desktop scope: covered by changes only under `desktop/`
- PNG/ICO asset generation: covered by the renderer task
- Legibility verification: covered by `desktop/scripts/test-icon-assets.ps1`
- Existing Electron wiring verification: covered by the smoke-check task

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation language remains.
- Every file path is explicit.
- Every command includes an expected result.

### Type Consistency

- `juice-journal-desktop-icon` and `closed-journal-divine-orb` are used consistently across the manifest and verifier.
- `icon:build` and `icon:test` are the same script names referenced in implementation and docs.
