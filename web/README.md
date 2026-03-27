# Juice Journal - Web Dashboard

Next.js 14 ile gelistirilmis web arayuzu.

## Kurulum

```bash
npm install
```

## Ortam Degiskenleri

`.env.local` dosyasi olusturun:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## Calistirma

```bash
# Gelistirme modu
npm run dev

# Build
npm run build

# Uretim
npm start
```

## Teknolojiler

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Recharts (Grafikler)
- SWR (Data fetching)
- Axios (HTTP client)

## Proje Yapisi

```
src/
├── app/                    # Next.js app router
│   ├── layout.js          # Root layout
│   ├── page.js            # Anasayfa (redirect)
│   ├── login/             # Login sayfasi
│   └── dashboard/         # Dashboard sayfalari
│       ├── page.js        # Ana dashboard
│       ├── sessions/      # Session listesi
│       └── leaderboard/   # Leaderboard
├── components/            # React komponentleri
│   ├── Navbar.js
│   ├── ProfitChart.js
│   ├── SessionList.js
│   ├── AddLootModal.js
│   └── LeaderboardTable.js
├── hooks/                 # Custom hooks
│   ├── useAuth.js
│   └── useSocket.js
└── lib/                   # Yardimci fonksiyonlar
    ├── api.js
    └── utils.js
```

## Ozellikler

### Dashboard
- Aktif session gostergesi
- Gunluk/haftalik/aylik istatistikler
- Kâr trend grafigi
- Son session'lar listesi
- Hizli loot ekleme

### Sessions
- Tum session'lar listesi
- Filtreleme (aktif/tamamlanmis/iptal)
- Session bitirme
- Sonsuz kaydirma (pagination)

### Leaderboard
- Lig secimi
- Donem secimi (gunluk/haftalik/aylik)
- Siralama tablosu
- Istatistik ozeti

## Auth Flow

1. Kullanici login/register yapar
2. JWT token localStorage'a kaydedilir
3. Her request'te Authorization header eklenir
4. Token gecersizse login sayfasina yonlendirilir

## WebSocket

Real-time guncellemeler icin WebSocket kullanilir:

```javascript
const { connected, lastMessage } = useSocket();

// lastMessage.type:
// - 'SESSION_STARTED'
// - 'SESSION_COMPLETED'
// - 'LOOT_ADDED'
// - 'PRICES_SYNCED'
```

## Styling

Tailwind CSS kullanilir. Custom renkler:

```javascript
// tailwind.config.js
colors: {
  poe: {
    gold: '#d4a853',
    'gold-dark': '#b8923e',
    dark: '#1a1a1a',
    darker: '#111111',
    card: '#252525',
    border: '#333333',
  }
}
```

## Build

```bash
# Gelistirme build'i
npm run build

# Static export (opsiyonel)
# next.config.js'de output: 'export' ekleyin
```

## SEO

Metadata `layout.js` ve sayfa dosyalarinda tanimlanir:

```javascript
export const metadata = {
  title: 'Sayfa Basligi',
  description: 'Sayfa aciklamasi'
};
```
