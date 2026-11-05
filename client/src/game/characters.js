import adventurerSpriteSheet from '../assets/characters/main_v2.png';
import maleAdventurerSpriteSheet from '../assets/characters/main_v2_male.png';
import melSpriteSheet from '../assets/characters/mel_v1.png';
import bodySpriteSheet from '../assets/characters/hero/body-game.png';
import testingSpriteSheet from '../assets/characters/hero/testing.png';
import chibiSpriteSheet from '../assets/characters/hero/chibi_character.png';

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
  {
    id: 'testing',
    name: 'Testing',
    spriteSheet: testingSpriteSheet,
    spriteLayout: {
      idleFrames: [0, 128, 256, 384],
      frameWidth: 128,
      frameHeight: 128,
      frameTop: 0,
      animationRows: {
        attack: 1,
        special: 2,
        hurt: 3,
      },
    },
    displayScale: 1.2,
  },
  {
    id: 'chibi',
    name: 'Chibi',
    spriteSheet: chibiSpriteSheet,
    spriteLayout: {
      idleFrames: [0, 192, 384, 576, 768, 960, 1152, 1344],
      frameWidth: 192,
      frameHeight: 256,
      frameTop: 0,
      animationRows: {
        attack: 1,
        special: 2,
        hurt: 3,
      },
    },
    displayScale: 0.8,
  },
];
