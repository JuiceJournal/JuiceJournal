# PoE Farm Tracker

Path of Exile icin kapsamli farm takip uygulamasi.

## 🚀 Hizli Baslangic (Docker)

### 1. Backend ve Veritabani

```bash
cd poe-farm-tracker/backend

# Docker ile PostgreSQL, pgAdmin ve Redis baslat
docker-compose up -d

# Node.js bagimliliklarini yukle
npm install

# .env dosyasini olustur (Docker icin hazir)
cp .env.docker .env

# Sunucuyu baslat
npm run dev
```

Backend hazir! (http://localhost:3001)

### 2. Desktop App

```bash
cd poe-farm-tracker/desktop
npm install
npm run dev
```

### 3. Web Dashboard

```bash
cd poe-farm-tracker/web
npm install
npm run dev
```

## 📁 Proje Yapisi

```
poe-farm-tracker/
├── backend/          # Node.js + Express + PostgreSQL API
│   ├── docker-compose.yml    # Docker yapilandirmasi
│   ├── Makefile              # Kolay komutlar
│   └── init/                 # DB init scriptleri
├── desktop/          # Electron Desktop App
└── web/              # Next.js 14 Web Dashboard
```

## 🐳 Docker Servisleri

| Servis | Port | Aciklama |
|--------|------|----------|
| PostgreSQL | 5432 | Ana veritabani |
| pgAdmin | 5050 | Web-based DB yonetimi |
| Redis | 6379 | Cache (opsiyonel) |
| Backend | 3001 | API sunucusu |

### Makefile Komutlari (Backend)

```bash
cd backend

make up          # Docker servislerini baslat
make down        # Servisleri durdur
make logs        # Loglari goster
make psql        # PostgreSQL shell
make pgadmin     # pgAdmin'i ac
make db-reset    # Veritabanini sifirla
make dev         # Node.js sunucusunu baslat
make start-all   # Her seyi baslat
```

## ⚙️ Ortam Degiskenleri

### Backend (.env)
```env
# Docker ile calisirken (varsayilan)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poefarm
DB_USER=postgres
DB_PASSWORD=postgres123

JWT_SECRET=your_secret_key
PORT=3001
```

### Web (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## ✨ Ozellikler

### Desktop App
- 🎮 PoE Client.txt log izleme
- 🗺️ Otomatik map giris/cikis tespiti
- 📷 Tesseract.js OCR ile stash tarama
- ⌨️ Global hotkey destegi (F9)
- 🔔 System tray entegrasyonu

### Web Dashboard
- 📊 Kisisel farm istatistikleri
- 📈 Gercek zamanli grafikler
- 🏆 Leaderboard sistemi
- 🗺️ Map karsilastirmalari

### Backend API
- 🔐 JWT authentication
- 🔄 WebSocket real-time guncellemeler
- 💰 poe.ninja fiyat senkronizasyonu
- 📊 Kapsamli istatistik endpoint'leri

## 🗄️ Veritabani Yonetimi

### pgAdmin ile (Web Arayuzu)
1. http://localhost:5050 adresine git
2. Giris: `admin@poefarm.local` / `admin123`
3. Server ekle:
   - Host: `postgres`
   - Port: `5432`
   - DB: `poefarm`

### Komut Satirindan
```bash
cd backend
make psql

# Tablolari listele
\dt

# Ornek sorgu
SELECT * FROM users;

# Cikis
\q
```

## 🛠️ Gelistirme

### Tum Servisleri Baslat
```bash
# Terminal 1 - Backend (Docker + Node)
cd backend
make start-all

# Terminal 2 - Desktop
cd desktop
npm run dev

# Terminal 3 - Web
cd web
npm run dev
```

### Portlar
| Servis | URL |
|--------|-----|
| API | http://localhost:3001 |
| Web Dashboard | http://localhost:3000 |
| pgAdmin | http://localhost:5050 |
| PostgreSQL | localhost:5432 |

## 🐛 Sorun Giderme

### Docker sorunlari
```bash
# Container durumunu kontrol et
docker-compose ps

# Loglari kontrol et
docker-compose logs postgres

# Tumunu yeniden baslat
docker-compose down
docker-compose up -d
```

### Port cakismasi
```bash
# Portlari kontrol et (Windows)
netstat -ano | findstr :5432
netstat -ano | findstr :3001
```

### Veritabani sifirlama
```bash
cd backend
make db-reset
# TUM VERILER SILINECEK!
```

## 📝 API Endpoints

- `POST /api/auth/login` - Giris yap
- `POST /api/auth/register` - Kayit ol
- `GET /api/sessions` - Session listesi
- `POST /api/sessions/start` - Session baslat
- `PUT /api/sessions/:id/end` - Session bitir
- `POST /api/loot` - Loot ekle
- `GET /api/prices/current` - Guncel fiyatlar
- `GET /api/stats/personal` - Kisisel istatistikler
- `GET /api/stats/leaderboard/:league/:period` - Leaderboard

## 📄 Lisans

MIT
