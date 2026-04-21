param(
  [switch]$Poe1,
  [switch]$Poe2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$desktopDir = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $desktopDir 'src/assets/characters'
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) 'juice-journal-ascendancy-art'

if (-not $Poe1 -and -not $Poe2) {
  $Poe1 = $true
  $Poe2 = $true
}

$poe1Entries = @(
  @{ Slug = 'slayer'; DisplayName = 'Slayer'; BaseSlug = 'duelist'; BaseLabel = 'Duelist'; WikiTitle = 'Slayer' },
  @{ Slug = 'gladiator'; DisplayName = 'Gladiator'; BaseSlug = 'duelist'; BaseLabel = 'Duelist'; WikiTitle = 'Gladiator' },
  @{ Slug = 'champion'; DisplayName = 'Champion'; BaseSlug = 'duelist'; BaseLabel = 'Duelist'; WikiTitle = 'Champion' },
  @{ Slug = 'assassin'; DisplayName = 'Assassin'; BaseSlug = 'shadow'; BaseLabel = 'Shadow'; WikiTitle = 'Assassin' },
  @{ Slug = 'saboteur'; DisplayName = 'Saboteur'; BaseSlug = 'shadow'; BaseLabel = 'Shadow'; WikiTitle = 'Saboteur' },
  @{ Slug = 'trickster'; DisplayName = 'Trickster'; BaseSlug = 'shadow'; BaseLabel = 'Shadow'; WikiTitle = 'Trickster' },
  @{ Slug = 'juggernaut'; DisplayName = 'Juggernaut'; BaseSlug = 'marauder'; BaseLabel = 'Marauder'; WikiTitle = 'Juggernaut' },
  @{ Slug = 'berserker'; DisplayName = 'Berserker'; BaseSlug = 'marauder'; BaseLabel = 'Marauder'; WikiTitle = 'Berserker' },
  @{ Slug = 'chieftain'; DisplayName = 'Chieftain'; BaseSlug = 'marauder'; BaseLabel = 'Marauder'; WikiTitle = 'Chieftain' },
  @{ Slug = 'necromancer'; DisplayName = 'Necromancer'; BaseSlug = 'witch'; BaseLabel = 'Witch'; WikiTitle = 'Necromancer' },
  @{ Slug = 'occultist'; DisplayName = 'Occultist'; BaseSlug = 'witch'; BaseLabel = 'Witch'; WikiTitle = 'Occultist' },
  @{ Slug = 'elementalist'; DisplayName = 'Elementalist'; BaseSlug = 'witch'; BaseLabel = 'Witch'; WikiTitle = 'Elementalist' },
  @{ Slug = 'deadeye'; DisplayName = 'Deadeye'; BaseSlug = 'ranger'; BaseLabel = 'Ranger'; WikiTitle = 'Deadeye' },
  @{ Slug = 'warden'; DisplayName = 'Warden'; BaseSlug = 'ranger'; BaseLabel = 'Ranger'; WikiTitle = 'Warden' },
  @{ Slug = 'pathfinder'; DisplayName = 'Pathfinder'; BaseSlug = 'ranger'; BaseLabel = 'Ranger'; WikiTitle = 'Pathfinder' },
  @{ Slug = 'inquisitor'; DisplayName = 'Inquisitor'; BaseSlug = 'templar'; BaseLabel = 'Templar'; WikiTitle = 'Inquisitor' },
  @{ Slug = 'hierophant'; DisplayName = 'Hierophant'; BaseSlug = 'templar'; BaseLabel = 'Templar'; WikiTitle = 'Hierophant' },
  @{ Slug = 'guardian'; DisplayName = 'Guardian'; BaseSlug = 'templar'; BaseLabel = 'Templar'; WikiTitle = 'Guardian' },
  @{ Slug = 'ascendant'; DisplayName = 'Ascendant'; BaseSlug = 'scion'; BaseLabel = 'Scion'; WikiTitle = 'Ascendant' },
  @{ Slug = 'reliquarian'; DisplayName = 'Reliquarian'; BaseSlug = 'scion'; BaseLabel = 'Scion'; WikiTitle = 'Reliquarian' }
)

