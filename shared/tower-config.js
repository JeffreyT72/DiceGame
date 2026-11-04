import { dungeons } from './dungeon-config.js';

const floorsPerTowerBlock = 10;
const towerMobs = dungeons.flatMap(({ mobs }) => mobs);

function scaleStat(value, multiplier) {
  return value === 0
    ? 0
    : Math.min(Number.MAX_SAFE_INTEGER, Math.round(value * multiplier));
}

export function getTowerFloorInBlock(floor) {
  return Number.isSafeInteger(floor) && floor > 0
    ? ((floor - 1) % floorsPerTowerBlock) + 1
    : 0;
}

export function getTowerEncounter(floor) {
  if (!Number.isSafeInteger(floor) || floor < 1) {
    return undefined;
  }

  const boss = getTowerFloorInBlock(floor) === floorsPerTowerBlock;
  const dungeon = boss
    ? dungeons[(Math.floor(floor / floorsPerTowerBlock) - 1) % dungeons.length]
    : undefined;
  const baseMonster = boss
    ? dungeon.boss
    : towerMobs[(floor - 1) % towerMobs.length];
  const multiplier = 1.2 ** Math.floor((floor - 1) / floorsPerTowerBlock);

  return {
    monster: {
      ...baseMonster,
      hp: scaleStat(baseMonster.hp, multiplier),
      attackPower: scaleStat(baseMonster.attackPower, multiplier),
      defense: scaleStat(baseMonster.defense, multiplier),
    },
    boss,
    dungeon,
  };
}

export function getTowerFloorExpReward(level, bossReward = 0) {
  if (
    !Number.isInteger(level) || level < 1
    || !Number.isInteger(bossReward) || bossReward < 0
  ) {
    return undefined;
  }

  return Math.min(level * 3 + bossReward, level * 100 * 5);
}
