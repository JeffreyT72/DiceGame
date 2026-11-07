import Phaser from 'phaser';
import modesArt from '../assets/backgrounds/3a2d8fba-cd05-4017-8020-fb3e3a06f2f1.jpg';
import { getMenuLayout, menuDock, menuModes } from './main-menu-layout.js';

const accent = 0xf07dc6;
const gold = 0xf0d778;
const panelFill = 0x221722;
const panelFillActive = 0x3a2436;
const serif = 'Georgia, "Times New Roman", serif';
const sans = 'Inter, ui-sans-serif, system-ui, sans-serif';

// View only: it reads player data from the registry and reports clicks as 'menu-select' game events.
class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('main-menu');
  }

  preload() {
    this.load.image('menu-modes', modesArt);
  }

  create() {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.layout = getMenuLayout(this.scale.height > this.scale.width);
    this.cameras.main.setZoom(this.layout.zoom).centerOn(this.layout.width / 2, this.layout.height / 2);
    this.highlights = new Map();
    this.pips = new Map();
    this.activeKey = null;
    this.pressedKey = null;

    if (!this.reduceMotion) this.addEmbers();
    menuModes.forEach((mode, index) => this.addModeCard(mode, this.layout.cards[index], index));
    menuDock.forEach((item, index) => this.addDockButton(item, this.layout.dock[index], index));
    this.addHud();

    const onData = (_parent, key, value) => {
      if (key === 'hud') this.renderHud(value);
      if (key === 'focus') this.setActive(value);
    };
    this.registry.events.on('changedata', onData);
    this.scale.on('resize', this.matchOrientation, this);
    this.events.once('shutdown', () => {
      this.registry.events.off('changedata', onData);
      this.scale.off('resize', this.matchOrientation, this);
    });
    this.renderHud(this.registry.get('hud'));
    this.setActive(this.registry.get('focus'));
  }

  matchOrientation() {
    const { clientWidth, clientHeight } = this.scale.parent;
    const portrait = clientWidth < clientHeight;
    // Compare with the live game size, not this.layout, so the resize fired by setGameSize cannot loop.
    if (!clientWidth || portrait === this.scale.height > this.scale.width) return;
    this.scale.setGameSize(...stageSize(portrait));
    this.scene.restart();
  }

  // Rasterize at the camera zoom so zoomed (portrait) text stays sharp.
  addText(x, y, text, style) {
    return this.add.text(x, y, text, { ...style, resolution: this.layout.zoom });
  }

  addEmbers() {
    if (!this.textures.exists('menu-ember')) {
      this.make.graphics({ add: false })
        .fillStyle(0xffffff)
        .fillCircle(4, 4, 4)
        .generateTexture('menu-ember', 8, 8)
        .destroy();
    }
    const { width, height } = this.layout;
    this.add.particles(0, 0, 'menu-ember', {
      x: { min: 0, max: width },
      y: height + 10,
      speedX: { min: -12, max: 12 },
      speedY: { min: -70, max: -25 },
      lifespan: 14000,
      frequency: 240,
      scale: { start: 1, end: 0.2 },
      alpha: { start: 0.55, end: 0 },
      tint: [accent, 0xd282a1, 0xff8a6b],
      blendMode: 'ADD',
    }).fastForward(12000);
  }

  // One rounded, shaded texture per card size, baked at the camera zoom: no masks, and restarts reuse it.
  bakeCardArt(key, panel, w, h) {
    const { zoom } = this.layout;
    const source = this.textures.get('menu-modes').getSourceImage();
    const panelWidth = source.width / 3;
    const scale = Math.max(w / panelWidth, h / source.height);
    const cropWidth = w / scale;
    const cropHeight = h / scale;
    const canvas = document.createElement('canvas');
    canvas.width = w * zoom;
    canvas.height = h * zoom;
    const context = canvas.getContext('2d');
    context.scale(zoom, zoom);
    context.beginPath();
    context.roundRect(0, 0, w, h, 24);
    context.clip();
    context.drawImage(
      source,
      panel * panelWidth + (panelWidth - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      w,
      h,
    );
    const shade = context.createLinearGradient(0, h * 0.3, 0, h);
    shade.addColorStop(0, 'rgba(12, 8, 15, 0)');
    shade.addColorStop(1, 'rgba(12, 8, 15, 0.95)');
    context.fillStyle = shade;
    context.fillRect(0, 0, w, h);
    this.textures.addCanvas(key, canvas);
  }

  addModeCard(mode, { x, y, w, h }, index) {
    const textureKey = `menu-card-${mode.key}-${w}x${h}`;
    if (!this.textures.exists(textureKey)) this.bakeCardArt(textureKey, mode.panel, w, h);
    const art = this.add.image(0, 0, textureKey).setDisplaySize(w, h);
    const frame = this.add.graphics();
    const left = -w / 2 + 30;
    const tag = this.addText(left, h / 2 - 136, mode.tag, {
      fontFamily: sans,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#f07dc6',
    }).setLetterSpacing(4);
    const title = this.addText(left, h / 2 - 108, mode.title, {
      fontFamily: serif,
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#f8dfed',
    }).setShadow(0, 3, '#000000', 10, false, true);
    if (title.width > w - 60) title.setScale((w - 60) / title.width);
    const blurb = this.addText(left, h / 2 - 50, mode.blurb, {
      fontFamily: sans,
      fontSize: '20px',
      color: '#cfc3cb',
    });
    const card = this.add.container(x, y, [art, frame, tag, title, blurb]).setSize(w, h);
    const drawFrame = (on) => frame.clear()
      .lineStyle(on ? 4 : 2, on ? accent : 0xffffff, on ? 1 : 0.16)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
    drawFrame(false);
    this.addItem(mode.key, card, (on) => {
      drawFrame(on);
      this.tweenScale(card, on ? 1.04 : 1);
      // FX are WebGL-only; they are null under the Canvas renderer.
      if (!on) {
        card.postFX?.clear();
        art.preFX?.clear();
        return;
      }
      card.postFX?.addGlow(accent, 3, 0, false, 0.1, 16);
      if (!this.reduceMotion) art.preFX?.addShine(0.6, 0.25, 5);
    });
    this.introFrom(card, 120 + index * 90, 70);
  }

  addDockButton(item, { x, y, r }, index) {
    const ring = this.add.graphics();
    const glyph = this.addText(0, 0, item.glyph, {
      fontFamily: sans,
      fontSize: `${Math.round(r * 0.95)}px`,
      color: '#f07dc6',
    }).setOrigin(0.5);
    const label = this.addText(0, r + 22, item.label.toUpperCase(), {
      fontFamily: sans,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#d9cdd5',
    }).setOrigin(0.5).setLetterSpacing(2);
    const pip = this.add.circle(r * 0.72, -r * 0.72, 9, accent).setStrokeStyle(3, 0x1a111a).setVisible(false);
    const button = this.add.container(x, y, [ring, glyph, label, pip]).setSize(r * 2 + 30, r * 2 + 60);
    const drawRing = (on) => ring.clear()
      .fillStyle(on ? panelFillActive : panelFill, 0.95)
      .fillCircle(0, 0, r)
      .lineStyle(on ? 3 : 2, accent, on ? 1 : 0.45)
      .strokeCircle(0, 0, r);
    drawRing(false);
    if (!this.reduceMotion) this.tweens.add({ targets: pip, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    this.pips.set(item.key, pip);
    this.addItem(item.key, button, (on) => {
      drawRing(on);
      label.setColor(on ? '#ffffff' : '#d9cdd5');
      this.tweenScale(button, on ? 1.08 : 1);
    });
    this.introFrom(button, 400 + index * 50, 30);
  }

  addHud() {
    const { hud } = this.layout;
    this.badge = this.add.graphics();
    const levelLabel = this.addText(hud.badgeX, hud.y - 22, 'LV', {
      fontFamily: sans,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#f07dc6',
    }).setOrigin(0.5).setLetterSpacing(2);
    this.levelText = this.addText(hud.badgeX, hud.y + 6, '1', {
      fontFamily: serif,
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.nameText = this.addText(hud.nameX, hud.y - 16, '', {
      fontFamily: serif,
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#f5d1e5',
    }).setOrigin(0, 0.5);
    this.titleText = this.addText(hud.nameX, hud.y + 22, '', {
      fontFamily: sans,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#f07dc6',
    }).setOrigin(0, 0.5);
    this.goldPill = this.add.graphics();
    this.goldText = this.addText(hud.goldX - 24, hud.goldY, '0', {
      fontFamily: sans,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#f0d778',
    }).setOrigin(1, 0.5);

    const settingsRing = this.add.graphics();
    const settings = this.add.container(hud.settingsX, hud.y, [
      settingsRing,
      this.addText(0, 0, '⚙︎', { fontFamily: sans, fontSize: '30px', color: '#f07dc6' }).setOrigin(0.5),
    ]).setSize(64, 64);
    const drawSettings = (on) => settingsRing.clear()
      .fillStyle(on ? panelFillActive : panelFill, 0.95)
      .fillCircle(0, 0, 30)
      .lineStyle(2, accent, on ? 1 : 0.45)
      .strokeCircle(0, 0, 30);
    drawSettings(false);
    this.addItem('settings', settings, (on) => {
      drawSettings(on);
      this.tweenScale(settings, on ? 1.08 : 1);
    });

    const exitPill = this.add.graphics();
    const exit = this.add.container(hud.exitX, hud.y, [
      exitPill,
      this.addText(0, 0, 'EXIT', {
        fontFamily: sans,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f4eff1',
      }).setOrigin(0.5).setLetterSpacing(3),
    ]).setSize(110, 52);
    const drawExit = (on) => exitPill.clear()
      .fillStyle(on ? 0x741f34 : panelFill, 0.95)
      .fillRoundedRect(-55, -26, 110, 52, 26)
      .lineStyle(2, on ? 0xff9c8b : 0x645360, 1)
      .strokeRoundedRect(-55, -26, 110, 52, 26);
    drawExit(false);
    this.addItem('exit', exit, (on) => {
      drawExit(on);
      this.tweenScale(exit, on ? 1.06 : 1);
    });

    this.introFrom([
      this.badge,
      levelLabel,
      this.levelText,
      this.nameText,
      this.titleText,
      this.goldPill,
      this.goldText,
      settings,
      exit,
    ], 0, -24);
  }

  renderHud(hud) {
    if (!hud) return;
    const { badgeX, y, nameMax, goldX, goldY } = this.layout.hud;
    this.levelText.setText(hud.level);
    this.fitText(this.nameText.setText(hud.name), nameMax);
    this.fitText(this.titleText.setText(hud.title), nameMax);
    this.goldText.setText(hud.gold);

    const pillWidth = this.goldText.width + 72;
    const pillLeft = goldX - pillWidth;
    this.goldPill.clear()
      .fillStyle(panelFill, 0.95)
      .fillRoundedRect(pillLeft, goldY - 24, pillWidth, 48, 24)
      .lineStyle(2, gold, 0.5)
      .strokeRoundedRect(pillLeft, goldY - 24, pillWidth, 48, 24)
      .fillStyle(gold)
      .fillCircle(pillLeft + 26, goldY, 12)
      .lineStyle(3, 0xb8902f)
      .strokeCircle(pillLeft + 26, goldY, 7);

    const start = -Math.PI / 2;
    this.badge.clear()
      .fillStyle(panelFill, 0.95)
      .fillCircle(badgeX, y, 44)
      .lineStyle(5, 0xffffff, 0.12)
      .strokeCircle(badgeX, y, 44)
      .lineStyle(5, accent)
      .beginPath()
      .arc(badgeX, y, 44, start, start + Math.PI * 2 * hud.xp)
      .strokePath();

    this.pips.forEach((pip, key) => pip.setVisible(hud.alerts.includes(key)));
  }

  fitText(text, maxWidth) {
    while (text.width > maxWidth && text.text.length > 1) text.setText(`${text.text.slice(0, -2)}…`);
    return text;
  }

  addItem(key, target, highlight) {
    this.highlights.set(key, highlight);
    target.setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.setActive(key))
      .on('pointerout', () => this.setActive(this.registry.get('focus')))
      .on('pointerdown', () => {
        this.pressedKey = key;
      })
      .on('pointerup', () => {
        if (this.pressedKey === key) this.game.events.emit('menu-select', key);
        this.pressedKey = null;
      });
  }

  // Shared by pointer hover and keyboard focus on the hidden DOM buttons.
  setActive(key) {
    if (key === this.activeKey) return;
    this.highlights.get(this.activeKey)?.(false);
    this.activeKey = key;
    this.highlights.get(key)?.(true);
  }

  tweenScale(target, scale) {
    if (this.reduceMotion) target.setScale(scale);
    else this.tweens.add({ targets: target, scale, duration: 160, ease: 'Quad.Out' });
  }

  introFrom(targets, delay, offsetY) {
    if (this.reduceMotion) return;
    [targets].flat().forEach((target) => {
      const { y } = target;
      target.setAlpha(0).setY(y + offsetY);
      this.tweens.add({ targets: target, y, alpha: 1, delay, duration: 520, ease: 'Back.Out' });
    });
  }
}

function stageSize(portrait) {
  const { width, height, zoom } = getMenuLayout(portrait);
  return [width * zoom, height * zoom];
}

export function createMainMenuGame(parent, { portrait, fpsLimit }) {
  const [width, height] = stageSize(portrait);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    transparent: true,
    scene: MainMenuScene,
    scale: {
      mode: Phaser.Scale.FIT,
      // Top-anchored so spare height falls below the menu, not between it and the header.
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    render: {
      antialias: true,
    },
    fps: {
      target: fpsLimit || 60,
      limit: fpsLimit,
    },
  });
}
