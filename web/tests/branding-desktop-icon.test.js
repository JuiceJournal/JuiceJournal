const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webDir = path.resolve(__dirname, '..');
const layoutPath = path.join(webDir, 'src', 'app', 'layout.js');
const navbarPath = path.join(webDir, 'src', 'components', 'Navbar.js');
const publicNavbarPath = path.join(webDir, 'src', 'components', 'PublicNavbar.js');
const loginPagePath = path.join(webDir, 'src', 'app', 'login', 'page.js');
const brandLogoPath = path.join(webDir, 'src', 'components', 'BrandLogo.js');
const brandAssetPath = path.join(webDir, 'public', 'brand', 'logo-mark.png');

test('web metadata publishes the shared desktop-derived brand icon', () => {
  const layout = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(fs.existsSync(brandAssetPath), 'Expected web/public/brand/logo-mark.png to exist');
  assert.match(layout, /icons:\s*\{/);
  assert.match(layout, /url:\s*'\/brand\/logo-mark\.png'/);
});

test('web brand surfaces use the shared BrandLogo component', () => {
  const navbar = fs.readFileSync(navbarPath, 'utf8');
  const publicNavbar = fs.readFileSync(publicNavbarPath, 'utf8');
  const loginPage = fs.readFileSync(loginPagePath, 'utf8');

  assert.ok(fs.existsSync(brandLogoPath), 'Expected BrandLogo component to exist');
  assert.match(navbar, /import BrandLogo from ['"]@\/components\/BrandLogo['"]/);
  assert.match(publicNavbar, /import BrandLogo from ['"]@\/components\/BrandLogo['"]/);
  assert.match(loginPage, /import BrandLogo from ['"]@\/components\/BrandLogo['"]/);
  assert.match(navbar, /<BrandLogo[^>]+alt="Juice Journal logo"/);
  assert.match(publicNavbar, /<BrandLogo[^>]+alt="Juice Journal logo"/);
  assert.match(loginPage, /<BrandLogo[^>]+alt="Juice Journal logo"/);
});