$poe2Entries = @(
  @{ Slug = 'stormweaver'; DisplayName = 'Stormweaver'; BaseSlug = 'sorceress'; BaseLabel = 'Sorceress'; WikiTitle = 'Stormweaver'; PortraitUrl = 'https://www.poe2wiki.net/images/1/19/Stormweaver_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/f/f3/Stormweaver_official_art.jpg' },
  @{ Slug = 'chronomancer'; DisplayName = 'Chronomancer'; BaseSlug = 'sorceress'; BaseLabel = 'Sorceress'; WikiTitle = 'Chronomancer'; PortraitUrl = 'https://www.poe2wiki.net/images/1/1e/Chronomancer_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/2/22/Chronomancer_official_art.jpg' },
  @{ Slug = 'titan'; DisplayName = 'Titan'; BaseSlug = 'warrior'; BaseLabel = 'Warrior'; WikiTitle = 'Titan'; PortraitUrl = 'https://www.poe2wiki.net/images/d/dc/Titan_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/f/f9/Titan_official_art.jpg' },
  @{ Slug = 'warbringer'; DisplayName = 'Warbringer'; BaseSlug = 'warrior'; BaseLabel = 'Warrior'; WikiTitle = 'Warbringer'; PortraitUrl = 'https://www.poe2wiki.net/images/f/ff/Warbringer_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/6/67/Warbringer_official_art.jpg' },
  @{ Slug = 'smith-of-kitava'; DisplayName = 'Smith of Kitava'; BaseSlug = 'warrior'; BaseLabel = 'Warrior'; WikiTitle = 'Smith_of_Kitava'; PortraitUrl = 'https://www.poe2wiki.net/images/c/c1/Smith_of_Kitava_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/b/b3/Smith_of_Kitava_official_art.jpg' },
  @{ Slug = 'deadeye'; DisplayName = 'Deadeye'; BaseSlug = 'ranger'; BaseLabel = 'Ranger'; WikiTitle = 'Deadeye'; PortraitUrl = 'https://www.poe2wiki.net/images/d/d4/Deadeye_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/1/1e/Deadeye_official_art.jpg' },
  @{ Slug = 'pathfinder'; DisplayName = 'Pathfinder'; BaseSlug = 'ranger'; BaseLabel = 'Ranger'; WikiTitle = 'Pathfinder'; PortraitUrl = 'https://www.poe2wiki.net/images/c/c4/Pathfinder_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/4/4d/Pathfinder_official_art.jpg' },
  @{ Slug = 'blood-mage'; DisplayName = 'Blood Mage'; BaseSlug = 'witch'; BaseLabel = 'Witch'; WikiTitle = 'Blood_Mage'; PortraitUrl = 'https://www.poe2wiki.net/images/d/da/Blood_Mage_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/8/80/Blood_Mage_official_art.jpg' },
  @{ Slug = 'infernalist'; DisplayName = 'Infernalist'; BaseSlug = 'witch'; BaseLabel = 'Witch'; WikiTitle = 'Infernalist'; PortraitUrl = 'https://www.poe2wiki.net/images/8/86/Infernalist_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/c/c2/Infernalist_official_art.jpg' },
  @{ Slug = 'lich'; DisplayName = 'Lich'; BaseSlug = 'witch'; BaseLabel = 'Witch'; WikiTitle = 'Lich'; PortraitUrl = 'https://www.poe2wiki.net/images/5/5c/Lich_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/4/4d/Lich_official_art.jpg' },
  @{ Slug = 'witchhunter'; DisplayName = 'Witchhunter'; BaseSlug = 'mercenary'; BaseLabel = 'Mercenary'; WikiTitle = 'Witchhunter'; PortraitUrl = 'https://www.poe2wiki.net/images/6/61/Witchhunter_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/5/5d/Witchhunter_official_art.jpg' },
  @{ Slug = 'gemling-legionnaire'; DisplayName = 'Gemling Legionnaire'; BaseSlug = 'mercenary'; BaseLabel = 'Mercenary'; WikiTitle = 'Gemling_Legionnaire'; PortraitUrl = 'https://www.poe2wiki.net/images/2/25/Gemling_Legionnaire_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/b/b8/Gemling_Legionnaire_official_art.jpg' },
  @{ Slug = 'tactician'; DisplayName = 'Tactician'; BaseSlug = 'mercenary'; BaseLabel = 'Mercenary'; WikiTitle = 'Tactician'; PortraitUrl = 'https://www.poe2wiki.net/images/1/1f/Tactician_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/b/b3/Tactician_official_art.jpg' },
  @{ Slug = 'invoker'; DisplayName = 'Invoker'; BaseSlug = 'monk'; BaseLabel = 'Monk'; WikiTitle = 'Invoker'; PortraitUrl = 'https://www.poe2wiki.net/images/a/a2/Invoker_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/9/97/Invoker_official_art.jpg' },
  @{ Slug = 'acolyte-of-chayula'; DisplayName = 'Acolyte of Chayula'; BaseSlug = 'monk'; BaseLabel = 'Monk'; WikiTitle = 'Acolyte_of_Chayula'; PortraitUrl = 'https://www.poe2wiki.net/images/9/9f/Acolyte_of_Chayula_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/1/16/Acolyte_of_Chayula_official_art.jpg' },
  @{ Slug = 'amazon'; DisplayName = 'Amazon'; BaseSlug = 'huntress'; BaseLabel = 'Huntress'; WikiTitle = 'Amazon'; PortraitUrl = 'https://www.poe2wiki.net/images/d/d3/Amazon_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/a/a8/Amazon_official_art.jpg' },
  @{ Slug = 'ritualist'; DisplayName = 'Ritualist'; BaseSlug = 'huntress'; BaseLabel = 'Huntress'; WikiTitle = 'Ritualist'; PortraitUrl = 'https://www.poe2wiki.net/images/3/39/Ritualist_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/f/fa/Ritualist_official_art.jpg' },
  @{ Slug = 'oracle'; DisplayName = 'Oracle'; BaseSlug = 'druid'; BaseLabel = 'Druid'; WikiTitle = 'Oracle'; PortraitUrl = 'https://www.poe2wiki.net/images/c/c2/Oracle_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/f/fb/Oracle_official_art.jpg' },
  @{ Slug = 'shaman'; DisplayName = 'Shaman'; BaseSlug = 'druid'; BaseLabel = 'Druid'; WikiTitle = 'Shaman'; PortraitUrl = 'https://www.poe2wiki.net/images/3/30/Shaman_portrait.png'; BannerUrl = 'https://www.poe2wiki.net/images/9/98/Shaman_official_art.jpg' }
)

