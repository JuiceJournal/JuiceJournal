/**
 * Database seed script
 * Creates an initial admin user for first-time setup
 *
 * Usage:
 *   npm run db:seed
 *
 * Environment variables (optional):
 *   SEED_USERNAME  - Admin username (default: admin)
 *   SEED_EMAIL     - Admin email (default: admin@juicejournal.local)
 *   SEED_PASSWORD  - Admin password (auto-generated if not set)
 */

require('dotenv').config();
const crypto = require('crypto');
const { sequelize, User } = require('../models');

function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

async function seed() {
  const username = process.env.SEED_USERNAME || 'admin';
  const email = process.env.SEED_EMAIL || 'admin@juicejournal.local';
  const password = process.env.SEED_PASSWORD || generatePassword();
  const role = 'admin';

  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await sequelize.sync();

    const existing = await User.findByUsername(username);
    if (existing) {
      console.log(`User "${username}" already exists (id: ${existing.id}). Skipping.`);
      process.exit(0);
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      username,
      email,
      passwordHash,
      role
    });

    console.log('Admin user created:');
    console.log(`  Username: ${username}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Role:     ${role}`);
    console.log(`  ID:       ${user.id}`);

    if (!process.env.SEED_PASSWORD) {
      console.log(`  Password: ${password}`);
      console.log('\n  Save this password — it will not be shown again.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
