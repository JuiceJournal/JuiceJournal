module.exports = (sequelize, DataTypes) => {
  const PublishedFarmRun = sequelize.define('PublishedFarmRun', {
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
    visibility: {
      type: DataTypes.ENUM('private', 'unlisted', 'public'),
      allowNull: false,
      defaultValue: 'private'
    },
    poeVersion: {
      type: DataTypes.ENUM('poe1', 'poe2'),
      allowNull: false,
      field: 'poe_version'
    },
    league: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    farmType: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'farm_type'
    },
    runCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'run_count'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at'
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'duration_seconds'
    },
    setupDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'setup_description'
    },
    investmentKnown: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'investment_known'
    },
    calculationStatus: {
      type: DataTypes.ENUM('calculated', 'zeroCalculated', 'partial', 'failed', 'notCalculated'),
      allowNull: false,
      defaultValue: 'notCalculated',
      field: 'calculation_status'
    },
    profitChaos: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: true,
      field: 'profit_chaos'
    },
    priceContext: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'price_context'
    },
    maps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    breakdown: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    topLoot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'top_loot'
    },
    characterContext: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'character_context'
    },
    publisherDisplayName: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'publisher_display_name'
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at'
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
    tableName: 'published_farm_runs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['visibility'] },
      { fields: ['poe_version', 'league'] },
      { fields: ['farm_type'] },
      { fields: ['published_at'] },
      { fields: ['profit_chaos'] }
    ]
  });

  return PublishedFarmRun;
};
