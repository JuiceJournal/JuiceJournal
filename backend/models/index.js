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
const Strategy = require('./Strategy')(sequelize, DataTypes);
const StrategySession = require('./StrategySession')(sequelize, DataTypes);
const StrategyTag = require('./StrategyTag')(sequelize, DataTypes);

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

User.hasMany(Strategy, {
  foreignKey: 'userId',
  as: 'strategies',
  onDelete: 'CASCADE'
});
Strategy.belongsTo(User, {
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

Strategy.belongsToMany(Session, {
  through: StrategySession,
  foreignKey: 'strategyId',
  otherKey: 'sessionId',
  as: 'sessions'
});
Session.belongsToMany(Strategy, {
  through: StrategySession,
  foreignKey: 'sessionId',
  otherKey: 'strategyId',
  as: 'strategies'
});

Strategy.hasMany(StrategySession, {
  foreignKey: 'strategyId',
  as: 'strategySessions',
  onDelete: 'CASCADE'
});
StrategySession.belongsTo(Strategy, {
  foreignKey: 'strategyId',
  as: 'strategy'
});

Session.hasMany(StrategySession, {
  foreignKey: 'sessionId',
  as: 'strategySessions',
  onDelete: 'CASCADE'
});
StrategySession.belongsTo(Session, {
  foreignKey: 'sessionId',
  as: 'session'
});

Strategy.hasMany(StrategyTag, {
  foreignKey: 'strategyId',
  as: 'tags',
  onDelete: 'CASCADE'
});
StrategyTag.belongsTo(Strategy, {
  foreignKey: 'strategyId',
  as: 'strategy'
});

// Export
module.exports = {
  sequelize,
  User,
  Session,
  LootEntry,
  Price,
  Strategy,
  StrategySession,
  StrategyTag
};
