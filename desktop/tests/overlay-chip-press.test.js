const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay.html'), 'utf8').replace(/\r\n/g, '\n');

function ruleBody(selector) {
  const start = overlayHtml.indexOf(`\n    ${selector} {\n`);
  assert.ok(start >= 0, `overlay.html should style ${selector}`);
  return overlayHtml.slice(start, overlayHtml.indexOf('\n    }', start));
}

test('a chip pressed in the last row does not make its row scroll, so the click lands on it', () => {
  // A pressed chip moves down by this much.
  const press = /\.jj-chip:active:not\(:disabled\) \{\n\s*transform: translateY\((\d+)px\);/.exec(overlayHtml);
  assert.ok(press, 'a pressed chip moves down');

  // The row holds that move in its own padding. Without it the move overflowed the scrolling row, a scrollbar
  // narrowed it, the chips wrapped anew and the mouse was released over another chip, so the click was lost.
  const chips = ruleBody('.jj-chips');
  assert.match(chips, /overflow-y: auto;/);
  const padding = /padding-bottom: (\d+)px;/.exec(chips);
  assert.ok(padding, '.jj-chips keeps room under its last row');
  assert.ok(Number(padding[1]) >= Number(press[1]), 'the room is at least the press move');
});