function Get-AccentColor {
  param([string]$Seed)

  $palette = @(
    [System.Drawing.Color]::FromArgb(255, 219, 78, 74),
    [System.Drawing.Color]::FromArgb(255, 237, 141, 50),
    [System.Drawing.Color]::FromArgb(255, 52, 181, 121),
    [System.Drawing.Color]::FromArgb(255, 56, 153, 214),
    [System.Drawing.Color]::FromArgb(255, 138, 93, 214),
    [System.Drawing.Color]::FromArgb(255, 201, 79, 176),
    [System.Drawing.Color]::FromArgb(255, 241, 208, 90),
    [System.Drawing.Color]::FromArgb(255, 98, 204, 189)
  )

  $sum = 0
  foreach ($char in $Seed.ToCharArray()) {
    $sum += [int][char]$char
  }

  return $palette[$sum % $palette.Count]
}

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Get-WikiImageUrl {
  param(
    [string]$WikiBase,
    [string[]]$FileTitles
  )

  foreach ($title in $FileTitles) {
    $escapedTitle = [System.Uri]::EscapeDataString("File:$title")
    $apiUrl = "$WikiBase/api.php?action=query&titles=$escapedTitle&prop=imageinfo&iiprop=url&format=json"

    $page = $null
    for ($attempt = 1; $attempt -le 5 -and $null -eq $page; $attempt++) {
      try {
        $response = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'JuiceJournal/1.0 (asset sync)' }
        $page = $response.query.pages.PSObject.Properties.Value | Select-Object -First 1
      } catch {
        if ($attempt -eq 5) {
          throw
        }

        Start-Sleep -Seconds ([Math]::Pow(2, $attempt - 1))
      }
    }

    if ($null -eq $page) {
      continue
    }

    $isMissing = $page.PSObject.Properties.Name -contains 'missing'
    if ($null -ne $page -and -not $isMissing -and $page.imageinfo) {
      return $page.imageinfo[0].url
    }
  }

  return $null
}

