function monster(id, name, hp, attackPower, defense) {
  return { id, name, hp, attackPower, defense };
}

export const dungeons_multiplayer = [
  {
    id: 'verdant-hollow',
    name: 'Verdant Hollow',
    description: 'A quiet forest trail overrun by strange creatures.',
    rewardExp: 1000,
    stages: 10,
    levelRequirement: 1,
    mobs: [
      monster('moss-slime', 'Moss Slime', 20, 3, 1),
      monster('thorn-rat', 'Thorn Rat', 24, 4, 2),
      monster('wild-boar', 'Wild Boar', 28, 5, 2),
      monster('forest-bat', 'Forest Bat', 22, 4, 1),
      monster('mushroomling', 'Mushroomling', 30, 5, 3),
    ],
    boss: monster('rootbound-king', 'Rootbound King', 100, 12, 8),
  },
];

export function getDungeon(dungeonId) {
  return dungeons_multiplayer.find((dungeon) => dungeon.id === dungeonId);
}

export function getDungeonStageCount(dungeon) {
  return dungeon && Number.isInteger(dungeon.stages) && dungeon.stages > 0
    ? dungeon.stages
    : 0;
}

export function getDungeonMonster(dungeon, stage) {
  if (!dungeon || !Array.isArray(dungeon.mobs) || dungeon.mobs.length === 0) {
    return undefined;
  }
  if (!Number.isInteger(stage) || stage < 1) {
    return undefined;
  }

  if (stage === getDungeonStageCount(dungeon)) {
    return dungeon.boss;
  }

  return dungeon.mobs[(stage - 1) % dungeon.mobs.length];
}

export function meetsDungeonLevelRequirement(dungeon, playerLevel) {
  if (!dungeon || !Number.isFinite(playerLevel)) {
    return false;
  }

  return playerLevel >= dungeon.levelRequirement;
}
