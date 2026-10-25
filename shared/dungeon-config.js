function monster(id, name, hp, attackPower, defense) {
  return { id, name, hp, attackPower, defense };
}

export const dungeons = [
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
  {
    id: 'ember-cavern',
    name: 'Ember Cavern',
    description: 'A scorched cave where fire-born monsters guard a sleeping wyrm.',
    rewardExp: 1600,
    stages: 10,
    levelRequirement: 10,
    mobs: [
      monster('cinderling', 'Cinderling', 26, 5, 2),
      monster('ash-hound', 'Ash Hound', 34, 7, 3),
      monster('lava-turtle', 'Lava Turtle', 48, 6, 8),
      monster('ember-witch', 'Ember Witch', 40, 9, 4),
    ],
    boss: monster('cavern-wyrm', 'Cavern Wyrm', 140, 15, 10),
  },
  {
    id: 'dread-caverns',
    name: 'The Dread Caverns of Madness',
    description: 'A scorched cave where fire-born monsters guard a sleeping wyrm.',
    rewardExp: 3200,
    stages: 10,
    levelRequirement: 15,
    mobs: [
      monster('woodland-wolf', 'Woodland Wolf', 34, 6, 3),
      monster('briar-golem', 'Briar Golem', 40, 7, 5),
      monster('elder-stag', 'Elder Stag', 45, 8, 4),
      monster('hollow-guardian', 'Hollow Guardian', 55, 9, 6),
    ],
    boss: monster('dread-wyrm', 'Dread Wyrm', 210, 22, 12),
  },
];

export function getDungeon(dungeonId) {
  return dungeons.find((dungeon) => dungeon.id === dungeonId);
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
