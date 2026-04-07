/**
 * StashSnapshot Model
 * Stores point-in-time snapshots of selected stash tabs taken via the GGG API.
 * Two snapshots can later be diffed to compute farming profit automatically.
 */

const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const StashSnapshot = sequelize.define('StashSnapshot', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    sessionId: {
      // Optional link back to the Session this snapshot belongs to (for the
      // "before" / "after" pair attached to a tracked map run).
      type: DataTypes.UUID,
      allowNull: true,
      field: 'session_id'
    },
    league: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
    poeVersion: {
      type: DataTypes.ENUM('poe1', 'poe2'),
      allowNull: false,
      defaultValue: 'poe1',
      field: 'poe_version'
    },
    label: {
      // User-friendly label, e.g. "Before Map", "After Map", "Daily 14:00"
      type: DataTypes.STRING(120),
      allowNull: true
    },
    kind: {
      // 'before' / 'after' / 'manual' — useful for grouping in the UI
      type: DataTypes.ENUM('before', 'after', 'manual'),
      allowNull: false,
      defaultValue: 'manual'
    },
    takenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'taken_at'
    },
    tabs: {
      // Compact list of tabs the snapshot covers: [{ id, name, type, index }]
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    items: {
      // Normalized item list. Each entry is small enough that thousands of
      // items still fit in JSONB comfortably:
      // { name, baseType, typeLine, category, quantity, frameType,
      //   stashId, stashName, chaosValue, totalChaosValue, icon? }
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    totalChaosValue: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0,
      field: 'total_chaos_value'
    },
    pricedItemCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'priced_item_count'
    },
    unpricedItemCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'unpriced_item_count'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'stash_snapshots',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['session_id'] },
      { fields: ['user_id', 'taken_at'] },
      { fields: ['user_id', 'league'] }
    ]
  });

  StashSnapshot.findByUserAndDateRange = async function(userId, startDate, endDate) {
    return await this.findAll({
      where: {
        userId,
        takenAt: { [Op.gte]: startDate, [Op.lte]: endDate }
      },
      order: [['takenAt', 'DESC']]
    });
  };

  return StashSnapshot;
};