function Download-Image {
  param(
    [string]$Url,
    [string]$CacheName
  )

  Ensure-Directory -Path $tempDir
  $hashInput = [System.Text.Encoding]::UTF8.GetBytes($Url)
  $sha1 = [System.Security.Cryptography.SHA1]::Create()
  $hashBytes = $sha1.ComputeHash($hashInput)
  $sha1.Dispose()
  $hashString = [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant().Substring(0, 12)
  $targetPath = Join-Path $tempDir "$hashString-$CacheName"

  if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Force
  }

  $downloaded = $false
  for ($attempt = 1; $attempt -le 8 -and -not $downloaded; $attempt++) {
    try {
      Invoke-WebRequest -Uri $Url -Headers @{ 'User-Agent' = 'JuiceJournal/1.0 (asset sync)' } -OutFile $targetPath
      $downloaded = $true
      Start-Sleep -Milliseconds 750
    } catch {
      if (Test-Path -LiteralPath $targetPath) {
        Remove-Item -LiteralPath $targetPath -Force
      }

      if ($attempt -eq 8) {
        throw
      }

      Start-Sleep -Seconds ([Math]::Min([Math]::Pow(2, $attempt - 1), 20))
    }
  }

  if (-not $downloaded) {
    throw "Failed to download $Url"
  }

  return $targetPath
}

function New-Bitmap {
  param(
    [int]$Width,
    [int]$Height
  )

  return New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Use-HighQuality {
  param([System.Drawing.Graphics]$Graphics)

  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
}

function Draw-CoverImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [System.Drawing.Rectangle]$Destination
  )

  $scale = [Math]::Max($Destination.Width / $Image.Width, $Destination.Height / $Image.Height)
  $sourceWidth = $Destination.Width / $scale
  $sourceHeight = $Destination.Height / $scale
  $sourceX = ($Image.Width - $sourceWidth) / 2
  $sourceY = ($Image.Height - $sourceHeight) / 2
  $destinationRect = [System.Drawing.RectangleF]::new([single]$Destination.X, [single]$Destination.Y, [single]$Destination.Width, [single]$Destination.Height)
  $sourceRect = [System.Drawing.RectangleF]::new([single]$sourceX, [single]$sourceY, [single]$sourceWidth, [single]$sourceHeight)

  $Graphics.DrawImage($Image, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-CircularImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [System.Drawing.Rectangle]$Destination,
    [System.Drawing.Color]$BorderColor
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($Destination)

  $previousClip = $Graphics.Clip
  $Graphics.SetClip($path)
  Draw-CoverImage -Graphics $Graphics -Image $Image -Destination $Destination
  $Graphics.SetClip($previousClip, [System.Drawing.Drawing2D.CombineMode]::Replace)

  $shadowRect = [System.Drawing.Rectangle]::new([int]$Destination.X + 8, [int]$Destination.Y + 8, [int]$Destination.Width, [int]$Destination.Height)
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
  $Graphics.FillEllipse($shadowBrush, $shadowRect)
  $shadowBrush.Dispose()

  $borderPen = New-Object System.Drawing.Pen($BorderColor, 8)
  $Graphics.DrawEllipse($borderPen, $Destination)

  $highlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 255, 255, 255), 2)
  $highlightRect = [System.Drawing.Rectangle]::new([int]$Destination.X + 6, [int]$Destination.Y + 6, [int]$Destination.Width - 12, [int]$Destination.Height - 12)
  $Graphics.DrawEllipse($highlightPen, $highlightRect)

  $highlightPen.Dispose()
  $borderPen.Dispose()
  $path.Dispose()
}

