/**
 * Modellerin merkezi export noktasi
 * Tum modeller ve iliskiler burada tanimlanir
 */

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// Modelleri import et
const User = require('./User')(sequelize, DataTypes);
const Session = require('./Session')(sequelize, DataTypes);
const LootEntry = require('./LootEntry')(sequelize, DataTypes);
const Price = require('./Price')(sequelize, DataTypes);

// Iliskileri tanimla

// User -> Session (Bir kullanicinin birden fazla session'i olabilir)
User.hasMany(Session, {
  foreignKey: 'userId',
  as: 'sessions',
  onDelete: 'CASCADE'
});
Session.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Session -> LootEntry (Bir session'in birden fazla loot entry'si olabilir)
Session.hasMany(LootEntry, {
  foreignKey: 'sessionId',
  as: 'lootEntries',
  onDelete: 'CASCADE'
});
LootEntry.belongsTo(Session, {
  foreignKey: 'sessionId',
  as: 'session'
});

// Export
module.exports = {
  sequelize,
  User,
  Session,
  LootEntry,
  Price
};
