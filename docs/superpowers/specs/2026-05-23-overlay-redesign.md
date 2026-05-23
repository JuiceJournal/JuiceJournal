# In-Game Overlay Redesign Spec

## Status: Approved | 2026-05-23

## Problem

Overlay penceresi oyun uzerinde gorunmuyordu. 3 temel sebep:
1. `overlayEnabled: false` default degeri (duzeltildi `#2890e8c`)
2. Ayarlar sayfasinda overlay toggle'i yoktu (duzeltildi `#2890e8c`)
3. Injection guvenilirligi zayif, transient hatalari karsilamiyor

## Goals

- Overlay her kosulda oyun uzerinde gorunur olmali (DX11/Vulkan fullscreen dahil)
- Map giris/cikis bildirimi, run suresi, profit gosterimi
- Kullanici main app'e alt-tab yapmak zorunda kalmasin
- Mevcut PoE temasini koruyarak modern glassmorphism tasarim

## Architecture

```
Path of Exile (DX11/Vulkan)
  └── Overwolf GEP Injection
        └── overlay.html (yeni modern UI)

Juice Journal Desktop (Electron)
  └── main.js
        ├── buildOverlayState()
        ├── overwolfOverlayProvider  ← injection + retry backoff
        └── gameDetector + logParser
```

## Overlay States

### 1. Runtime Panel (Passive)
- Sag ust kose, `320px x 56px`
- Karakter adi + lig, gecerli alan + sure
- `focusable: false`, `passthrough: passThroughAndNotify`
- Her saniye sure guncellenir

### 2. Map Start Prompt (Interactive)
- Harita algilaninca 7 saniyeligine etkilesimli olur
- `400px x 220px`, `focusable: true`, `passthrough: noPassThrough`
- Map adi input + farm type select + Start/Cancel
- ESC veya Cancel ile kapanir
- 7sn yanit gelmezse kapanir + desktop modal'a duser

### 3. Map Result Card (Passive)
- Map tamamlaninca 8 saniyeligine gosterilir
- `340px x 72px`, sagdan slide-in/slide-out animasyonu
- Net profit + sure + farm type ozeti
- Pin butonu ile sabitlenebilir
- Pozitif/negatif renk kodlamasi (yesil/kirmizi)

### State Transitions
```
Runtime --map_detected--> StartMapPrompt
Runtime <--cancel/confirm-- StartMapPrompt
Runtime --map_completed--> MapResult (slide-in sagdan)
Runtime <--dismiss/timeout-- MapResult (slide-out saga)
```

## Visual Design

### Colors (Modernized PoE Theme)
```
--overlay-bg:     rgba(6, 8, 12, 0.72)
--overlay-border: rgba(200, 155, 60, 0.25)
--overlay-glow:   rgba(200, 155, 60, 0.08)
--overlay-text:   #e8dcc8
--overlay-muted:  #8a7a60
--overlay-accent: #c8a84e
--profit-positive:#6dd48d
--profit-negative:#e8746c
```

### Glassmorphism layers
- Outer: box-shadow glow
- Middle: 1px amber border
- Inner: gradient background + backdrop-filter: blur(16px)
- Content area

### Typography
- Font stack: Inter, system-ui, sans-serif
- Heading: 11px / 700 / letter-spacing 0.04em / uppercase
- Body: 13px / 500
- Secondary: 11px / 400
- Profit value: 15px / 700

### Animations
| Event | Animation | Duration |
|-------|-----------|----------|
| Runtime -> StartMapPrompt | scale-up + border glow | 200ms |
| Map result slide-in | translateX slid-right + opacity 0->1 | 250ms |
| Map result slide-out | translateX slid-right + opacity 1->0 | 200ms |
| Time update | Instant (no animation) | 0ms |
| Initial appear | Fade-in | 150ms |

## Injection Reliability Fixes

### Exponential Backoff Retry
1. deneme: 2s → 2. deneme: 4s → 3. deneme: 8s → 4. deneme: 16s → 5. deneme: 32s
Toplam ~60sn, max 5 deneme

### Proactive Injection
- `gameDetector` oyunu algiladigi an injection baslat
- Uygulama baslangicinda oyun aciksa hemen dene
- `game-detected` IPC event'inde injection trigger

### Injection State Machine
```
IDLE -> INJECTING -> INJECTED
                  -> ELEVATION_MISMATCH (toast)
                  -> FAILED (5 deneme, toast)
```

### Render Queue
- `INJECTED` degilse state'i kuyruga al
- Injection tamamlaninca render et

## Files Changed

| File | Change |
|------|--------|
| `desktop/src/overlay.html` | Rewrite: new CSS + HTML structure |
| `desktop/src/overlay.js` | Rewrite: renderState, animations, 3 modes |
| `desktop/src/modules/overwolfOverlayProvider.js` | Retry backoff, state machine, render queue |
| `desktop/main.js` | Proactive injection, elevation toast, injection guard |
| `desktop/overlay-preload.js` | IPC additions if needed |

## Files Unchanged

| File | Reason |
|------|--------|
| `desktop/src/modules/overlayStateModel.js` | State calculation logic preserved |
| `desktop/src/modules/mapResultOverlayModel.js` | Profit calculation preserved |
| `desktop/src/modules/profitCurrencyModel.js` | Formatting preserved |
| `desktop/src/app.js` (renderer) | Overlay API calls unchanged |

## Error Handling

| Scenario | User Feedback |
|----------|--------------|
| Injection fails | Toast: run game and app at same elevation |
| Elevation mismatch | Toast: same privilege level required |
| Overwolf not installed | Settings info message, Electron fallback hint |
| Game closes | Overlay auto-hides, returns to "Waiting for game" |

## Testing

- Update `desktop/e2e/overlay-smoke.spec.js` for new mode transitions
- Update `desktop/tests/overwolf-overlay-provider.test.js` for retry + state machine
- Visual QA: `desktop/e2e/adaptive-profit-visual-qa.spec.js` (existing, may need minor updates)
