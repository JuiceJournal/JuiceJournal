/**
 * PoE Farm Tracker - Backend Server
 * Express + PostgreSQL + WebSocket + poe.ninja entegrasyonu
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { sequelize, Session } = require('./models');
const cronService = require('./services/cronService');
const { JWT_SECRET } = require('./middleware/auth');

// Route importları
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const lootRoutes = require('./routes/loot');
const priceRoutes = require('./routes/prices');
const statsRoutes = require('./routes/stats');

const app = express();
const server = http.createServer(app);

// WebSocket sunucusu
const wss = new WebSocket.Server({ server });

// WebSocket bağlantılarını sakla
const clients = new Map();

wss.on('connection', (ws) => {
  const authTimeout = setTimeout(() => {
    if (!clients.get(ws)?.userId) {
      ws.close(1008, 'Authentication timeout');
    }
  }, 5000);

  clients.set(ws, { userId: null });

  ws.on('message', (rawMessage) => {
    try {
      const data = JSON.parse(rawMessage);
      const metadata = clients.get(ws);

      if (!metadata?.userId) {
        if (data?.type !== 'AUTH' || typeof data.token !== 'string') {
          ws.close(1008, 'Authentication required');
          return;
        }

        const decoded = jwt.verify(data.token, JWT_SECRET);
        clients.set(ws, { userId: decoded.userId });
        clearTimeout(authTimeout);
      }
    } catch (error) {
      ws.close(1008, 'Authentication failed');
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    clients.delete(ws);
  });

  ws.on('error', () => {
    clearTimeout(authTimeout);
    clients.delete(ws);
  });
});

// İstemcilere broadcast yap
const broadcast = (data, options = {}) => {
  const { targetUserId = null } = options;
  const message = JSON.stringify(data);
  clients.forEach((metadata, client) => {
    if (targetUserId && metadata.userId !== targetUserId) {
      return;
    }

    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Global broadcast fonksiyonunu app'e ekle
app.broadcast = broadcast;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Cok fazla istek gonderildi, lutfen daha sonra tekrar deneyin'
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      websocketClients: clients.size
    },
    error: null
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/stats', statsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: 'Endpoint bulunamadi'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Sunucu hatasi:', err);
  
  res.status(err.status || 500).json({
    success: false,
    data: null,
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Bir hata olustu, lutfen daha sonra tekrar deneyin'
  });
});

// Port ayarı
const PORT = process.env.PORT || 3001;

// Sunucuyu başlat
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Veritabani baglantisi basarili.');

    const shouldAutoSyncSchema = process.env.DB_AUTO_SYNC === 'true' || (process.env.NODE_ENV || 'development') !== 'production';
    if (shouldAutoSyncSchema) {
      await sequelize.sync({ alter: true });
      console.log('Veritabani modelleri senkronize edildi.');
    } else {
      console.log('Veritabani otomatik alter kapali. Mevcut schema kullaniliyor.');
    }

    const [backfilledSessions] = await Session.update(
      {
        poeVersion: 'poe1',
        league: 'Standard'
      },
      {
        where: {
          [Op.or]: [
            { poeVersion: null },
            { league: null }
          ]
        }
      }
    );

    if (backfilledSessions > 0) {
      console.log(`${backfilledSessions} mevcut session poe1/Standard olarak guncellendi.`);
    }

    server.listen(PORT, () => {
      console.log(`Sunucu ${PORT} portunda calisiyor`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });

    cronService.startPriceSync(app);
    console.log('Fiyat senkronizasyon cron job baslatildi');

  } catch (error) {
    console.error('Sunucu baslatma hatasi:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM alindi, sunucu kapatiliyor...');
  server.close(() => {
    sequelize.close().then(() => {
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT alindi, sunucu kapatiliyor...');
  server.close(() => {
    sequelize.close().then(() => {
      process.exit(0);
    });
  });
});

startServer();
