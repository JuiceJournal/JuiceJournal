const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.join(__dirname, '..', 'src', 'app', 'page.js');
const navbarPath = path.join(__dirname, '..', 'src', 'components', 'PublicNavbar.js');

test('public home route is a real landing page instead of a login redirect', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.doesNotMatch(source, /redirect\('\/login'\)/);
  assert.match(source, /ShowroomHero/);
  assert.match(source, /ShowroomDesktopShowcase/);
  assert.match(source, /ShowroomClosingCta/);
});

test('public navbar does not surface login or dashboard-first navigation', () => {
  const source = fs.readFileSync(navbarPath, 'utf8');

  assert.doesNotMatch(source, /\/login/);
  assert.doesNotMatch(source, /\/dashboard/);
  assert.match(source, /Explore the Desktop App|showroom\.primaryCta/);
});
