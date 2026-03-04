# PoE Farm Tracker - Backend

Node.js + Express + PostgreSQL API sunucusu.

## Hizli Baslangic (Docker)

### 1. Docker ile PostgreSQL Baslat

```bash
cd backend

# PostgreSQL, pgAdmin ve Redis'i baslat
docker-compose up -d

# VEYA Makefile kullan
make up
```

Container'lar baslatildiktan sonra:
- **PostgreSQL**: `localhost:5432`
- **pgAdmin**: http://localhost:5050
  - Email: `admin@poefarm.com`
  - Sifre: `admin123`

### 2. Node.js Kurulumu

```bash
# Bagimliliklari yukle
npm install

# VEYA
make install
```

### 3. Ortam Degiskenleri

`.env` dosyasini olusturun (Docker varsayilanlari zaten hazir):

```bash
cp .env.docker .env
```

### 4. Sunucuyu Baslat

```bash
# Gelistirme modu
npm run dev

# VEYA
make dev
```

## Makefile Komutlari

| Komut | Aciklama |
|-------|----------|
| `make up` | Docker container'lari baslat |
| `make down` | Container'lari durdur |
| `make logs` | Loglari goster |
| `make psql` | PostgreSQL shell'e baglan |
| `make pgadmin` | pgAdmin'i tarayicide ac |
| `make db-reset` | Veritabanini sifirla |
| `make dev` | Node.js sunucusunu baslat |
| `make start-all` | Her seyi baslat (Docker + Node) |

## Manuel Docker Komutlari

```bash
# Container'lari baslat
docker-compose up -d

# Container'lari durdur
docker-compose down

# Loglari izle
docker-compose logs -f postgres

# Veritabanina baglan
docker exec -it poe-farm-db psql -U postgres -d poefarm

# Container'lari ve volumeleri sil (TUM VERILER SILINIR!)
docker-compose down -v
```

## Docker'siz Kurulum (Gelismis)

Eger kendi PostgreSQL kurulumunuzu kullanmak istiyorsaniz:

1. PostgreSQL kurun ve calistirin
2. `poefarm` adinda bir veritabani olusturun
3. `.env` dosyasinda baglanti bilgilerini guncelleyin
4. `npm install && npm run dev`

## Ortam Degiskenleri

### Docker ile (Varsayilan)
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poefarm
DB_USER=postgres
DB_PASSWORD=postgres123
```

### Docker'siz
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poefarm
DB_USER=postgres
DB_PASSWORD=your_password
```

## pgAdmin Kullanimi

1. http://localhost:5050 adresine gidin
2. Giris yapin (admin@poefarm.local / admin123)
3. "Add New Server" tiklayin
4. General tab:
   - Name: `PoE Farm`
5. Connection tab:
   - Host: `postgres` (container adi)
   - Port: `5432`
   - Database: `poefarm`
   - Username: `postgres`
   - Password: `postgres123`

## API Dokumantasyonu

### Auth
- `POST /api/auth/register` - Yeni kullanici
- `POST /api/auth/login` - Giris
- `GET /api/auth/me` - Mevcut kullanici

### Sessions
- `GET /api/sessions` - Tum sessionlar
- `GET /api/sessions/active` - Aktif session
- `POST /api/sessions/start` - Session baslat
- `PUT /api/sessions/:id/end` - Session bitir
- `PUT /api/sessions/:id/abandon` - Session iptal

### Loot
- `POST /api/loot` - Loot ekle
- `POST /api/loot/bulk` - Toplu loot ekle
- `GET /api/loot/session/:id` - Session lootlari

### Prices
- `GET /api/prices/current` - Guncel fiyatlar
- `POST /api/prices/sync` - poe.ninja senkronizasyonu

### Stats
- `GET /api/stats/personal` - Kisisel istatistikler
- `GET /api/stats/leaderboard/:league/:period` - Leaderboard

## WebSocket

WebSocket uzerinden real-time guncellemeler:

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'SESSION_STARTED', 'LOOT_ADDED', vb.
};
```

## Veritabani Yonetimi

### SQL Shell
```bash
make psql

# Tablolari listele
\dt

# Verileri goruntule
SELECT * FROM users;
SELECT * FROM sessions;

# Cikis
\q
```

### Backup/Restore
```bash
# Backup al
docker exec poe-farm-db pg_dump -U postgres poefarm > backup.sql

# Restore et
docker exec -i poe-farm-db psql -U postgres poefarm < backup.sql
```

## Sorun Giderme

### Container'lar baslamiyor
```bash
# Port cakismasi var mi kontrol et
netstat -ano | findstr :5432

# Container durumunu kontrol et
docker-compose ps

# Loglari kontrol et
docker-compose logs postgres
```

### Baglanti hatasi
```bash
# Container'in calistigindan emin ol
docker ps

# Container'a ping at
docker exec poe-farm-db pg_isready -U postgres
```

### Veritabani sifirlama
```bash
# TUM VERILER SILINECEK
make db-reset
# veya
docker-compose down -v
docker-compose up -d
```

## Lisans

MIT
