import adventurerSpriteSheet from './assets/characters/main_v2.png';
import maleAdventurerSpriteSheet from './assets/characters/main_v2_male.png';
import melSpriteSheet from './assets/characters/mel_v1.png';
import bodySpriteSheet from './assets/characters/hero/body-game.png';

export const characterSpriteLayout = {
  idleFrames: [15, 125, 235, 345],
  frameWidth: 100,
  frameHeight: 190,
  frameTop: 45,
};

export const characters = [
  { id: 'adventurer', name: 'Adventurer', spriteSheet: adventurerSpriteSheet },
  { id: 'adventurer-male', name: 'Adventurer (Male)', spriteSheet: maleAdventurerSpriteSheet },
  { id: 'mel', name: 'Mel', spriteSheet: melSpriteSheet },
  {
    id: 'body',
    name: 'Body',
    spriteSheet: bodySpriteSheet,
    spriteLayout: {
      idleFrames: [0, 64, 128, 192, 256, 320, 384, 448],
      frameWidth: 64,
      frameHeight: 96,
      frameTop: 0,
    },
    displayScale: 2.2,
  },
];
