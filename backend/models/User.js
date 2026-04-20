/**
 * User Model
 * Manages user details and auth operations
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
          msg: 'Username must be between 3 and 50 characters'
        },
        isAlphanumeric: {
          msg: 'Username may only contain letters and numbers'
        }
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: 'Enter a valid email address'
        }
      }
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'user',
      validate: {
        isIn: {
          args: [['user', 'admin']],
          msg: 'Invalid user role'
        }
      }
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash'
    },
    poeSub: {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: true,
      field: 'poe_sub'
    },
    poeAccountName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'poe_account_name'
    },
    poeAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'poe_access_token'
    },
    poeRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'poe_refresh_token'
    },
    poeTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'poe_token_expires_at'
    },
    poeLinkedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'poe_linked_at'
    },
    poeMock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'poe_mock'
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
      // Password hashing is handled by the explicit instance/static methods below.
    }
  });

  // Instance methods
  User.prototype.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.passwordHash);
  };

  // Static methods
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

  User.prototype.getPoeStatus = function() {
    return {
      linked: Boolean(this.poeSub),
      accountName: this.poeAccountName || null,
      linkedAt: this.poeLinkedAt || null,
      mock: Boolean(this.poeMock),
    };
  };

  // JSON'da password hash'i gosterme
  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.passwordHash;
    delete values.password_hash;
    delete values.poeAccessToken;
    delete values.poe_access_token;
    delete values.poeRefreshToken;
    delete values.poe_refresh_token;
    values.poe = this.getPoeStatus();
    return values;
  };

  return User;
};
