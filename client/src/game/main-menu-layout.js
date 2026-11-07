// Main menu content and stage layout in design pixels; Phaser FIT scales the stage into #menu-game.
// Keys must match the data-menu buttons in client/index.html (checked by main-menu-layout.test.js).

// panel = which third of the triptych art the card shows (0 left, 1 center, 2 right).
export const menuModes = [
  { key: 'single', title: 'Single Player', tag: 'SOLO', blurb: 'Dungeon runs, loot and bosses', panel: 1 },
  { key: 'multiplayer', title: 'Multiplayer', tag: 'CO-OP', blurb: 'Four seats. One shared boss.', panel: 2 },
  { key: 'tower', title: 'Infinite Tower', tag: 'ENDLESS', blurb: 'A boss every ten floors', panel: 0 },
];

// ︎ asks for the plain-text form of symbols that also exist as emoji.
export const menuDock = [
  { key: 'quests', label: 'Quests', glyph: '☀︎' },
  { key: 'character', label: 'Character', glyph: '♟︎' },
  { key: 'lab', label: 'Lab', glyph: '⚗︎' },
  { key: 'store', label: 'Store', glyph: '♦︎' },
  { key: 'leaderboard', label: 'Ranks', glyph: '★' },
];

// width/height are layout units; the canvas is (width * zoom) x (height * zoom) pixels.
export function getMenuLayout(portrait) {
  if (portrait) {
    // A compact layout drawn through a 1.5x camera zoom, so text stays legible on phones.
    return {
      portrait,
      zoom: 1.5,
      width: 600,
      height: 1060,
      hud: { y: 64, badgeX: 56, nameX: 112, nameMax: 276, goldX: 590, goldY: 128, settingsX: 430, exitX: 535 },
      cards: menuModes.map((_, index) => ({ x: 300, y: 286 + index * 256, w: 560, h: 236 })),
      dock: menuDock.map((_, index) => ({ x: 300 + (index - 2) * 115, y: 976, r: 36 })),
    };
  }
  return {
    portrait,
    zoom: 1,
    width: 1600,
    height: 900,
    hud: { y: 86, badgeX: 92, nameX: 160, nameMax: 900, goldX: 1370, goldY: 86, settingsX: 1420, exitX: 1515 },
    cards: menuModes.map((_, index) => ({ x: 800 + (index - 1) * 484, y: 460, w: 440, h: 560 })),
    dock: menuDock.map((_, index) => ({ x: 800 + (index - 2) * 150, y: 812, r: 38 })),
  };
}
