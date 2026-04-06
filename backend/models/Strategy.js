module.exports = (sequelize, DataTypes) => {
  const Strategy = sequelize.define('Strategy', {
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
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Strategy name is required'
        }
      }
    },
    slug: {
      type: DataTypes.STRING(180),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'Strategy slug is required'
        }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mapName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'map_name'
    },
    poeVersion: {
      type: DataTypes.ENUM('poe1', 'poe2'),
      allowNull: false,
      defaultValue: 'poe1',
      field: 'poe_version'
    },
    league: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Standard'
    },
    visibility: {
      type: DataTypes.ENUM('private', 'public'),
      allowNull: false,
      defaultValue: 'private'
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at'
    },
    lastCalculatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_calculated_at'
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
    tableName: 'strategies',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['slug'], unique: true },
      { fields: ['visibility'] },
      { fields: ['poe_version', 'league'] },
      { fields: ['published_at'] }
    ]
  });

  return Strategy;
};
