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

# Overwolf Electron ile calistir
npm run dev:overwolf

# Overwolf DEV-QA package feed ile calistir
npm run dev:overwolf:qa

# Build
npm run build

# Windows icin build
npm run build:win

# Overwolf Electron build
npm run build:overwolf
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

## Overwolf GEP Feasibility

Bu spike sadece `PoE2` icin Overwolf GEP feasibility'yi dogrular.

Beklenen runtime:

- `app.overwolf.packages.gep` mevcut olmali
- paket su metotlari saglamali:
  - `setRequiredFeatures`
  - `getInfo`
  - `on`
  - `removeListener`
- producer baslangicinda main process stdout'a `[OverwolfGepDiagnostic]` satirlari dusmeli
- ilk hedef `me.character_name` bilgisini mevcut `active-character-hint` yoluna map etmek

DEV ortam notu:

- Overwolf Electron docs'a gore DEV-only game package feed'i icin uygulama su argumanla acilmali:
  - `--owepm-packages-url=https://electronapi-qa.overwolf.com/packages`
- PoE2 PROD'a alininca bu arguman kaldirilmali

Kullanicidan daha sonra istenecek olasi adimlar:

1. Overwolf developer account / console erisimi
2. app registration veya mevcut app visibility dogrulamasi
3. DEV package feed ile local run dogrulamasi
4. PROD rollout oncesi DevRel koordinasyonu

Current scope:

- mevcut native bridge korunuyor
- Overwolf spike fail-closed
- GEP yoksa mevcut davranis bozulmamali
- PoE1 migration bu fazin parcasi degil

## Overwolf Runtime Notes

Repo artik iki runtime tasir:

- plain Electron
- Overwolf Electron

Plain Electron varsayilan local path olmaya devam eder.
Overwolf path submission ve local Overwolf validation icin ayridir.

Package-level Overwolf config:

- `package.json > overwolf.packages = ["gep"]`
- stable app metadata icin `author.name` tanimli

Runtime startup'ta main process su diagnostigi loglar:

- `[OverwolfRuntime]`

Bu payload sunlari gosterir:

- `runtime`
- `appUid`
- `packageFeedUrl`
- `usingQaFeed`
- `packagesConfigured`
- `gepConfigured`
- `gepAvailable`
- `missingGepMethods`

Beklenen local validation:

1. `npm run dev:overwolf`
2. log icinde `[OverwolfRuntime]` gor
3. `runtime` alaninin `ow-electron` oldugunu dogrula
4. `packagesConfigured` icinde `gep` oldugunu dogrula
5. PoE2 ortaminda producer loglarinda `[OverwolfGepDiagnostic]` satirlarini kontrol et

QA feed validation:

1. `npm run dev:overwolf:qa`
2. `[OverwolfRuntime]` logunda:
   - `usingQaFeed: true`
   - `packageFeedUrl: "https://electronapi-qa.overwolf.com/packages"`

Overwolf release oncesi kritik notlar:

- Electron FAQ'ya gore bu app Overwolf tarafinda ayri bir developer-console app olacak
- Electron FAQ'ya gore code-signing certificate gerekli
- GEP docs'a gore PoE2 PROD rollout oncesi DevRel bilgilendirilmeli

Submission oncesi senden istenecek bilgiler buyuk olasilikla bunlar olacak:

1. Overwolf developer console access
2. app registration visibility / app id
3. test channel veya DEV package feed kullanimi icin dogrulama
4. code-signing certificate plani
5. website / support / privacy / app listing kopyalari

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
- per-artifact `previewText`, `lastWriteTimeUtc`, and `length` metadata for text-like files
- parsed artifact diagnostics:
  - `artifact-config-parse`
  - `artifact-state-parse`
  - `artifact-loaded-mtx-parse`
- explicit diagnostics-only `run-memory-feasibility` spike command
- read-only memory feasibility diagnostics:
  - safe readable region filtering
  - bounded region reads
  - target string hit counting
  - region fingerprints
  - neighborhood summaries around extracted text islands
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
