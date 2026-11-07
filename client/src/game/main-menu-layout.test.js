import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getMenuLayout, menuDock, menuModes } from './main-menu-layout.js';

const dockLabelSpace = 40; // the label is drawn under each dock circle
const goldPillHalfHeight = 24;

for (const portrait of [false, true]) {
  test(`${portrait ? 'portrait' : 'landscape'} main menu fits its stage without overlaps`, () => {
    const { width, height, hud, cards, dock } = getMenuLayout(portrait);
    assert.equal(cards.length, menuModes.length);
    assert.equal(dock.length, menuDock.length);

    const boxes = cards.map(({ x, y, w, h }) => ({
      left: x - w / 2,
      right: x + w / 2,
      top: y - h / 2,
      bottom: y + h / 2,
    }));
    for (const box of boxes) {
      assert.ok(box.left >= 0 && box.right <= width && box.bottom <= height, 'card leaves the stage');
      assert.ok(box.top >= hud.goldY + goldPillHalfHeight, 'card overlaps the HUD row');
    }
    boxes.forEach((a, index) => boxes.slice(index + 1).forEach((b) => {
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, 'cards overlap');
    }));

    const lowestCard = Math.max(...boxes.map(({ bottom }) => bottom));
    for (const { x, y, r } of dock) {
      assert.ok(x - r >= 0 && x + r <= width && y + r + dockLabelSpace <= height, 'dock button leaves the stage');
      assert.ok(y - r > lowestCard, 'dock overlaps the cards');
    }
  });
}

test('every canvas menu item has a hidden button with the same data-menu key', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const domKeys = new Set([...html.matchAll(/data-menu="([^"]+)"/g)].map(([, key]) => key));
  for (const key of [...menuModes, ...menuDock].map((item) => item.key).concat('settings', 'exit')) {
    assert.ok(domKeys.has(key), `missing data-menu="${key}" in client/index.html`);
  }
});
