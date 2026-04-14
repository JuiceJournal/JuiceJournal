# Juice Journal - Desktop

Electron tabanli masaustu uygulamasi.

## Kurulum

```bash
npm install
```

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

# Playwright smoke testleri
npm run test:smoke
```

## Native Active Character Validation

PoE2 native karakter tespiti icin manuel dogrulama matrisi:

- Oyunu acin.
- Farkli bir karakter secin.
- `Play` basin.
- Juice Journal karakter kartinin `1-3 saniye` icinde yeni karaktere gectigini dogrulayin.
- Eger native hint gelmezse mevcut karakter kartinin korunup API fallback yenilemesinin devam ettigini kontrol edin.

Kontrol listesi:

- `PoE1/PoE2` badge dogru mu
- karakter adi dogru mu
- portrait ve banner dogru class ailesine gecti mi
- stale eski karakter geri donuyor mu
- oyun kapaninca karakter karti stale native hint tasiyor mu

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
