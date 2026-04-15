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
- stdin NDJSON `set-character-pool` komutlarini kabul eder
- bridge komutlari icin yerel `dotnet` araci gerekli

## Native Bridge Probe Workflow

1. `npm run bridge:build`
2. Launch PoE2 and choose character A
3. Run `npm run bridge:run` and capture the one-shot diagnostic output
4. Launch or switch to character B
5. Run `npm run bridge:run` again and compare the output with the previous snapshot

Current expectation:
- desktop main login, `get-current-user`, ve logout akislarinda bridge'e full-snapshot `set-character-pool` gonderir
- bridge startup'ta `process-tree-probe`, `named-pipe-probe`, ve `artifact-probe` diagnostiklerini emit eder
- bridge production hint kararini `accountHint` ile degil mevcut low-risk native evidence setiyle verir
- `artifact-probe` artık Steam install path, Steam library, ve PoE2 config/log kökleri uzerinden root discovery yapar
- `artifact-probe` bulunduğu kökler altında bounded recursive enumeration ile aday dosya/klasorleri tarar
- bridge terminalden dogrudan calistirildiginda startup diagnostiklerini basip cikar
- bridge desktop supervisor tarafindan `stdin` pipe ile baslatildiginda ayni process icinde birden fazla `set-character-pool` komutu kabul eder
- `npm run bridge:run` stdout should print:
  - `artifact-probe`
  - `named-pipe-probe`
  - `process-probe`
  - `process-tree-probe`
  - `window-probe`
  - `transition-probe`
- `npm run bridge:run` is a single snapshot command, not a long-running watcher

Character pool sync smoke:

```bash
echo {"type":"set-character-pool","characters":[]} | dotnet run --project native-bridge/JuiceJournal.NativeBridge.csproj
```

Beklenen:

- stdout `character-pool-replaced` diagnostigi ile baslar
- ardindan `process-probe`, `transition-probe`, `window-probe` gelir

Active hint smoke:

```bash
echo {"type":"set-character-pool","characters":[{"poeVersion":"poe2","characterId":"poe2-kellee","characterName":"KELLEE","className":"Monk2","level":92}],"accountHint":{"poeVersion":"poe2","characterName":"KELLEE","className":"Monk2","level":92}} | dotnet run --project native-bridge/JuiceJournal.NativeBridge.csproj
```

Beklenen:

- stdout startup diagnostiklerini basar
- `character-pool-replaced` gelir
- aktif PoE process yoksa hint emit etmez
- aktif PoE process varken exact-match olursa `active-character-hint` satiri emit edilir

Task 6 dogrulama komutlari:

```bash
npm run bridge:build
dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj
node --test tests/native-bridge-process.test.js
node --test tests/native-bridge-command-model.test.js
node --test tests/native-bridge-model.test.js tests/native-bridge-supervisor.test.js tests/main-settings.test.js
node --test tests/*.test.js
```

## Active Hint Validation

Current bridge phase supports:
- diagnostics
- `named-pipe-probe` diagnostics
- `artifact-probe` diagnostics with Windows-local root discovery
- `artifact-probe` bounded recursive enumeration under discovered roots
- `process-tree-probe` diagnostics
- high-confidence hint transport path in desktop main
- native-backed `active-character-hint` promotion only when one low-risk native source yields one exact match
- `accountHint` can still travel with sync commands, but it is no longer the production identity source

Validation flow:
1. run `npm run bridge:run`
2. verify stdout prints:
   - `artifact-probe`
   - `named-pipe-probe`
   - `process-probe`
   - `process-tree-probe`
   - `transition-probe`
   - `window-probe`
3. send a supported `set-character-pool` command with matching `accountHint`
4. without an active PoE process, verify bridge emits `hint-resolution-rejected` and does not emit `active-character-hint`
5. start desktop app
6. verify unsupported `bridge-diagnostic` payloads do not change the card

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
