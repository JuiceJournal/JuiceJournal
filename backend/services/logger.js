const env = require('../config/env');

function write(level, message, meta = {}) {
  const timestamp = new Date().toISOString();

  if (env.isProduction) {
    process.stdout.write(`${JSON.stringify({ timestamp, level, message, ...meta })}\n`);
    return;
  }

  const serializedMeta = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  process.stdout.write(`[${timestamp}] ${level.toUpperCase()} ${message}${serializedMeta}\n`);
}

module.exports = {
  debug(message, meta = {}) {
    if (env.isDevelopment) {
      write('debug', message, meta);
    }
  },
  info(message, meta = {}) {
    write('info', message, meta);
  },
  warn(message, meta = {}) {
    write('warn', message, meta);
  },
  error(message, meta = {}) {
    write('error', message, meta);
  }
};
