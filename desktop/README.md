# Juice Journal - Desktop

Electron tabanli masaustu uygulamasi.

## Kurulum

```bash
npm install
```

Native bridge spike'i icin su an:

- Windows gerekli
- `.NET 10 SDK` gerekli

Tesseract.js icin ek sistem gereksinimleri olabilir. 
Windows'ta genelde ek kurulum gerekmez.

## Calistirma

```bash
# Gelistirme modu
npm run dev

# Build
npm run build

# Windows icin build
npm run build:win
```

## Ozellikler

### Log Izleme
- PoE `logs/Client.txt` dosyasini izler
- Map giris/cikisini otomatik tespit eder
- Session'lari otomatik baslatabilir

### OCR Tarama
- Tesseract.js ile ekran goruntusu analizi
- Stash'teki itemleri tespit eder
- Fiyatlandirma icin backend'e gonderir

### Global Hotkeys
- `F9` - Hizli loot ekle
- `Ctrl+Shift+L` - Stash tarama

### System Tray
- Windows bildirim alaninda calisir
- Sag tik menu ile hizli erisim
- Arkaplanda calisma destegi

## Ayarlar

Uygulama ici ayarlar:

- **API URL**: Backend sunucu adresi
- **Client.txt Yolu**: PoE log dosya yolu
- **Dil**: Arayuz dili
- **PoE Surumu**: PoE1 / PoE2 runtime secimi
- **Aktif Ligler**: PoE1 ve PoE2 icin ayri varsayilan lig secimi
- **Hotkeys**: `scanHotkey` ve `stashScanHotkey` kisayollari
- **Otomatik Session**: Map girisinde otomatik baslat
- **Bildirimler**: Masaustu bildirimleri
- **Sesli Bildirimler**: Sesli event bildirimleri
- **PoE Baglantisi**: Path of Exile OAuth bagla / ayir
- **Diagnostik ve Audit Trail**: Pending sync, export ve audit goruntuleme

### PoE Log Yolu

Varsayilan log konumu:
- PoE1 standalone: `C:/Program Files (x86)/Grinding Gear Games/Path of Exile/logs/Client.txt`
- PoE1 standalone: `C:/Program Files/Grinding Gear Games/Path of Exile/logs/Client.txt`
- PoE1 standalone: `E:/Grinding Gear Games/Path of Exile/logs/Client.txt`
- PoE1 standalone: `D:/Grinding Gear Games/Path of Exile/logs/Client.txt`
- PoE2 standalone: `C:/Program Files (x86)/Grinding Gear Games/Path of Exile 2/logs/Client.txt`
- PoE2 standalone: `C:/Program Files/Grinding Gear Games/Path of Exile 2/logs/Client.txt`
- PoE2 standalone: `E:/Grinding Gear Games/Path of Exile 2/logs/Client.txt`
- PoE2 standalone: `D:/Grinding Gear Games/Path of Exile 2/logs/Client.txt`
- PoE2 Steam: `C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2/logs/Client.txt`

## Gelistirme

```bash
# Gelistirme modu (DevTools acik)
npm run dev

# Kod degisikliklerinde otomatik yeniden yukleme yok
# Her degisiklikten sonra uygulamayi yeniden baslatin
```

### Test Komutlari

```bash
# Tum desktop testleri
npm test

# Native producer main-process regression seti
node --test tests/main-settings.test.js

# Playwright smoke testleri (settings + overlay subset)
npm run test:smoke
```

## Native Bridge

```bash
# .NET native bridge'i build et
npm run bridge:build

# Bridge'i tek basina calistir
npm run bridge:run
```

Beklenen:

- stdout NDJSON diagnostik satirlari uretir
- desktop uygulamasi bridge yoksa fail-closed kalir
- bridge komutlari icin yerel `dotnet` araci gerekli

## Native Bridge Probe Workflow

1. `npm run bridge:build`
2. Launch PoE2 and choose character A
3. Run `npm run bridge:run` and capture the one-shot diagnostic output
4. Launch or switch to character B
5. Run `npm run bridge:run` again and compare the output with the previous snapshot

Current expectation:
- diagnostics only
- no active-character-hint emission yet
- `npm run bridge:run` stdout should print:
  - `process-probe`
  - `window-probe`
  - `transition-probe`
- `npm run bridge:run` is a single snapshot command, not a long-running watcher

Task 6 dogrulama komutlari:

```bash
npm run bridge:build
node --test tests/native-bridge-model.test.js tests/native-bridge-supervisor.test.js tests/main-settings.test.js
node --test tests/*.test.js
```

## Active Hint Validation

Current bridge phase supports:
- diagnostics
- high-confidence hint transport path in desktop main
- no live `active-character-hint` emission from the bridge yet

Validation flow:
1. run `npm run bridge:run`
2. verify stdout prints only:
   - `process-probe`
   - `transition-probe`
   - `window-probe`
3. start desktop app
4. verify unsupported `bridge-diagnostic` payloads do not change the card
5. verify the desktop app is only prepared to accept supported `active-character-hint` payloads when the bridge begins emitting them in a later phase

## Build

```bash
# Tum platformlar
npm run build

# Sadece Windows
npm run build:win

# Portable (kurulumsuz)
npm run pack
```

Build ciktisi `dist/` klasorunde olusur.

Not:

- Bu branch'teki paketleme akisi `native-bridge/` kaynaklarini build ciktisina dahil eder.
- Bridge su an dev/spike seviyesinde `dotnet run --project ...` ile calisir.
- Paketlenmis build icinde bridge runtime yolu henuz production-ready degil; `native-bridge` entegrasyonu packaged app icin ayrica sertlestirilmeli.

## Sorun Giderme

### OCR calismiyor
- Tesseract.js ilk kullanimda dil dosyalarini indirir
- Internet baglantisi gerekli
- Windows Defender izin vermeli

### Log izleme calismiyor
- Client.txt yolu dogru mu kontrol edin
- PoE calisirken log dosyasina erisim olmali
- Yonetici yetkisi gerekebilir

### API baglantisi yok
- Backend sunucu calisiyor mu kontrol edin
- Firewall ayarlarini kontrol edin
- API URL ayarini dogrulayin
