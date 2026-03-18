/**
 * Price Model
 * poe.ninja'dan cekilen item fiyatlarini saklar
 */

const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const Price = sequelize.define('Price', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
        'base_type',
        'other'
      ),
      allowNull: false,
      field: 'item_type'
    },
    chaosValue: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      field: 'chaos_value',
      validate: {
        min: {
          args: 0,
          msg: 'Chaos degeri negatif olamaz'
        }
      }
    },
    divineValue: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true,
      field: 'divine_value'
    },
    league: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Standard'
    },
    poeVersion: {
      type: DataTypes.ENUM('poe1', 'poe2'),
      allowNull: false,
      defaultValue: 'poe1',
      field: 'poe_version'
    },
    iconUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'icon_url'
    },
    sparklineData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'sparkline_data'
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'prices',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['item_name', 'league', 'poe_version'],
        unique: true
      },
      {
        fields: ['item_type']
      },
      {
        fields: ['league']
      },
      {
        fields: ['poe_version']
      },
      {
        fields: ['active']
      },
      {
        fields: ['updated_at']
      }
    ]
  });

  Price.findByName = async function(itemName, league = 'Standard', poeVersion = 'poe1') {
    return await this.findOne({
      where: {
        itemName,
        league,
        poeVersion,
        active: true
      }
    });
  };

  Price.findByType = async function(itemType, league = 'Standard', limit = 100, poeVersion = 'poe1') {
    return await this.findAll({
      where: {
        itemType,
        league,
        poeVersion,
        active: true
      },
      order: [['chaosValue', 'DESC']],
      limit
    });
  };

  Price.getCurrentLeague = async function(poeVersion = 'poe1') {
    const where = { poeVersion };
    const result = await this.findOne({
      attributes: ['league'],
      where,
      order: [['updatedAt', 'DESC']],
      raw: true
    });

    return result?.league || process.env.DEFAULT_LEAGUE || 'Standard';
  };

  Price.upsertPrice = async function(itemData) {
    const [price, created] = await this.upsert(itemData, {
      returning: true,
      conflictFields: ['item_name', 'league', 'poe_version']
    });

    return { price, created };
  };

  Price.bulkUpsert = async function(items, league, poeVersion = 'poe1') {
    if (!items.length) return [];

    // Deduplicate by name (keep highest chaosValue) and filter invalid values
    const deduped = new Map();
    for (const item of items) {
      if (!item.name || item.chaosValue < 0) continue;
      const key = item.name.toLowerCase();
      const existing = deduped.get(key);
      if (!existing || (item.chaosValue || 0) > (existing.chaosValue || 0)) {
        deduped.set(key, item);
      }
    }

    const records = [...deduped.values()].map(item => ({
      itemName: item.name,
      itemType: item.type,
      chaosValue: Math.max(0, item.chaosValue || 0),
      divineValue: item.divineValue,
      league,
      poeVersion,
      iconUrl: item.iconUrl,
      sparklineData: item.sparklineData,
      active: true,
      updatedAt: new Date()
    }));

    // Process in chunks to avoid oversized queries
    const CHUNK_SIZE = 500;
    const allResults = [];

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      try {
        const result = await this.bulkCreate(chunk, {
          updateOnDuplicate: ['chaosValue', 'divineValue', 'iconUrl', 'sparklineData', 'active', 'updatedAt', 'itemType'],
          returning: true
        });
        allResults.push(...result.map(price => ({ price, created: price.isNewRecord !== false })));
      } catch (error) {
        console.error(`Bulk upsert chunk hatasi (${i}-${i+chunk.length}):`, error.message);
        // Fallback to individual upserts for this chunk
        for (const record of chunk) {
          try {
            const result = await this.upsertPrice(record);
            allResults.push(result);
          } catch (err) {
            // silently skip individual failures
          }
        }
      }
    }

    return allResults;
  };

  Price.deactivateOldPrices = async function(league, olderThanMinutes = 120, poeVersion = 'poe1') {
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const [updatedCount] = await this.update(
      { active: false },
      {
        where: {
          league,
          poeVersion,
          updatedAt: {
            [Op.lt]: cutoffDate
          },
          active: true
        }
      }
    );

    return updatedCount;
  };

  return Price;
};
