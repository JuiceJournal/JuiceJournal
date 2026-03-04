# PoE Farm Tracker - Desktop

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
- **Otomatik Session**: Map girisinde otomatik baslat
- **Bildirimler**: Masaustu bildirimleri

### PoE Log Yolu

Varsayilan log konumu:
- Steam: `C:/Program Files (x86)/Steam/steamapps/common/Path of Exile/logs/Client.txt`
- Standalone: `C:/Path of Exile/logs/Client.txt`

## Gelistirme

```bash
# Gelistirme modu (DevTools acik)
npm run dev

# Kod degisikliklerinde otomatik yeniden yukleme yok
# Her degisiklikten sonra uygulamayi yeniden baslatin
```

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
