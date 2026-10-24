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

function getContrastRatio(foreground, background) {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('a selected chip shows a check mark, and a selected farm chip keeps its colour on the raised plate', () => {
  assert.match(overlayCss, /\.jj-chip\[aria-pressed="true"\]::before\s*\{[^}]*border:\s*solid currentColor/);

  const pressedFarmRule = overlayCss.match(/\.jj-chip\[data-farm-type\]\[aria-pressed="true"\]\s*\{([^}]*)\}/);
  assert.ok(pressedFarmRule, 'Expected a rule for the selected farm chip');
  assert.match(pressedFarmRule[1], /background:\s*var\(--plate-raised\)/);
  assert.match(pressedFarmRule[1], /box-shadow:\s*inset 0 0 0 2px var\(--farm-color\)/);

  const tokensCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'tokens.css'), 'utf8');
  const plateRaised = tokensCss.match(/--plate-raised:\s*(#[0-9a-fA-F]{6});/)[1];
  const farmColors = [...tokensCss.matchAll(/--(farm-[a-z]+):\s*(#[0-9a-fA-F]{6});/g)];
  assert.ok(farmColors.length > 0);
  for (const [, name, color] of farmColors) {
    const ratio = getContrastRatio(color, plateRaised);
    assert.ok(ratio >= 4.5, `--${name} on --plate-raised is ${ratio.toFixed(2)}:1`);
  }
});
