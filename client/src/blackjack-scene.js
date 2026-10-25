import Phaser from 'phaser';
import { characters } from './characters.js';

const suitSymbols = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};
const heroIdleFrames = [27, 132, 237, 342];
const heroFrameWidth = 110;
const heroFrameHeight = 190;
const heroFrameTop = 40;

class BlackjackScene extends Phaser.Scene {
  constructor() {
    super('blackjack');
    this.pendingGame = null;
    this.pendingBattlefield = null;
    this.combatState = { playerHp: 100, monsterHp: 100 };
    this.selectedCharacter = 'adventurer';
    this.heroSprite = null;
    this.lastDamageGameId = null;
    this.renderedGameId = null;
    this.renderedCardCounts = { dealer: 0, player: 0 };
  }

  preload() {
    characters.forEach(({ id, spriteSheet }) => {
      this.load.image(`hero-sprite-sheet-${id}`, spriteSheet);
    });
  }

  create() {
    this.setCharacter(this.registry.get('selectedCharacter') ?? 'adventurer');
    this.drawBattlefield();
    this.healthLayer = this.add.container(0, 0);
    this.stageText = this.add.text(430, 42, 'DUNGEON · STAGE 1 / 10', {
      color: '#b4d282',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    if (this.pendingBattlefield) {
      this.renderBattlefield(this.pendingBattlefield);
      this.pendingBattlefield = null;
    }
  }

  createHeroIdleTexture(characterId) {
    const textureKey = `hero-idle-${characterId}`;
    const animationKey = `hero-idle-${characterId}`;
    if (this.textures.exists(textureKey)) {
      return;
    }

    const sheet = this.textures.get(`hero-sprite-sheet-${characterId}`).getSourceImage();
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
    });

    const texture = this.textures.addCanvas(textureKey, canvas);
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
      key: animationKey,
      frames: heroIdleFrames.map((_, frameIndex) => ({
        key: textureKey,
        frame: `idle-${frameIndex}`,
      })),
      frameRate: 4,
      repeat: -1,
    });
  }

  setCharacter(characterId) {
    const character = characters.find(({ id }) => id === characterId) ?? characters[0];
    this.selectedCharacter = character.id;
    this.registry.set('selectedCharacter', character.id);
    this.createHeroIdleTexture(character.id);
    if (this.heroSprite) {
      this.heroSprite.setTexture(`hero-idle-${character.id}`, 'idle-0');
      this.heroSprite.play(`hero-idle-${character.id}`);
    }
    this.heroLabel?.setText(character.name.toUpperCase());
  }

  drawBattlefield() {
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x084632, 1);
    backdrop.fillRoundedRect(24, 20, 812, 450, 20);
    backdrop.lineStyle(2, 0x4c9470, 0.8);
    backdrop.strokeRoundedRect(24, 20, 812, 450, 20);
    backdrop.fillStyle(0x0a523d, 1);
    backdrop.fillCircle(210, 290, 128);
    backdrop.fillCircle(650, 290, 128);
    backdrop.lineStyle(1, 0x2e7757, 0.8);
    backdrop.strokeCircle(210, 290, 128);
    backdrop.strokeCircle(650, 290, 128);

    this.drawHero(210, 292);
    this.monsterSprite = this.drawMonster(650, 292);

    this.heroLabel = this.add.text(210, 140, this.selectedCharacter.toUpperCase(), {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(650, 140, 'MONSTER', {
      color: '#ffd8c9',
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  drawHero(x, y) {
    this.add.ellipse(x, y + 66, 86, 16, 0x062d23, 0.8);
    this.heroSprite = this.add.sprite(
      x,
      y,
      `hero-idle-${this.selectedCharacter}`,
      'idle-0',
    ).setScale(1.25).play(`hero-idle-${this.selectedCharacter}`);
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

  renderGame(game) {
    if (!this.handLayer) {
      this.pendingGame = game;
      return;
    }

    this.handLayer.removeAll(true);
    const sameGame = game.id === this.renderedGameId;
    const dealerDrawStart = sameGame ? this.renderedCardCounts.dealer : 0;
    const playerDrawStart = sameGame ? this.renderedCardCounts.player : 0;
    this.renderedGameId = game.id;
    this.renderedCardCounts = {
      dealer: game.dealerHand.length,
      player: game.playerHand.length,
    };
    this.addHand('Dealer', game.dealerHand, game.dealerScore, 150, 98, dealerDrawStart);
    this.addHand('You', game.playerHand, game.playerScore, 340, 286, playerDrawStart);
  }

  renderBattlefield(combatState = this.combatState) {
    this.combatState = combatState;
    if (!this.healthLayer) {
      this.pendingBattlefield = combatState;
      return;
    }

    this.healthLayer.removeAll(true);
    this.addHealthBar('Hero', combatState.playerHp, combatState.playerMaxHp ?? 100, 42, 88, 0x91c977);
    this.addHealthBar(
      combatState.monsterName ?? (combatState.boss ? 'BOSS' : 'MOB'),
      combatState.monsterHp,
      combatState.monsterMaxHp ?? 40,
      476,
      88,
      0xd46d5e,
    );
    this.monsterSprite.setScale(combatState.boss ? 1.45 : 1.2);
    this.stageText.setText(
      `DUNGEON · STAGE ${combatState.stage ?? 1} / ${combatState.stageCount ?? 1}${combatState.boss ? ' · BOSS' : ''}`,
    );
    if (
      combatState.damageEvent
      && combatState.damageEvent.gameId !== this.lastDamageGameId
    ) {
      this.lastDamageGameId = combatState.damageEvent.gameId;
      this.showDamageEffect(combatState.damageEvent);
    }
  }

  showDamageEffect({ damage, hitCount, hitMultiplier }) {
    const effect = this.add.container(650, 248);
    effect.add(this.add.text(0, -10, `-${damage} HP`, {
      color: '#ffe58a',
      fontFamily: 'Arial, sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
      stroke: '#34261d',
      strokeThickness: 5,
    }).setOrigin(0.5));
    effect.add(this.add.text(0, 18, `HITS ${hitCount}  ·  DAMAGE x${hitMultiplier.toFixed(1)}`, {
      color: '#e8f6c7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      stroke: '#173328',
      strokeThickness: 4,
    }).setOrigin(0.5));

    effect.setAlpha(0.7).setScale(0.8);
    this.tweens.add({
      targets: effect,
      y: 175,
      alpha: 0,
      scale: 1.05,
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => effect.destroy(),
    });
    this.tweens.add({
      targets: this.monsterSprite,
      x: 660,
      duration: 55,
      yoyo: true,
      repeat: 2,
    });
  }

  clearHand() {
    if (this.handLayer) {
      this.handLayer.removeAll(true);
    }
    this.renderedGameId = null;
    this.renderedCardCounts = { dealer: 0, player: 0 };
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

  addHand(label, cards, score, cardY, labelY, drawStartIndex) {
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
      if (index >= drawStartIndex) {
        container.setPosition(430, 245)
          .setAlpha(0)
          .setScale(0.7)
          .setRotation(-0.12);
        this.tweens.add({
          targets: container,
          x,
          y: cardY,
          alpha: 1,
          scale: 1,
          rotation: 0,
          delay: (index - drawStartIndex) * 90,
          duration: 420,
          ease: 'Back.Out',
        });
      }
    });
  }
}

class CardScene extends BlackjackScene {
  preload() {
    // The cards-only scene does not need the character sprite sheets.
  }

  create() {
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x084632, 1);
    backdrop.fillRoundedRect(24, 20, 812, 450, 20);
    backdrop.lineStyle(2, 0x4c9470, 0.8);
    backdrop.strokeRoundedRect(24, 20, 812, 450, 20);
    backdrop.lineStyle(1, 0x2e7757, 0.8);
    backdrop.lineBetween(42, 245, 818, 245);
    this.handLayer = this.add.container(0, 0);
    this.hitCounter = this.add.container(430, 245).setVisible(false);
    this.hitCounter.add(this.add.rectangle(0, 0, 250, 38, 0x173328, 0.96)
      .setStrokeStyle(2, 0xb4d282));
    this.hitCounter.add(this.add.text(0, 0, '', {
      color: '#e8f6c7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    if (this.pendingGame) {
      this.renderGame(this.pendingGame);
      this.pendingGame = null;
    }
  }

  renderGame(game) {
    super.renderGame(game);
    this.updateHitCounter(game);
  }

  updateHitCounter(game) {
    if (!this.hitCounter) {
      return;
    }
    const hitCount = game.hitCount ?? 0;
    if (hitCount < 1) {
      this.hitCounter.setVisible(false);
      this.lastDisplayedHitCount = 0;
      return;
    }

    this.hitCounter.getAt(1).setText(
      `HITS ${hitCount}  ·  DAMAGE x${game.hitMultiplier.toFixed(1)}`,
    );
    if (hitCount > (this.lastDisplayedHitCount ?? 0)) {
      this.tweens.killTweensOf(this.hitCounter);
      this.hitCounter.setVisible(true).setAlpha(0).setScale(0.8);
      this.tweens.add({
        targets: this.hitCounter,
        alpha: 1,
        scale: 1,
        duration: 260,
        ease: 'Back.Out',
      });
    } else {
      this.hitCounter.setVisible(true);
    }
    this.lastDisplayedHitCount = hitCount;
  }

  clearHand() {
    super.clearHand();
    this.hitCounter?.setVisible(false);
    this.lastDisplayedHitCount = 0;
  }
}

class MultiplayerTableScene extends Phaser.Scene {
  constructor() {
    super('blackjack-multiplayer');
    this.pendingRoom = null;
  }

  create() {
    const table = this.add.graphics();
    const outerPoints = this.semicirclePoints(48, 128, 452, 414);
    table.fillStyle(0x493020, 1);
    table.lineStyle(4, 0x9a7045, 1);
    table.fillPoints(outerPoints, true);
    table.strokePoints(outerPoints, true);

    const feltPoints = this.semicirclePoints(68, 134, 432, 390);
    table.fillStyle(0x0a6044, 1);
    table.lineStyle(2, 0x7ca26a, 1);
    table.fillPoints(feltPoints, true);
    table.strokePoints(feltPoints, true);

    table.lineStyle(2, 0xb4d282, 0.7);
    table.strokePoints(this.semicirclePoints(105, 142, 395, 346), false);
    this.add.text(500, 105, 'DEALER', {
      color: '#f1f4ef',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tableLayer = this.add.container(0, 0);
    if (this.pendingRoom) {
      this.renderRoom(this.pendingRoom);
      this.pendingRoom = null;
    }
  }

  semicirclePoints(left, top, radiusX, radiusY) {
    const points = [{ x: left, y: top }, { x: left + radiusX * 2, y: top }];
    for (let index = 0; index <= 48; index += 1) {
      const angle = Math.PI * index / 48;
      points.push({
        x: left + radiusX + radiusX * Math.cos(angle),
        y: top + radiusY * Math.sin(angle),
      });
    }
    return points;
  }

  renderRoom(room) {
    if (!this.tableLayer) {
      this.pendingRoom = room;
      return;
    }
    this.tableLayer.removeAll(true);
    const dealerHand = room.dealerHand
      ?? room.players.find(({ hand }) => hand)?.hand?.dealerHand
      ?? [];
    this.tableLayer.add(this.add.text(500, 126, 'SHARED DEALER HAND', {
      color: '#d8e8cf',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    this.tableLayer.add(this.add.text(500, 147, room.dealerScore === null || room.dealerScore === undefined
      ? ''
      : `${room.dealerScore}`, {
      color: '#f1f4ef',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    this.drawCards(dealerHand, 500, 205, 54, 77);

    const seats = [
      { x: 150, y: 383 },
      { x: 383, y: 421 },
      { x: 617, y: 421 },
      { x: 850, y: 383 },
    ];
    seats.forEach(({ x, y }, index) => {
      const player = room.players[index];
      const active = player?.id === room.currentPlayerId;
      this.tableLayer.add(this.add.ellipse(x, y - 19, 192, 76, 0x063e30, 0.42)
        .setStrokeStyle(active ? 3 : 1, active ? 0xb4d282 : 0x3b8064));
      const name = player
        ? `${player.username}${active ? ' · TURN' : ''}`
        : 'OPEN SEAT';
      this.tableLayer.add(this.add.text(x, y - 44, name, {
        color: player ? (active ? '#e5f2ba' : '#f1f4ef') : '#9ab7a6',
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
      }).setOrigin(0.5));
      if (!player) return;

      const playerHand = player.hand?.playerHand ?? [];
      const score = player.hand?.playerScore;
      const details = `${player.alive ? player.playerHp : 0}/${player.maxHp} HP${score === null || score === undefined ? '' : ` · ${score}`}`;
      this.tableLayer.add(this.add.text(x, y - 25, details, {
        color: player.alive ? '#d4e1d8' : '#ef9586',
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
      }).setOrigin(0.5));
      if (room.phase === 'betting' && player.betPlaced) {
        this.tableLayer.add(this.add.text(x, y - 8, `BET ${player.betHp} HP`, {
          color: '#e5f2ba',
          fontFamily: 'Arial, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
        }).setOrigin(0.5));
      } else if (player.hand?.status === 'complete' && !room.dealerRevealed) {
        this.tableLayer.add(this.add.text(x, y - 8, 'DECISION LOCKED', {
          color: '#e5f2ba',
          fontFamily: 'Arial, sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
        }).setOrigin(0.5));
      }
      if (player.hand?.status === 'complete') {
        const resultLabel = room.dealerRevealed
          ? player.hand.outcome?.replaceAll('_', ' ') ?? ''
          : '';
        this.tableLayer.add(this.add.text(x, y + 47, resultLabel, {
          color: '#d8e8cf',
          fontFamily: 'Arial, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
        }).setOrigin(0.5));
      }
      this.drawCards(playerHand, x, y + (room.phase === 'betting' ? 22 : 12), 43, 61);
    });
  }

  drawCards(cards, centerX, centerY, cardWidth, cardHeight) {
    const gap = 4;
    const width = Math.min(cardWidth, 176 / Math.max(1, cards.length) - gap);
    const height = width * cardHeight / cardWidth;
    const cardGap = Math.min(gap, width * 0.1);
    const startX = centerX - ((cards.length - 1) * (width + cardGap)) / 2;
    cards.forEach((card, index) => {
      const x = startX + index * (width + cardGap);
      const container = this.add.container(x, centerY);
      const hidden = card.hidden;
      container.add(this.add.rectangle(0, 0, width, height, hidden ? 0x245780 : 0xfffcf4)
        .setStrokeStyle(1, hidden ? 0x87b6d5 : 0xd9d4c9));
      if (hidden) {
        container.add(this.add.text(0, 0, '★', {
          color: '#e4f1fa',
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(15, width * 0.45)}px`,
        }).setOrigin(0.5));
      } else {
        const redSuit = card.suit === 'hearts' || card.suit === 'diamonds';
        const color = redSuit ? '#c44444' : '#263443';
        const symbol = suitSymbols[card.suit] ?? '';
        container.add(this.add.text(-width / 2 + 4, -height / 2 + 3, card.rank ?? '', {
          color,
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(10, width * 0.24)}px`,
          fontStyle: 'bold',
        }));
        container.add(this.add.text(0, 2, symbol, {
          color,
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(18, width * 0.5)}px`,
        }).setOrigin(0.5));
      }
      this.tableLayer.add(container);
    });
  }
}

function createGame(parent, scene, selectedCharacter, dimensions = { width: 860, height: 490 }) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: dimensions.width,
    height: dimensions.height,
    parent,
    backgroundColor: '#0b5b43',
    scene,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
    },
    fps: {
      target: 30,
    },
  });
  game.registry.set('selectedCharacter', selectedCharacter);
  return game;
}

export function createBlackjackGame(cardParent, battlefieldParent, selectedCharacter = 'adventurer') {
  return {
    cards: createGame(cardParent, CardScene, selectedCharacter),
    battlefield: createGame(battlefieldParent, BlackjackScene, selectedCharacter),
  };
}

export function createBlackjackMultiplayerGame(parent) {
  return createGame(parent, MultiplayerTableScene, 'adventurer', { width: 1000, height: 600 });
}
