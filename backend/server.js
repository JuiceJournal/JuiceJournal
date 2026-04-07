/**
 * Juice Journal - Backend Server
 * Express + PostgreSQL + WebSocket + poe.ninja entegrasyonu
 */

// Prevent prototype pollution via Object.freeze before any JSON.parse
Object.freeze(Object.prototype);

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
const env = require('./config/env');
const logger = require('./services/logger');

// Route importları
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const lootRoutes = require('./routes/loot');
const priceRoutes = require('./routes/prices');
const statsRoutes = require('./routes/stats');
const strategyRoutes = require('./routes/strategies');
const publicStrategyRoutes = require('./routes/publicStrategies');
const poeRoutes = require('./routes/poe');

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

        const decoded = jwt.verify(data.token, env.auth.jwtSecret, { algorithms: ['HS256'] });
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
const helmetConfig = helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false
});
app.use(helmetConfig);

// CORS origin validation — reject wildcards and null
const rawOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];
const corsOrigins = rawOrigins.filter(origin => {
  if (origin === '*' || origin === 'null') {
    logger.warn('cors origin rejected: unsafe value', { origin });
    return false;
  }
  return true;
});
if (corsOrigins.length === 0) {
  logger.error('no valid cors origins configured, defaulting to localhost');
  corsOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
}
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.debug('request', { method: req.method, path: req.path });
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
app.use('/api/strategies', strategyRoutes);
app.use('/api/public/strategies', publicStrategyRoutes);
app.use('/api/poe', poeRoutes);

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
  logger.error('server_error', { message: err.message, stack: err.stack });

  res.status(err.status || 500).json({
    success: false,
    data: null,
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Bir hata olustu, lutfen daha sonra tekrar deneyin'
  });
});

// Port ayarı
const PORT = env.port;

// Sunucuyu başlat
const startServer = async () => {
  try {
    await sequelize.authenticate();
    logger.info('database connection established');

    const shouldAutoSyncSchema = env.db.autoSync;
    if (shouldAutoSyncSchema) {
      await sequelize.sync({ alter: true });
      logger.info('database models synchronized');
    } else {
      logger.info('database auto sync disabled');
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
      logger.info('backfilled sessions with default poe context', { count: backfilledSessions });
    }

    server.listen(PORT, () => {
      logger.info('server started', { port: PORT, env: env.nodeEnv });
    });

    if (env.poe.mock) {
      logger.warn('PoE OAuth is running in MOCK mode — not suitable for production');
    }

    cronService.startPriceSync(app);
    logger.info('price sync cron started');

  } catch (error) {
    logger.error('server startup failed', { message: error.message });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_promise_rejection', { reason: reason?.message || String(reason) });
});

process.on('SIGTERM', () => {
  logger.info('received SIGTERM, shutting down');
  server.close(() => {
    sequelize.close().then(() => {
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('received SIGINT, shutting down');
  server.close(() => {
    sequelize.close().then(() => {
      process.exit(0);
    });
  });
});

startServer();
