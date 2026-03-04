/**
 * User Model
 * Kullanici bilgilerini ve auth islemlerini yonetir
 */

const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        len: {
          args: [3, 50],
          msg: 'Kullanici adi 3-50 karakter arasinda olmalidir'
        },
        isAlphanumeric: {
          msg: 'Kullanici adi sadece harf ve rakam icerebilir'
        }
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: 'Gecerli bir e-posta adresi giriniz'
        }
      }
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash'
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
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      // Password hashleme - sequelize hook kullanmak yerinde instance method kullanacagiz
    }
  });

  // Instance metodlari
  User.prototype.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.passwordHash);
  };

  // Statik metodlar
  User.hashPassword = async function(password) {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(password, salt);
  };

  User.findByUsername = async function(username) {
    return await this.findOne({ where: { username } });
  };

  User.findByEmail = async function(email) {
    return await this.findOne({ where: { email } });
  };

  // JSON'da password hash'i gosterme
  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.passwordHash;
    delete values.password_hash;
    return values;
  };

  return User;
};
