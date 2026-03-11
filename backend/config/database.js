/**
 * Veritabani yapilandirmasi
 * Sequelize ile PostgreSQL baglantisi
 */

const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('../services/logger');

const sequelize = new Sequelize(
  env.db.name,
  env.db.user,
  env.db.password,
  {
    host: env.db.host,
    port: env.db.port,
    dialect: 'postgres',
    logging: env.isDevelopment ? (msg) => logger.debug('sequelize', { msg }) : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: false
    }
  }
);

module.exports = sequelize;
