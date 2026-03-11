const fs = require('fs');
const path = require('path');
const sequelize = require('./database');
const logger = require('../services/logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const [rows] = await sequelize.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function applyMigration(filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(fullPath, 'utf8');

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(sql, { transaction });
    await sequelize.query(
      'INSERT INTO schema_migrations (filename, applied_at) VALUES (:filename, NOW())',
      {
        replacements: { filename },
        transaction
      }
    );
  });

  logger.info('migration applied', { filename });
}

async function run() {
  await sequelize.authenticate();
  await ensureMigrationsTable();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.info('no migrations directory found');
    return;
  }

  const applied = await getAppliedMigrations();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (!applied.has(file)) {
      await applyMigration(file);
    }
  }

  logger.info('migrations complete', { total: files.length });
}

run()
  .then(async () => {
    await sequelize.close();
  })
  .catch(async (error) => {
    logger.error('migration failed', { message: error.message });
    await sequelize.close();
    process.exit(1);
  });
