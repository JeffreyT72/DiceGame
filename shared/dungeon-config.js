function monster(id, name, hp, attackPower, defense) {
  return { id, name, hp, attackPower, defense };
}

export const dungeons = [
  {
    id: 'verdant-hollow',
    name: 'Verdant Hollow',
    description: 'A quiet forest trail overrun by strange creatures.',
    rewardExp: 1000,
    mobs: [
      monster('moss-slime', 'Moss Slime', 20, 3, 1),
      monster('thorn-rat', 'Thorn Rat', 24, 4, 2),
      monster('wild-boar', 'Wild Boar', 28, 5, 2),
      monster('forest-bat', 'Forest Bat', 22, 4, 1),
      monster('mushroomling', 'Mushroomling', 30, 5, 3),
      monster('woodland-wolf', 'Woodland Wolf', 34, 6, 3),
      monster('briar-golem', 'Briar Golem', 40, 7, 5),
      monster('elder-stag', 'Elder Stag', 45, 8, 4),
      monster('hollow-guardian', 'Hollow Guardian', 55, 9, 6),
    ],
    boss: monster('rootbound-king', 'Rootbound King', 100, 12, 8),
  },
  {
    id: 'ember-cavern',
    name: 'Ember Cavern',
    description: 'A scorched cave where fire-born monsters guard a sleeping wyrm.',
    rewardExp: 600,
    mobs: [
      monster('cinderling', 'Cinderling', 26, 5, 2),
      monster('ash-hound', 'Ash Hound', 34, 7, 3),
      monster('lava-turtle', 'Lava Turtle', 48, 6, 8),
      monster('ember-witch', 'Ember Witch', 40, 9, 4),
    ],
    boss: monster('cavern-wyrm', 'Cavern Wyrm', 140, 15, 10),
  },
];

export function getDungeon(dungeonId) {
  return dungeons.find((dungeon) => dungeon.id === dungeonId);
}

export function getDungeonStageCount(dungeon) {
  return dungeon.mobs.length + 1;
}

export function getDungeonMonster(dungeon, stage) {
  return stage === dungeon.mobs.length + 1
    ? dungeon.boss
    : dungeon.mobs[stage - 1];
}
