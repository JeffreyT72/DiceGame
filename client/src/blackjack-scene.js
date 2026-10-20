import Phaser from 'phaser';
import characterSpriteSheet from './assets/characters/main.png';
import { dungeonStageCount } from '../../shared/dungeon-config.js';

const suitSymbols = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};
const heroIdleFrames = [20, 120, 220, 320];
const heroFrameWidth = 90;
const heroFrameHeight = 170;
const heroFrameTop = 85;

class BlackjackScene extends Phaser.Scene {
  constructor() {
    super('blackjack');
    this.pendingGame = null;
    this.combatState = { playerHp: 100, monsterHp: 100 };
  }

  preload() {
    this.load.image('hero-sprite-sheet', characterSpriteSheet);
  }

  create() {
    this.createHeroIdleTexture();
    this.drawBattlefield();
    this.healthLayer = this.add.container(0, 0);
    this.handLayer = this.add.container(0, 0);
    this.stageText = this.add.text(430, 245, 'DUNGEON · STAGE 1 / 10', {
      color: '#b4d282',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    if (this.pendingGame) {
      this.renderGame(this.pendingGame, this.combatState);
      this.pendingGame = null;
    }
  }

  createHeroIdleTexture() {
    const sheet = this.textures.get('hero-sprite-sheet').getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = heroFrameWidth * heroIdleFrames.length;
    canvas.height = heroFrameHeight;
    const context = canvas.getContext('2d');

    heroIdleFrames.forEach((frameX, frameIndex) => {
      context.drawImage(
        sheet,
        frameX,
        heroFrameTop,
        heroFrameWidth,
        heroFrameHeight,
        frameIndex * heroFrameWidth,
        0,
        heroFrameWidth,
        heroFrameHeight,
      );
      this.removeSpriteSheetBackground(
        context,
        frameIndex * heroFrameWidth,
        0,
      );
    });

    const texture = this.textures.addCanvas('hero-idle', canvas);
    heroIdleFrames.forEach((_, frameIndex) => {
      texture.add(
        `idle-${frameIndex}`,
        0,
        frameIndex * heroFrameWidth,
        0,
        heroFrameWidth,
        heroFrameHeight,
      );
    });
    this.anims.create({
      key: 'hero-idle',
      frames: heroIdleFrames.map((_, frameIndex) => ({
        key: 'hero-idle',
        frame: `idle-${frameIndex}`,
      })),
      frameRate: 4,
      repeat: -1,
    });
  }

  removeSpriteSheetBackground(context, offsetX, offsetY) {
    const image = context.getImageData(offsetX, offsetY, heroFrameWidth, heroFrameHeight);
    const { data } = image;
    const visited = new Uint8Array(heroFrameWidth * heroFrameHeight);
    const queue = new Int32Array(visited.length);
    let queueEnd = 0;
    let queueStart = 0;

    const isBackground = (index) => {
      const pixel = index * 4;
      const red = data[pixel];
      const green = data[pixel + 1];
      const blue = data[pixel + 2];
      return red > 210
        && green > 200
        && blue > 185
        && Math.max(red, green, blue) - Math.min(red, green, blue) < 55;
    };
    const addBackgroundPixel = (index) => {
      if (!visited[index] && isBackground(index)) {
        visited[index] = 1;
        data[index * 4 + 3] = 0;
        queue[queueEnd] = index;
        queueEnd += 1;
      }
    };

    for (let x = 0; x < heroFrameWidth; x += 1) {
      addBackgroundPixel(x);
      addBackgroundPixel((heroFrameHeight - 1) * heroFrameWidth + x);
    }
    for (let y = 1; y < heroFrameHeight - 1; y += 1) {
      addBackgroundPixel(y * heroFrameWidth);
      addBackgroundPixel(y * heroFrameWidth + heroFrameWidth - 1);
    }

    while (queueStart < queueEnd) {
      const index = queue[queueStart];
      queueStart += 1;
      const x = index % heroFrameWidth;
      const y = Math.floor(index / heroFrameWidth);

      if (x > 0) addBackgroundPixel(index - 1);
      if (x < heroFrameWidth - 1) addBackgroundPixel(index + 1);
      if (y > 0) addBackgroundPixel(index - heroFrameWidth);
      if (y < heroFrameHeight - 1) addBackgroundPixel(index + heroFrameWidth);
    }

    context.putImageData(image, offsetX, offsetY);
  }

  drawBattlefield() {
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x084632, 1);
    backdrop.fillRoundedRect(24, 20, 812, 222, 20);
    backdrop.lineStyle(2, 0x4c9470, 0.8);
    backdrop.strokeRoundedRect(24, 20, 812, 222, 20);
    backdrop.fillStyle(0x0a523d, 1);
    backdrop.fillCircle(210, 132, 82);
    backdrop.fillCircle(650, 132, 82);
    backdrop.lineStyle(1, 0x2e7757, 0.8);
    backdrop.strokeCircle(210, 132, 82);
    backdrop.strokeCircle(650, 132, 82);

    this.drawHero(210, 141);
    this.monsterSprite = this.drawMonster(650, 141);

    this.add.text(210, 34, 'HERO', {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(650, 34, 'MONSTER', {
      color: '#ffd8c9',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  drawHero(x, y) {
    this.add.ellipse(x, y + 66, 86, 16, 0x062d23, 0.8);
    this.add.sprite(x, y, 'hero-idle', 'idle-0').play('hero-idle');
  }

  drawMonster(x, y) {
    const monster = this.add.container(x, y);
    const addShape = (shape) => monster.add(shape);

    addShape(this.add.ellipse(0, 66, 100, 17, 0x062d23, 0.8));
    addShape(this.add.rectangle(-24, 45, 25, 41, 0x493738).setOrigin(0.5, 0));
    addShape(this.add.rectangle(24, 45, 25, 41, 0x493738).setOrigin(0.5, 0));
    addShape(this.add.rectangle(-29, 77, 37, 12, 0x272225));
    addShape(this.add.rectangle(29, 77, 37, 12, 0x272225));
    addShape(this.add.ellipse(0, 20, 76, 74, 0x8a493d));
    addShape(this.add.ellipse(-47, 25, 25, 48, 0x8a493d).setRotation(-0.4));
    addShape(this.add.ellipse(47, 25, 25, 48, 0x8a493d).setRotation(0.4));
    addShape(this.add.circle(0, -22, 33, 0xa85c48));
    addShape(this.add.triangle(-21, -45, -37, -85, -3, -57, 0xb97c55));
    addShape(this.add.triangle(21, -45, 37, -85, 3, -57, 0xb97c55));
    addShape(this.add.rectangle(-12, -25, 8, 5, 0xf5d16b));
    addShape(this.add.rectangle(12, -25, 8, 5, 0xf5d16b));
    addShape(this.add.triangle(0, -5, -12, -14, 12, -14, 0x472c2e));
    addShape(this.add.triangle(-8, -3, -4, 7, -1, -3, 0xf0e1ca));
    addShape(this.add.triangle(8, -3, 4, 7, 1, -3, 0xf0e1ca));
    return monster;
  }

  renderGame(game, combatState = this.combatState) {
    this.combatState = combatState;
    if (!this.handLayer) {
      this.pendingGame = game;
      return;
    }

    this.healthLayer.removeAll(true);
    this.handLayer.removeAll(true);
    this.addHealthBar('Hero', combatState.playerHp, combatState.playerMaxHp ?? 100, 42, 88, 0x91c977);
    this.addHealthBar(
      combatState.boss ? 'BOSS' : 'MOB',
      combatState.monsterHp,
      combatState.monsterMaxHp ?? 40,
      596,
      88,
      0xd46d5e,
    );
    this.monsterSprite.setScale(combatState.boss ? 1.3 : 1);
    this.stageText.setText(
      `DUNGEON · STAGE ${combatState.stage ?? 1} / ${combatState.stageCount ?? dungeonStageCount}${combatState.boss ? ' · BOSS' : ''}`,
    );
    this.addHand('Dealer', game.dealerHand, game.dealerScore, 298, 262);
    this.addHand('You', game.playerHand, game.playerScore, 394, 358);
  }

  addHealthBar(label, hp, maxHp, x, y, color) {
    this.healthLayer.add(this.add.text(x, y - 20, `${label}  ${hp} / ${maxHp} HP`, {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
    }));
    this.healthLayer.add(this.add.rectangle(x + 110, y, 220, 16, 0x14221c)
      .setStrokeStyle(1, 0xb3c8b8));
    if (hp > 0) {
      const width = 216 * hp / maxHp;
      this.healthLayer.add(this.add.rectangle(x + 3 + width / 2, y, width, 10, color));
    }
  }

  addHand(label, cards, score, cardY, labelY) {
    const scoreText = score === null ? '' : `  ·  ${score}`;
    this.handLayer.add(this.add.text(34, labelY, `${label}${scoreText}`, {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
    }));

    const cardWidth = Math.min(78, (790 - 9 * Math.max(0, cards.length - 1)) / cards.length);
    const cardHeight = cardWidth * 1.42;
    const gap = 9;
    const startX = 430 - ((cards.length - 1) * (cardWidth + gap)) / 2;

    cards.forEach((card, index) => {
      const x = startX + index * (cardWidth + gap);
      const container = this.add.container(x, cardY);
      const background = this.add.rectangle(0, 0, cardWidth, cardHeight, card.hidden ? 0x245780 : 0xfffcf4)
        .setStrokeStyle(2, card.hidden ? 0x87b6d5 : 0xd9d4c9);
      container.add(background);

      if (card.hidden) {
        container.add(this.add.rectangle(0, 0, cardWidth - 10, cardHeight - 10, 0x245780)
          .setStrokeStyle(1, 0x87b6d5));
        container.add(this.add.text(0, 0, '★', {
          color: '#e4f1fa',
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(20, cardWidth * 0.38)}px`,
        }).setOrigin(0.5));
      } else {
        const color = card.suit === 'hearts' || card.suit === 'diamonds' ? '#c44444' : '#263443';
        container.add(this.add.text(-cardWidth / 2 + 7, -cardHeight / 2 + 5, card.rank, {
          color,
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(14, cardWidth * 0.24)}px`,
          fontStyle: 'bold',
        }));
        container.add(this.add.text(0, 0, suitSymbols[card.suit], {
          color,
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(26, cardWidth * 0.47)}px`,
        }).setOrigin(0.5));
      }

      this.handLayer.add(container);
    });
  }
}

export function createBlackjackGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 860,
    height: 490,
    parent,
    backgroundColor: '#0b5b43',
    scene: BlackjackScene,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
    },
  });
}
