import Phaser from 'phaser';

const suitSymbols = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

class BlackjackScene extends Phaser.Scene {
  constructor() {
    super('blackjack');
    this.pendingGame = null;
    this.combatState = { playerHp: 100, monsterHp: 100 };
  }

  create() {
    this.drawBattlefield();
    this.healthLayer = this.add.container(0, 0);
    this.handLayer = this.add.container(0, 0);
    if (this.pendingGame) {
      this.renderGame(this.pendingGame, this.combatState);
      this.pendingGame = null;
    }
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
    this.drawMonster(650, 141);

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
    const hero = this.add.container(x, y);
    const addShape = (shape) => hero.add(shape);

    addShape(this.add.ellipse(0, 66, 86, 16, 0x062d23, 0.8));
    addShape(this.add.rectangle(-17, 46, 17, 38, 0x344c76).setOrigin(0.5, 0));
    addShape(this.add.rectangle(17, 46, 17, 38, 0x344c76).setOrigin(0.5, 0));
    addShape(this.add.rectangle(-18, 76, 28, 11, 0x302b2a));
    addShape(this.add.rectangle(18, 76, 28, 11, 0x302b2a));
    addShape(this.add.rectangle(0, 22, 54, 51, 0x4b75a7));
    addShape(this.add.rectangle(0, 15, 15, 23, 0xc88f68));
    addShape(this.add.ellipse(-35, 35, 18, 38, 0xc88f68).setRotation(-0.42));
    addShape(this.add.ellipse(36, 26, 17, 35, 0xc88f68).setRotation(0.46));
    addShape(this.add.circle(0, -13, 25, 0xc88f68));
    addShape(this.add.ellipse(0, -30, 29, 15, 0x5b392e));
    addShape(this.add.rectangle(-17, -21, 12, 13, 0x5b392e).setRotation(-0.3));
    addShape(this.add.rectangle(-8, -14, 3, 3, 0x263443));
    addShape(this.add.rectangle(8, -14, 3, 3, 0x263443));
    addShape(this.add.line(0, -4, -5, -6, 5, -6, 0x713f34, 2));
    addShape(this.add.rectangle(-40, 37, 6, 13, 0x6b432b).setRotation(-0.18));
    addShape(this.add.line(0, 0, -40, 34, -54, -33, 0xd5e6e5, 1).setLineWidth(3, 3));
    addShape(this.add.triangle(-56, -39, -61, -25, -50, -27, 0xc5d6cf));
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
    this.addHealthBar('Monster', combatState.monsterHp, 100, 596, 88, 0xd46d5e);
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
