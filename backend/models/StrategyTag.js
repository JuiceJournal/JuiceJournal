module.exports = (sequelize, DataTypes) => {
  const StrategyTag = sequelize.define('StrategyTag', {
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
    tag: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Tag is required'
        }
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
    tableName: 'strategy_tags',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['strategy_id'] },
      { fields: ['tag'] },
      { fields: ['strategy_id', 'tag'], unique: true }
    ]
  });

  return StrategyTag;
};