function Draw-FeatureImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [System.Drawing.Rectangle]$Destination,
    [System.Drawing.Color]$AccentColor
  )

  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 0, 0, 0))
  $shadowRect = [System.Drawing.Rectangle]::new([int]$Destination.X + 10, [int]$Destination.Y + 12, [int]$Destination.Width, [int]$Destination.Height)
  $Graphics.FillRectangle($shadowBrush, $shadowRect)
  $shadowBrush.Dispose()

  $frameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55, $AccentColor.R, $AccentColor.G, $AccentColor.B))
  $Graphics.FillRectangle($frameBrush, $Destination)
  $frameBrush.Dispose()

  $imageRect = [System.Drawing.Rectangle]::new([int]$Destination.X + 12, [int]$Destination.Y + 12, [int]$Destination.Width - 24, [int]$Destination.Height - 24)
  Draw-CoverImage -Graphics $Graphics -Image $Image -Destination $imageRect

  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(225, 255, 255, 255), 2)
  $Graphics.DrawRectangle($borderPen, $Destination)
  $borderPen.Dispose()
}

function Draw-TextBlock {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Title,
    [string]$Subtitle,
    [System.Drawing.RectangleF]$Bounds,
    [System.Drawing.Color]$AccentColor
  )

  $titleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 44, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subtitleFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 0, 0, 0))
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $subtitleBrush = New-Object System.Drawing.SolidBrush($AccentColor)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Near
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near

  $shadowBounds = [System.Drawing.RectangleF]::new([single]$Bounds.X + 3, [single]$Bounds.Y + 3, [single]$Bounds.Width, [single]$Bounds.Height)
  $Graphics.DrawString($Title, $titleFont, $shadowBrush, $shadowBounds, $format)
  $Graphics.DrawString($Title, $titleFont, $titleBrush, $Bounds, $format)

  $subtitleY = $Bounds.Y + 58
  $subtitleBounds = [System.Drawing.RectangleF]::new([single]$Bounds.X, [single]$subtitleY, [single]$Bounds.Width, [single]$Bounds.Height)
  $subtitleShadowBounds = [System.Drawing.RectangleF]::new([single]$subtitleBounds.X + 2, [single]$subtitleBounds.Y + 2, [single]$subtitleBounds.Width, [single]$subtitleBounds.Height)
  $Graphics.DrawString($Subtitle, $subtitleFont, $shadowBrush, $subtitleShadowBounds, $format)
  $Graphics.DrawString($Subtitle, $subtitleFont, $subtitleBrush, $subtitleBounds, $format)

  $format.Dispose()
  $subtitleBrush.Dispose()
  $titleBrush.Dispose()
  $shadowBrush.Dispose()
  $subtitleFont.Dispose()
  $titleFont.Dispose()
}

function Save-Jpeg {
  param(
    [System.Drawing.Image]$Image,
    [string]$TargetPath,
    [int]$Quality = 92
  )

  Ensure-Directory -Path (Split-Path -Parent $TargetPath)
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
  $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($qualityEncoder, [int64]$Quality)
  $Image.Save($TargetPath, $codec, $encoderParameters)
  $encoderParameters.Dispose()
}

function Save-Png {
  param(
    [System.Drawing.Image]$Image,
    [string]$TargetPath
  )

  Ensure-Directory -Path (Split-Path -Parent $TargetPath)
  $Image.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Copy-ImageFile {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )

  Ensure-Directory -Path (Split-Path -Parent $TargetPath)
  Copy-Item -LiteralPath $SourcePath -Destination $TargetPath -Force
}

function Get-WikiThumbUrl {
  param(
    [string]$ImageUrl,
    [int]$Width = 900
  )

  $uri = [System.Uri]$ImageUrl
  $segments = $uri.AbsolutePath.TrimStart('/').Split('/')

  if ($segments.Length -lt 4 -or $segments[0] -ne 'images') {
    return $ImageUrl
  }

  $fileName = $segments[-1]
  return "$($uri.Scheme)://$($uri.Host)/images/thumb/$($segments[1])/$($segments[2])/$fileName/${Width}px-$fileName"
}

