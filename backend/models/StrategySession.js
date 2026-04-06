module.exports = (sequelize, DataTypes) => {
  const StrategySession = sequelize.define('StrategySession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    strategyId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'strategy_id',
      references: {
        model: 'strategies',
        key: 'id'
      }
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'session_id',
      references: {
        model: 'sessions',
        key: 'id'
      }
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
    tableName: 'strategy_sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['strategy_id'] },
      { fields: ['session_id'] },
      { fields: ['strategy_id', 'session_id'], unique: true }
    ]
  });

  return StrategySession;
};
