const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay.html'), 'utf8');
const overlayCss = overlayHtml.slice(overlayHtml.indexOf('<style>'), overlayHtml.indexOf('</style>'));

test('overlay uses the bundled fonts and design tokens', () => {
  assert.match(overlayHtml, /<link rel="stylesheet" href="assets\/fonts\/fonts\.css">/);
  assert.match(overlayHtml, /<link rel="stylesheet" href="tokens\.css">/);
  assert.match(overlayHtml, /<script src="modules\/profitTierModel\.js"><\/script>/);
  assert.doesNotMatch(overlayCss, /"Inter"/);
  assert.deepEqual(overlayCss.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g) || [], []);
});

test('overlay card follows the over-game readability rules', () => {
  // backdrop-filter does nothing over another window and costs compositing; the plate is opaque instead.
  assert.doesNotMatch(overlayCss, /backdrop-filter\s*:/);
  assert.doesNotMatch(overlayCss, /animation:[^;]*infinite/);

  const fontSizes = [...overlayCss.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 0);
  assert.ok(Math.min(...fontSizes) >= 11, `Smallest overlay font is ${Math.min(...fontSizes)}px`);

  const targetHeights = [...overlayCss.matchAll(/min-height:\s*(\d+)px/g)].map((match) => Number(match[1]))
    .filter((height) => height !== 18);
  assert.ok(Math.min(...targetHeights) >= 28, 'Overlay click targets should be at least 28px tall');
});