function New-Poe1PortraitAndBanner {
  param([hashtable]$Entry)

  $portraitTarget = Join-Path $assetsDir "poe1/$($Entry.Slug).jpg"
  $bannerTarget = Join-Path $assetsDir "banners/poe1/$($Entry.Slug).jpg"
  $basePortraitPath = Join-Path $assetsDir "poe1/$($Entry.BaseSlug).jpg"
  $baseBannerPath = Join-Path $assetsDir "banners/poe1/$($Entry.BaseSlug).jpg"

  $featureUrl = Get-WikiImageUrl -WikiBase 'https://www.poewiki.net' -FileTitles @(
    "$($Entry.WikiTitle)_ascendancy_class.png",
    "$($Entry.WikiTitle)_ascendancy_class.jpg"
  )

  $avatarUrl = Get-WikiImageUrl -WikiBase 'https://www.poewiki.net' -FileTitles @(
    "$($Entry.WikiTitle)_avatar.png",
    "$($Entry.WikiTitle)_avatar.jpg"
  )

  if (-not $featureUrl -and -not $avatarUrl) {
    throw "Missing PoE1 sources for $($Entry.DisplayName)"
  }

  $featureTemp = if ($featureUrl) {
    Download-Image -Url $featureUrl -CacheName "$($Entry.Slug)-feature.$([System.IO.Path]::GetExtension($featureUrl).TrimStart('.'))"
  } else {
    Download-Image -Url $avatarUrl -CacheName "$($Entry.Slug)-avatar.$([System.IO.Path]::GetExtension($avatarUrl).TrimStart('.'))"
  }
  $avatarTemp = if ($avatarUrl) {
    Download-Image -Url $avatarUrl -CacheName "$($Entry.Slug)-avatar.$([System.IO.Path]::GetExtension($avatarUrl).TrimStart('.'))"
  } else {
    $null
  }
  $accentColor = Get-AccentColor -Seed $Entry.Slug

  $basePortrait = [System.Drawing.Image]::FromFile($basePortraitPath)
  $baseBanner = [System.Drawing.Image]::FromFile($baseBannerPath)
  $feature = [System.Drawing.Image]::FromFile($featureTemp)
  $avatar = if ($avatarTemp) { [System.Drawing.Image]::FromFile($avatarTemp) } else { $null }

  try {
    $portraitBitmap = New-Bitmap -Width $basePortrait.Width -Height $basePortrait.Height
    $portraitGraphics = [System.Drawing.Graphics]::FromImage($portraitBitmap)
    try {
      Use-HighQuality -Graphics $portraitGraphics
      Draw-CoverImage -Graphics $portraitGraphics -Image $basePortrait -Destination ([System.Drawing.Rectangle]::new(0, 0, $portraitBitmap.Width, $portraitBitmap.Height))

      $shadeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(145, 7, 10, 16))
      $portraitGraphics.FillRectangle($shadeBrush, 0, 0, $portraitBitmap.Width, $portraitBitmap.Height)
      $shadeBrush.Dispose()

      $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55, $accentColor.R, $accentColor.G, $accentColor.B))
      $portraitGraphics.FillEllipse($accentBrush, -40, 60, 420, 420)
      $accentBrush.Dispose()

      Draw-FeatureImage -Graphics $portraitGraphics -Image $feature -Destination ([System.Drawing.Rectangle]::new(92, 172, 570, 278)) -AccentColor $accentColor
      if ($avatar) {
        Draw-CircularImage -Graphics $portraitGraphics -Image $avatar -Destination ([System.Drawing.Rectangle]::new(510, 84, 150, 150)) -BorderColor $accentColor
      }
      Draw-TextBlock -Graphics $portraitGraphics -Title $Entry.DisplayName -Subtitle $Entry.BaseLabel -Bounds ([System.Drawing.RectangleF]::new(72, 510, 610, 170)) -AccentColor $accentColor

      Save-Jpeg -Image $portraitBitmap -TargetPath $portraitTarget
    } finally {
      $portraitGraphics.Dispose()
      $portraitBitmap.Dispose()
    }

    $bannerBitmap = New-Bitmap -Width $baseBanner.Width -Height $baseBanner.Height
    $bannerGraphics = [System.Drawing.Graphics]::FromImage($bannerBitmap)
    try {
      Use-HighQuality -Graphics $bannerGraphics
      Draw-CoverImage -Graphics $bannerGraphics -Image $baseBanner -Destination ([System.Drawing.Rectangle]::new(0, 0, $bannerBitmap.Width, $bannerBitmap.Height))

      $shadeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(155, 7, 10, 16))
      $bannerGraphics.FillRectangle($shadeBrush, 0, 0, $bannerBitmap.Width, $bannerBitmap.Height)
      $shadeBrush.Dispose()

      $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, $accentColor.R, $accentColor.G, $accentColor.B))
      $bannerGraphics.FillRectangle($accentBrush, 0, 0, [Math]::Floor($bannerBitmap.Width * 0.44), $bannerBitmap.Height)
      $accentBrush.Dispose()

      Draw-FeatureImage -Graphics $bannerGraphics -Image $feature -Destination ([System.Drawing.Rectangle]::new(42, 192, 316, 206)) -AccentColor $accentColor
      if ($avatar) {
        Draw-CircularImage -Graphics $bannerGraphics -Image $avatar -Destination ([System.Drawing.Rectangle]::new(268, 304, 120, 120)) -BorderColor $accentColor
      }
      Draw-TextBlock -Graphics $bannerGraphics -Title $Entry.DisplayName -Subtitle $Entry.BaseLabel -Bounds ([System.Drawing.RectangleF]::new(394, 246, 278, 190)) -AccentColor $accentColor

      Save-Jpeg -Image $bannerBitmap -TargetPath $bannerTarget
    } finally {
      $bannerGraphics.Dispose()
      $bannerBitmap.Dispose()
    }
  } finally {
    if ($avatar) {
      $avatar.Dispose()
    }
    $feature.Dispose()
    $baseBanner.Dispose()
    $basePortrait.Dispose()
  }
}

