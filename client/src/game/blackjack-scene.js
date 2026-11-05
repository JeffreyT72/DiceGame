import Phaser from 'phaser';
import { characters, characterSpriteLayout } from './characters.js';
import { PaperDoll } from './paper-doll.js';
import { getTableTheme } from '../../../shared/table-themes.js';

const suitSymbols = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getCardSuitColor = (suit) => (suit === 'hearts' || suit === 'diamonds' ? '#c44444' : '#263443');

const getDamageBonusLabels = (event) => {
  const bonusLabels = [];
  if (event.hitCount > 0) bonusLabels.push(`HITS x${event.hitMultiplier.toFixed(1)}`);
  if (event.matchingPair) bonusLabels.push('PAIR x1.5');
  if (event.fiveCardHand) bonusLabels.push('5 CARDS x2');
  if (event.doubledDown) bonusLabels.push('DOUBLE DOWN x2');
  if (event.criticalHit) bonusLabels.push('CRITICAL x1.5');
  if (event.wagerPercentage > 0) bonusLabels.push(`WAGER +${event.wagerPercentage * 200}%`);
  if (event.itemAttack > 0) bonusLabels.push(`ITEM ATK +${event.itemAttack}`);
  if (event.noHit) bonusLabels.push('GUARD x0.5');
  if (event.itemDamageReduction > 0) bonusLabels.push(`ITEM GUARD -${event.itemDamageReduction * 100}%`);
  if (event.healed > 0) bonusLabels.push(`HEAL +${event.healed} HP`);
  return bonusLabels;
};

class BlackjackScene extends Phaser.Scene {
  constructor() {
    super('blackjack');
    this.pendingGame = null;
    this.pendingBattlefield = null;
    this.combatState = { playerHp: 100, monsterHp: 100 };
    this.selectedCharacter = 'adventurer';
    this.selectedTitle = '';
    this.heroSprite = null;
    this.paperDoll = null;
    this.heroAnimationTimer = null;
    this.lastDamageGameId = null;
    this.renderedGameId = null;
    this.renderedCardCounts = { dealer: 0, player: 0 };
    this.showHandCount = true;
    this.currentGame = null;
  }

  preload() {
    characters.forEach(({ id, spriteSheet }) => {
      this.load.image(`hero-sprite-sheet-${id}`, spriteSheet);
    });
  }

