/**
 * Database seed script
 * Creates a mock test user for development/testing
 *
 * Usage: npm run db:seed
 */

require('dotenv').config();
const { sequelize, User } = require('../models');

const TEST_USER = {
  username: 'testuser',
  email: 'test@poefarm.com',
  password: 'Test1234'
};

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // Ensure tables exist
    await sequelize.sync();

    // Check if test user already exists
    const existing = await User.findByUsername(TEST_USER.username);
    if (existing) {
      console.log(`Test user "${TEST_USER.username}" already exists (id: ${existing.id}). Skipping.`);
      process.exit(0);
    }

    const passwordHash = await User.hashPassword(TEST_USER.password);
    const user = await User.create({
      username: TEST_USER.username,
      email: TEST_USER.email,
      passwordHash
    });

    console.log('Mock test user created:');
    console.log(`  Username: ${TEST_USER.username}`);
    console.log(`  Email:    ${TEST_USER.email}`);
    console.log(`  Password: ${TEST_USER.password}`);
    console.log(`  ID:       ${user.id}`);

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
