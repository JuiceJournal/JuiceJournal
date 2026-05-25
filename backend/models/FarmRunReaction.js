module.exports = (sequelize, DataTypes) => {
  const FarmRunReaction = sequelize.define('FarmRunReaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    runId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'run_id',
      references: {
        model: 'published_farm_runs',
        key: 'id'
      }
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
    reaction: {
      type: DataTypes.ENUM('divine', 'holy', 'pog'),
      allowNull: false
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
    tableName: 'farm_run_reactions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['run_id'] },
      { fields: ['user_id'] },
      { unique: true, fields: ['run_id', 'user_id', 'reaction'] }
    ]
  });

  return FarmRunReaction;
};