  create() {
    this.showHandCount = this.registry.get('showHandCount') ?? true;
    this.battleMode = this.registry.get('battleMode') ?? 'dungeon';
    this.setCharacter(this.registry.get('selectedCharacter') ?? 'adventurer');
    this.drawBattlefield();
    this.setTitle(this.registry.get('selectedTitle') ?? '');
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

  setShowHandCount(showHandCount) {
    this.showHandCount = showHandCount;
    this.registry.set('showHandCount', showHandCount);
    if (this.handLayer && this.currentGame) {
      this.renderGame(this.currentGame);
    }
  }

  createHeroIdleTexture(characterId) {
    const textureKey = `hero-idle-${characterId}`;
    if (this.textures.exists(textureKey)) {
      return;
    }

    const sheet = this.textures.get(`hero-sprite-sheet-${characterId}`).getSourceImage();
    const canvas = document.createElement('canvas');
    const character = characters.find(({ id }) => id === characterId) ?? characters[0];
    const layout = character.spriteLayout ?? characterSpriteLayout;
    const { idleFrames, frameWidth, frameHeight, frameTop } = layout;
    const animations = {
      idle: { frameXs: idleFrames, sourceTop: frameTop },
      ...Object.fromEntries(
        Object.entries(layout.animationRows ?? {}).map(([name, row]) => [
          name,
          { frameXs: idleFrames.map((_, index) => index * frameWidth), sourceTop: row * frameHeight },
        ]),
      ),
    };
    canvas.width = frameWidth * idleFrames.length;
    canvas.height = frameHeight * Object.keys(animations).length;
    const context = canvas.getContext('2d');

    Object.entries(animations).forEach(([name, { frameXs, sourceTop }], rowIndex) => {
      frameXs.forEach((frameX, frameIndex) => {
        context.drawImage(
          sheet,
          frameX,
          sourceTop,
          frameWidth,
          frameHeight,
          frameIndex * frameWidth,
          rowIndex * frameHeight,
          frameWidth,
          frameHeight,
        );
      });
    });

    const texture = this.textures.addCanvas(textureKey, canvas);
    Object.entries(animations).forEach(([name, { frameXs }], rowIndex) => {
      frameXs.forEach((_, frameIndex) => {
        texture.add(
          `${name}-${frameIndex}`,
          0,
          frameIndex * frameWidth,
          rowIndex * frameHeight,
          frameWidth,
          frameHeight,
        );
      });
    });
  }

  setHeroAnimation(animation) {
    const character = characters.find(({ id }) => id === this.selectedCharacter) ?? characters[0];
    const layout = character.spriteLayout ?? characterSpriteLayout;
    if (layout.animationRows?.[animation] === undefined) return;

    this.heroAnimationTimer?.remove(false);
    this.paperDoll.frameIndex = 0;
    this.paperDoll.setLayer(
      'body',
      `hero-idle-${character.id}`,
      layout.idleFrames.map((_, frameIndex) => `${animation}-${frameIndex}`),
    );
    this.heroAnimationTimer = this.time.delayedCall(1000, () => {
      this.paperDoll.frameIndex = 0;
      this.paperDoll.setLayer(
        'body',
        `hero-idle-${character.id}`,
        layout.idleFrames.map((_, frameIndex) => `idle-${frameIndex}`),
      );
      this.heroAnimationTimer = null;
    });
  }

  setCharacter(characterId) {
    const character = characters.find(({ id }) => id === characterId) ?? characters[0];
    this.selectedCharacter = character.id;
    this.registry.set('selectedCharacter', character.id);
    this.heroAnimationTimer?.remove(false);
    this.heroAnimationTimer = null;
    this.createHeroIdleTexture(character.id);
    if (this.paperDoll) {
      this.paperDoll.frameIndex = 0;
      const layout = character.spriteLayout ?? characterSpriteLayout;
      this.paperDoll.setLayer(
        'body',
        `hero-idle-${character.id}`,
        layout.idleFrames.map((_, frameIndex) => `idle-${frameIndex}`),
      );
      this.heroSprite.setScale(character.displayScale ?? 1.25);
    }
    this.heroLabel?.setText(character.name.toUpperCase());
  }

  setTitle(title) {
    this.selectedTitle = title;
    this.heroTitleLabel?.setText(title.toUpperCase());
  }

  setBattleMode(mode) {
    this.battleMode = mode;
    this.registry.set('battleMode', mode);
    if (this.battlefieldBackdrop) this.drawBattlefieldBackdrop();
    if (this.healthLayer) this.renderBattlefield({ ...this.combatState, mode });
  }

  drawBattlefield() {
    this.drawBattlefieldBackdrop();
    this.drawHero(210, 292);
    this.monsterSprite = this.drawMonster(650, 292);

    this.heroLabel = this.add.text(210, 140, this.selectedCharacter.toUpperCase(), {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.heroTitleLabel = this.add.text(210, 162, this.selectedTitle.toUpperCase(), {
      color: '#f0d47d',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(650, 140, 'MONSTER', {
      color: '#ffd8c9',
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  drawBattlefieldBackdrop() {
    const backdrop = this.battlefieldBackdrop ??= this.add.graphics();
    backdrop.clear();
    if (this.battleMode === 'tower') {
      backdrop.fillStyle(0x21161c, 1);
      backdrop.fillRoundedRect(24, 20, 812, 450, 20);
      backdrop.lineStyle(2, 0xa9774c, 0.9);
      backdrop.strokeRoundedRect(24, 20, 812, 450, 20);
      backdrop.lineStyle(1, 0x604347, 0.8);
      backdrop.strokeCircle(430, 218, 210);
      backdrop.strokeCircle(430, 218, 170);
      for (const x of [86, 774]) {
        backdrop.fillStyle(0x3e2930, 1);
        backdrop.fillRoundedRect(x - 20, 68, 40, 292, 8);
        backdrop.lineStyle(2, 0x805544, 0.8);
        backdrop.strokeRoundedRect(x - 20, 68, 40, 292, 8);
        for (const y of [116, 188, 260, 332]) {
          backdrop.lineBetween(x - 18, y, x + 18, y);
        }
      }
      backdrop.fillStyle(0x35242b, 1);
      backdrop.fillRoundedRect(54, 374, 752, 74, 16);
      backdrop.lineStyle(2, 0x916345, 0.75);
      backdrop.strokeRoundedRect(54, 374, 752, 74, 16);
      backdrop.lineStyle(1, 0x65454a, 0.8);
      backdrop.lineBetween(80, 398, 780, 398);
      backdrop.lineBetween(80, 422, 780, 422);
      for (const x of [210, 650]) {
        backdrop.fillStyle(0x20161a, 0.9);
        backdrop.fillEllipse(x, 358, 112, 22);
        backdrop.lineStyle(2, 0xb77b4c, 0.6);
        backdrop.strokeEllipse(x, 358, 112, 22);
      }
      return;
    }

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
  }

  drawHero(x, y) {
    this.add.ellipse(x, y + 66, 86, 16, 0x062d23, 0.8);
    this.paperDoll = new PaperDoll(this, x, y);
    const character = characters.find(({ id }) => id === this.selectedCharacter) ?? characters[0];
    const layout = character.spriteLayout ?? characterSpriteLayout;
    this.paperDoll.setLayer(
      'body',
      `hero-idle-${this.selectedCharacter}`,
      layout.idleFrames.map((_, frameIndex) => `idle-${frameIndex}`),
    );
    this.heroSprite = this.paperDoll.container.setScale(character.displayScale ?? 1.25);
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
    this.currentGame = game;
    if (!this.handLayer) {
      this.pendingGame = game;
      return;
    }

    this.handLayer.removeAll(true);
    const sameGame = game.id === this.renderedGameId;
    const dealerDrawStart = sameGame ? this.renderedCardCounts.dealer : 0;
    const playerDrawStart = sameGame ? this.renderedCardCounts.player : 0;
    const splitDrawStarts = sameGame ? this.renderedCardCounts.splitPlayers ?? [] : [];
    this.renderedGameId = game.id;
    this.renderedCardCounts = {
      dealer: game.dealerHand.length,
      player: game.playerHand.length,
      splitPlayers: game.playerHands?.map(({ cards }) => cards.length) ?? [],
    };
    this.addHand('Dealer', game.dealerHand, game.dealerScore, 150, dealerDrawStart);
    if (game.playerHands?.length) {
      game.playerHands.forEach((hand, index) => {
        const active = game.status === 'playing' && index === game.activeHandIndex;
        const result = hand.status === 'complete' && hand.outcome
          ? ` · ${hand.outcome.replaceAll('_', ' ')}`
          : '';
        this.addHand(
          `Hand ${index + 1}${active ? ' · PLAYING' : result}`,
          hand.cards,
          hand.score,
          372,
          splitDrawStarts[index] ?? 0,
          index === 0 ? 240 : 620,
          390,
        );
      });
    } else {
      this.addHand('You', game.playerHand, game.playerScore, 372, playerDrawStart);
    }
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
    this.stageText.setText(combatState.mode === 'tower'
      ? `TOWER · FLOOR ${combatState.stage ?? 1} · BLOCK ${Math.floor(((combatState.stage ?? 1) - 1) / 10) + 1}${combatState.boss ? ' · BOSS' : ''}`
      : `DUNGEON · STAGE ${combatState.stage ?? 1} / ${combatState.stageCount ?? 1}${combatState.boss ? ' · BOSS' : ''}`);
    if (
      combatState.damageEvent
      && combatState.damageEvent.gameId !== this.lastDamageGameId
    ) {
      this.lastDamageGameId = combatState.damageEvent.gameId;
      const { damageEvent } = combatState;
      if (damageEvent.direction === 'taken') {
        if (!damageEvent.dodged) this.setHeroAnimation('hurt');
      } else {
        this.setHeroAnimation(damageEvent.criticalHit ? 'special' : 'attack');
      }
      this.showDamageEffect(combatState.damageEvent);
    }
  }

  showDamageEffect(event) {
    const incoming = event.direction === 'taken';
    const targetX = incoming ? 210 : 650;
    const targetSprite = incoming ? this.heroSprite : this.monsterSprite;
    const effect = this.add.container(targetX, 248);
    const headline = event.dodged ? 'DODGED!' : `-${event.damage} HP`;
    effect.add(this.add.text(0, -14, headline, {
      color: event.dodged ? '#b4d282' : incoming ? '#ff9c91' : '#ffe58a',
      fontFamily: 'Arial, sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
      stroke: '#34261d',
      strokeThickness: 5,
    }).setOrigin(0.5));
    const bonusLabels = getDamageBonusLabels(event);
    bonusLabels.forEach((label, index) => {
      effect.add(this.add.text(0, 15 + index * 18, label, {
        color: event.noHit && label === 'GUARD x0.5' ? '#b4d282' : '#e8f6c7',
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        stroke: '#173328',
        strokeThickness: 4,
      }).setOrigin(0.5));
    });

    const ring = this.add.circle(targetX, 292, 34, 0xffffff, 0)
      .setStrokeStyle(4, incoming ? (event.noHit ? 0xb4d282 : 0xef9586) : 0xffe58a, 0.9);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 780,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    effect.setAlpha(0.7).setScale(0.8);
    this.tweens.add({
      targets: effect,
      y: incoming ? 185 : 175,
      alpha: 0,
      scale: 1,
      duration: 1700,
      ease: 'Cubic.Out',
      onComplete: () => effect.destroy(),
    });
    if (!event.dodged) {
      if (incoming) {
        const tintTargets = [...this.paperDoll.layers.values()].map(({ sprite }) => sprite);
        tintTargets.forEach((sprite) => sprite.setTintFill(0xff6b61));
        this.time.delayedCall(350, () => {
          tintTargets.forEach((sprite) => sprite.clearTint());
        });
        this.tweens.add({
          targets: targetSprite,
          x: 220,
          duration: 85,
          yoyo: true,
          repeat: 2,
        });
      } else {
        this.tweens.add({
          targets: targetSprite,
          x: 660,
          duration: 85,
          yoyo: true,
          repeat: 2,
        });
      }
    }
  }

  clearHand() {
    if (this.handLayer) {
      this.handLayer.removeAll(true);
    }
    this.currentGame = null;
    this.pendingGame = null;
    this.renderedGameId = null;
    this.renderedCardCounts = { dealer: 0, player: 0 };
  }

  addHealthBar(label, hp, maxHp, x, y, color) {
    const safeMaxHp = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1;
    const safeHp = clamp(Number.isFinite(hp) ? hp : 0, 0, safeMaxHp);
    const roundedHp = Math.round(safeHp);
    const roundedMaxHp = Math.round(safeMaxHp);

    this.healthLayer.add(this.add.text(x, y - 20, `${label}  ${roundedHp} / ${roundedMaxHp} HP`, {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
    }));
    this.healthLayer.add(this.add.rectangle(x + 110, y, 220, 16, 0x14221c)
      .setStrokeStyle(1, 0xb3c8b8));

    if (safeHp > 0) {
      const fillWidth = clamp((216 * safeHp) / safeMaxHp, 0, 216);
      this.healthLayer.add(this.add.rectangle(x + 3 + fillWidth / 2, y, fillWidth, 10, color));
    }
  }

  addHand(label, cards, score, cardY, drawStartIndex, centerX = 430, maxWidth = 790) {
    const handCards = Array.isArray(cards) ? cards : [];
    if (handCards.length === 0) {
      return;
    }

    const gap = 9;
    const maxCardWidth = 78;
    const cardWidth = clamp(Math.min(maxCardWidth, (maxWidth - gap * Math.max(0, handCards.length - 1)) / handCards.length), 1, maxCardWidth);
    const cardHeight = cardWidth * 1.42;
    const startX = centerX - ((handCards.length - 1) * (cardWidth + gap)) / 2;
    const scoreText = this.showHandCount && score !== null ? `  ·  ${score}` : '';
    const active = label.includes('PLAYING');
    const handLabel = this.add.text(0, 0, `${label}${scoreText}`, {
      color: '#e9f5ed',
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const labelBadge = this.add.container(centerX, cardY - cardHeight / 2 - 32);
    labelBadge.add(this.add.graphics()
      .fillStyle(active ? 0x4b4824 : 0x173328, 0.96)
      .fillRoundedRect(-handLabel.width / 2 - 14, -15, handLabel.width + 28, 30, 12)
      .lineStyle(2, active ? 0xf0d778 : 0x72906a, 0.9)
      .strokeRoundedRect(-handLabel.width / 2 - 14, -15, handLabel.width + 28, 30, 12));
    labelBadge.add(handLabel);
    this.handLayer.add(labelBadge);

    handCards.forEach((card, index) => {
      const x = startX + index * (cardWidth + gap);
      const container = this.add.container(x, cardY);
      container.add(this.add.rectangle(3, 5, cardWidth, cardHeight, 0x000000, 0.38));
      const background = this.add.graphics()
        .fillStyle(card.hidden ? 0x245780 : 0xfffcf4, 1)
        .fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 8)
        .lineStyle(2, card.hidden ? 0xe2c779 : 0xc3a866, 1)
        .strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 8)
        .lineStyle(1, card.hidden ? 0x87b6d5 : 0xe6dcc4, 0.9)
        .strokeRoundedRect(-cardWidth / 2 + 4, -cardHeight / 2 + 4, cardWidth - 8, cardHeight - 8, 6);
      container.add(background);

      if (card.hidden) {
        const pattern = this.add.graphics().lineStyle(1, 0x9ac4d6, 0.65);
        pattern.strokePoints([
          { x: 0, y: -cardHeight * 0.28 },
          { x: cardWidth * 0.28, y: 0 },
          { x: 0, y: cardHeight * 0.28 },
          { x: -cardWidth * 0.28, y: 0 },
        ], true);
        pattern.strokePoints([
          { x: 0, y: -cardHeight * 0.14 },
          { x: cardWidth * 0.14, y: 0 },
          { x: 0, y: cardHeight * 0.14 },
          { x: -cardWidth * 0.14, y: 0 },
        ], true);
        container.add(pattern);
        container.add(this.add.text(0, 0, '✦', {
          color: '#f0d778',
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(24, cardWidth * 0.42)}px`,
        }).setOrigin(0.5));
      } else {
        const color = getCardSuitColor(card.suit);
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
        container.add(this.add.text(cardWidth / 2 - 12, cardHeight / 2 - 14, card.rank, {
          color,
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.max(14, cardWidth * 0.24)}px`,
          fontStyle: 'bold',
        }).setOrigin(0.5).setRotation(Math.PI));
      }

      this.handLayer.add(container);
      if (index >= drawStartIndex) {
        container.setPosition(430, 245)
          .setAlpha(0)
          .setScale(0.65)
          .setRotation(index % 2 === 0 ? -0.2 : 0.2);
        this.tweens.add({
          targets: container,
          x,
          y: cardY,
          alpha: 1,
          scale: 1,
          rotation: 0,
          delay: (index - drawStartIndex) * 92,
          duration: 450,
          ease: 'Back.Out',
        });
      }
    });
  }
}

class CardScene extends BlackjackScene {
  constructor() {
    super();
    this.selectedTableTheme = 'default';
    this.tableInstructionText = '';
  }

  preload() {
    // The cards-only scene does not need the character sprite sheets.
  }

  create() {
    this.selectedTableTheme = this.registry.get('selectedTableTheme') ?? 'default';
    this.showHandCount = this.registry.get('showHandCount') ?? true;
    this.drawCardBackdrop();
    this.add.text(76, 245, '♠', {
      color: '#f0d778',
      fontFamily: 'Arial, sans-serif',
      fontSize: '42px',
    }).setOrigin(0.5).setAlpha(0.28);
    this.add.text(784, 245, '♥', {
      color: '#f0d778',
      fontFamily: 'Arial, sans-serif',
      fontSize: '42px',
    }).setOrigin(0.5).setAlpha(0.28);
    this.handLayer = this.add.container(0, 0);
    this.hitCounter = this.add.container(150, 43).setVisible(false);
    this.hitCounter.add(this.add.rectangle(0, 0, 250, 30, 0x342b1d, 0.98)
      .setStrokeStyle(2, 0xf0d778));
    this.hitCounter.add(this.add.text(0, 0, '', {
      color: '#e8f6c7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    this.tableInstruction = this.add.container(430, 245).setVisible(false);
    this.tableInstruction.add(this.add.rectangle(0, 0, 420, 48, 0x173328, 0.96)
      .setStrokeStyle(2, 0xb4d282));
    this.tableInstruction.add(this.add.text(0, 0, '', {
      color: '#e8f6c7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    this.setTableInstruction(this.tableInstructionText);
    if (this.pendingGame) {
      this.renderGame(this.pendingGame);
      this.pendingGame = null;
    }
  }

  setTableTheme(tableTheme) {
    this.selectedTableTheme = tableTheme;
    this.registry.set('selectedTableTheme', tableTheme);
    this.drawCardBackdrop();
  }

  drawCardBackdrop() {
    const theme = getTableTheme(this.selectedTableTheme) ?? getTableTheme('default');
    this.backdrop ??= this.add.graphics();
    this.backdrop.clear();
    this.backdrop.fillStyle(0x211810, 1);
    this.backdrop.fillRoundedRect(14, 12, 832, 466, 26);
    this.backdrop.lineStyle(3, 0xe1bd68, 0.95);
    this.backdrop.strokeRoundedRect(14, 12, 832, 466, 26);
    this.backdrop.fillStyle(0x100f16, 1);
    this.backdrop.fillRoundedRect(23, 21, 814, 448, 20);
    this.backdrop.fillStyle(Number.parseInt(theme.color, 16), 1);
    this.backdrop.fillRoundedRect(29, 27, 802, 436, 18);
    this.backdrop.lineStyle(1, 0xe6cb83, 0.55);
    this.backdrop.strokeRoundedRect(38, 36, 784, 418, 14);
    this.backdrop.lineStyle(1, 0xe6cb83, 0.38);
    this.backdrop.lineBetween(42, 245, 818, 245);
    this.backdrop.fillStyle(0xe6cb83, 0.68);
    this.backdrop.fillCircle(42, 245, 4);
    this.backdrop.fillCircle(818, 245, 4);
  }

  renderGame(game) {
    super.renderGame(game);
    this.updateHitCounter(game);
  }

  setTableInstruction(instruction) {
    const changed = instruction !== this.tableInstructionText;
    this.tableInstructionText = instruction;
    if (!this.tableInstruction) return;
    this.tableInstruction.getAt(1).setText(instruction);
    this.tweens.killTweensOf(this.tableInstruction);
    this.tableInstruction.setVisible(Boolean(instruction));
    if (changed && instruction) {
      this.tableInstruction.setAlpha(0).setScale(0.88);
      this.tweens.add({
        targets: this.tableInstruction,
        alpha: 1,
        scale: 1,
        duration: 300,
        ease: 'Back.Out',
      });
    } else {
      this.tableInstruction.setAlpha(1).setScale(1);
    }
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
    this.showHandCount = true;
    this.currentRoom = null;
  }

  create() {
    this.showHandCount = this.registry.get('showHandCount') ?? true;
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

  setShowHandCount(showHandCount) {
    this.showHandCount = showHandCount;
    this.registry.set('showHandCount', showHandCount);
    if (this.tableLayer && this.currentRoom) {
      this.renderRoom(this.currentRoom);
    }
  }

  renderRoom(room) {
    this.currentRoom = room;
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
    this.tableLayer.add(this.add.text(500, 147, !this.showHandCount || room.dealerScore === null || room.dealerScore === undefined
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
      const details = `${Math.round(player.alive ? player.playerHp : 0)}/${Math.round(player.maxHp)} HP${!this.showHandCount || score === null || score === undefined ? '' : ` · ${score}`}`;
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
        if (room.dealerRevealed && player.hand.playerHands?.length) {
          player.hand.playerHands.forEach((hand, handIndex) => {
            this.tableLayer.add(this.add.text(x + (handIndex === 0 ? -47 : 47), y + 47, hand.outcome?.replaceAll('_', ' ') ?? '', {
              color: '#d8e8cf',
              fontFamily: 'Arial, sans-serif',
              fontSize: '8px',
              fontStyle: 'bold',
            }).setOrigin(0.5));
          });
        } else {
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
      }
      if (room.phase === 'battle' && player.lastDamage) {
        const { lastDamage } = player;
        const bonusLabels = [];
        if (lastDamage.handResults?.length) {
          bonusLabels.push(...lastDamage.handResults.map((hand, handIndex) => (
            `H${handIndex + 1} ${hand.dealt ? `-${hand.dealt}` : `-${hand.taken ?? 0}`} HP`
          )));
        }
        if (lastDamage.hitCount > 0) {
          bonusLabels.push(`HITS x${lastDamage.hitMultiplier.toFixed(1)}`);
        }
        if (lastDamage.matchingPair) bonusLabels.push('PAIR x1.5');
        if (lastDamage.fiveCardHand) bonusLabels.push('5 CARDS x2');
        if (lastDamage.doubledDown) bonusLabels.push('DOUBLE x2');
        if (lastDamage.critical) bonusLabels.push('CRIT x1.5');
        if (lastDamage.betPercentage > 0) {
          bonusLabels.push(`WAGER +${lastDamage.betPercentage * 200}%`);
        }
        if (lastDamage.itemAttack > 0) bonusLabels.push(`ITEM ATK +${lastDamage.itemAttack}`);
        if (lastDamage.noHit) bonusLabels.push('GUARD x0.5');
        if (lastDamage.itemDamageReduction > 0) {
          bonusLabels.push(`ITEM GUARD -${lastDamage.itemDamageReduction * 100}%`);
        }
        if (lastDamage.healed > 0) bonusLabels.push(`HEAL +${lastDamage.healed}`);
        const damageLabel = lastDamage.dodged
          ? 'DODGED!'
          : lastDamage.dealt > 0
            ? `-${lastDamage.dealt} MONSTER HP`
            : `-${lastDamage.taken} HP`;
        this.tableLayer.add(this.add.text(x, y + 63, [damageLabel, ...bonusLabels].join(' · '), {
          color: lastDamage.noHit ? '#b4d282' : '#ffe58a',
          fontFamily: 'Arial, sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
          wordWrap: { width: 210 },
          align: 'center',
        }).setOrigin(0.5));
      }
      const cardY = y + (room.phase === 'betting' ? 22 : 12);
      if (player.hand?.playerHands?.length) {
        this.drawCards(player.hand.playerHands[0].cards, x - 47, cardY, 32, 45, 80);
        this.drawCards(player.hand.playerHands[1].cards, x + 47, cardY, 32, 45, 80);
      } else {
        this.drawCards(playerHand, x, cardY, 43, 61);
      }
    });
  }

  drawCards(cards, centerX, centerY, cardWidth, cardHeight, maxWidth = 176) {
    const handCards = Array.isArray(cards) ? cards : [];
    if (handCards.length === 0) {
      return;
    }

    const gap = 4;
    const width = clamp(Math.min(cardWidth, maxWidth / Math.max(1, handCards.length) - gap), 1, cardWidth);
    const height = width * cardHeight / cardWidth;
    const cardGap = Math.min(gap, width * 0.1);
    const startX = centerX - ((handCards.length - 1) * (width + cardGap)) / 2;
    handCards.forEach((card, index) => {
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
        const color = getCardSuitColor(card.suit);
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

function createGame(
  parent,
  scene,
  selectedCharacter,
  dimensions = { width: 860, height: 490 },
  selectedTableTheme = 'default',
  fpsLimit = 0,
  selectedTitle = '',
  battleMode = 'dungeon',
  showHandCount = true,
) {
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
      target: fpsLimit || 60,
      limit: fpsLimit,
    },
  });
  game.registry.set('selectedCharacter', selectedCharacter);
  game.registry.set('selectedTableTheme', selectedTableTheme);
  game.registry.set('selectedTitle', selectedTitle);
  game.registry.set('battleMode', battleMode);
  game.registry.set('showHandCount', showHandCount);
  return game;
}

export function createBlackjackGame(
  cardParent,
  battlefieldParent,
  selectedCharacter = 'adventurer',
  selectedTableTheme = 'default',
  fpsLimit = 0,
  selectedTitle = '',
  battleMode = 'dungeon',
  showHandCount = true,
) {
  return {
    cards: createGame(
      cardParent,
      CardScene,
      selectedCharacter,
      undefined,
      selectedTableTheme,
      fpsLimit,
      '',
      'dungeon',
      showHandCount,
    ),
    battlefield: createGame(
      battlefieldParent,
      BlackjackScene,
      selectedCharacter,
      undefined,
      selectedTableTheme,
      fpsLimit,
      selectedTitle,
      battleMode,
      showHandCount,
    ),
  };
}

export function createBlackjackMultiplayerGame(parent, fpsLimit = 0, showHandCount = true) {
  return createGame(
    parent,
    MultiplayerTableScene,
    'adventurer',
    { width: 1000, height: 600 },
    'default',
    fpsLimit,
    '',
    'dungeon',
    showHandCount,
  );
}
