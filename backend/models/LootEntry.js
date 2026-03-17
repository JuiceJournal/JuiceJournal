/**
 * LootEntry Model
 * Her map oturumunda toplanan item kayitlarini tutar
 */

module.exports = (sequelize, DataTypes) => {
  const LootEntry = sequelize.define('LootEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
    itemName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'item_name',
      validate: {
        notEmpty: {
          msg: 'Item adi bos olamaz'
        }
      }
    },
    itemType: {
      type: DataTypes.ENUM(
        'currency',
        'fragment',
        'scarab',
        'map',
        'divination_card',
        'gem',
        'unique',
        'oil',
        'incubator',
        'delirium_orb',
        'catalyst',
        'essence',
        'fossil',
        'beast',
        'rune',
        'tattoo',
        'omen',
        'soul_core',
        'idol',
        'expedition',
        'ultimatum',
        'other'
      ),
      allowNull: false,
      defaultValue: 'other',
      field: 'item_type'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: {
          args: 1,
          msg: 'Miktar en az 1 olmalidir'
        }
      }
    },
    chaosValue: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      field: 'chaos_value',
      validate: {
        min: {
          args: 0,
          msg: 'Deger negatif olamaz'
        }
      }
    },
    divineValue: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
      field: 'divine_value'
    },
    source: {
      type: DataTypes.ENUM('manual', 'ocr', 'api'),
      allowNull: false,
      defaultValue: 'manual'
    },
    screenshotPath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'screenshot_path'
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
    tableName: 'loot_entries',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['session_id']
      },
      {
        fields: ['item_name']
      },
      {
        fields: ['item_type']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Instance metodlari
  LootEntry.prototype.getTotalChaosValue = function() {
    return parseFloat(this.chaosValue) * this.quantity;
  };

  // Statik metodlar
  LootEntry.findBySession = async function(sessionId) {
    return await this.findAll({
      where: { sessionId },
      order: [['createdAt', 'DESC']]
    });
  };

  LootEntry.getTotalsBySession = async function(sessionId) {
    const result = await this.findAll({
      where: { sessionId },
      attributes: [
        [sequelize.fn('SUM', sequelize.literal('quantity * chaos_value')), 'totalChaosValue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'itemCount']
      ],
      raw: true
    });
    
    return {
      totalChaosValue: parseFloat(result[0].totalChaosValue) || 0,
      itemCount: parseInt(result[0].itemCount) || 0
    };
  };

  LootEntry.getTopItemsBySession = async function(sessionId, limit = 10) {
    return await this.findAll({
      where: { sessionId },
      order: [[sequelize.literal('quantity * chaos_value'), 'DESC']],
      limit
    });
  };

  return LootEntry;
};