function Save-ConvertedPoe2Images {
  param([hashtable]$Entry)

  $portraitTarget = Join-Path $assetsDir "poe2/$($Entry.Slug).png"
  $bannerTarget = Join-Path $assetsDir "banners/poe2/$($Entry.Slug).jpg"

  $portraitUrl = $Entry.PortraitUrl
  $bannerUrl = $Entry.BannerUrl

  if (-not $portraitUrl) {
    throw "Missing PoE2 portrait source for $($Entry.DisplayName)"
  }

  if (-not $bannerUrl) {
    throw "Missing PoE2 banner source for $($Entry.DisplayName)"
  }

  $portraitTemp = Download-Image -Url $portraitUrl -CacheName "$($Entry.Slug)-portrait.$([System.IO.Path]::GetExtension($portraitUrl).TrimStart('.'))"
  $bannerTemp = Download-Image -Url (Get-WikiThumbUrl -ImageUrl $bannerUrl) -CacheName "$($Entry.Slug)-banner.$([System.IO.Path]::GetExtension($bannerUrl).TrimStart('.'))"

  if ([System.IO.Path]::GetExtension($portraitTemp).ToLowerInvariant() -eq '.png') {
    Copy-ImageFile -SourcePath $portraitTemp -TargetPath $portraitTarget
  } else {
    $portraitSource = [System.Drawing.Image]::FromFile($portraitTemp)
    try {
      Save-Png -Image $portraitSource -TargetPath $portraitTarget
    } finally {
      $portraitSource.Dispose()
    }
  }

  if ([System.IO.Path]::GetExtension($bannerTemp).ToLowerInvariant() -eq '.jpg') {
    Copy-ImageFile -SourcePath $bannerTemp -TargetPath $bannerTarget
  } else {
    $bannerSource = [System.Drawing.Image]::FromFile($bannerTemp)
    try {
      Save-Jpeg -Image $bannerSource -TargetPath $bannerTarget
    } finally {
      $bannerSource.Dispose()
    }
  }
}

if ($Poe1) {
  foreach ($entry in $poe1Entries) {
    Write-Host "Generating PoE1 ascendancy art for $($entry.DisplayName)..."
    New-Poe1PortraitAndBanner -Entry $entry
  }
}

if ($Poe2) {
  foreach ($entry in $poe2Entries) {
    Write-Host "Downloading PoE2 ascendancy art for $($entry.DisplayName)..."
    Save-ConvertedPoe2Images -Entry $entry
  }
}
