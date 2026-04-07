/**
 * Session Model
 * PoE map oturumlarini temsil eder
 */

const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define('Session', {
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
    mapName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'map_name',
      validate: {
        notEmpty: {
          msg: 'Map adi bos olamaz'
        }
      }
    },
    mapTier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'map_tier',
      validate: {
        min: {
          args: 1,
          msg: 'Map tier en az 1 olabilir'
        },
        max: {
          args: 21,
          msg: 'Map tier en fazla 21 olabilir'
        }
      }
    },
    mapType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'map_type'
    },
    strategyTag: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'strategy_tag'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    league: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Standard',
      validate: {
        notEmpty: {
          msg: 'Lig gereklidir'
        }
      }
    },
    poeVersion: {
      type: DataTypes.ENUM('poe1', 'poe2'),
      allowNull: false,
      defaultValue: 'poe1',
      field: 'poe_version',
      validate: {
        isIn: {
          args: [['poe1', 'poe2']],
          msg: 'Gecersiz PoE versiyonu'
        }
      }
    },
    costChaos: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'cost_chaos',
      validate: {
        min: {
          args: [0],
          msg: 'Maliyet negatif olamaz'
        }
      }
    },
    durationSec: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_sec'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'started_at',
      defaultValue: DataTypes.NOW
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at'
    },
    status: {
      type: DataTypes.ENUM('active', 'completed', 'abandoned'),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: {
          args: [['active', 'completed', 'abandoned']],
          msg: 'Gecersiz durum degeri'
        }
      }
    },
    totalLootChaos: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_loot_chaos'
    },
    profitChaos: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'profit_chaos'
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
    tableName: 'sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['started_at']
      },
      {
        fields: ['poe_version', 'league']
      },
      {
        fields: ['user_id', 'status']
      }
    ]
  });

  // Instance metodlari
  Session.prototype.calculateProfit = async function () {
    const LootEntry = this.sequelize.models.LootEntry;
    const [result] = await LootEntry.findAll({
      attributes: [[
        this.sequelize.literal('COALESCE(SUM("chaos_value" * quantity), 0)'),
        'totalLoot'
      ]],
      where: { sessionId: this.id },
      raw: true
    });
    const totalLoot = parseFloat(result?.totalLoot || 0);

    this.totalLootChaos = totalLoot;
    this.profitChaos = totalLoot - parseFloat(this.costChaos);

    await this.save();
    return this.profitChaos;
  };

  Session.prototype.complete = async function (endedAtOverride = null) {
    this.status = 'completed';
    this.endedAt = endedAtOverride ? new Date(endedAtOverride) : new Date();

    if (this.startedAt) {
      this.durationSec = Math.floor((this.endedAt - this.startedAt) / 1000);
    }

    await this.calculateProfit();
    return this;
  };

  Session.prototype.abandon = async function (endedAtOverride = null) {
    this.status = 'abandoned';
    this.endedAt = endedAtOverride ? new Date(endedAtOverride) : new Date();

    if (this.startedAt) {
      this.durationSec = Math.floor((this.endedAt - this.startedAt) / 1000);
    }

    await this.save();
    return this;
  };

  // Statik metodlar
  Session.findActiveByUser = async function (userId) {
    return await this.findOne({
      where: {
        userId,
        status: 'active'
      }
    });
  };

  Session.findByUserAndDateRange = async function (userId, startDate, endDate) {
    return await this.findAll({
      where: {
        userId,
        startedAt: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      order: [['startedAt', 'DESC']]
    });
  };

  return Session;
};
