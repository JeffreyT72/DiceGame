import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dungeons,
  getDungeon,
  getDungeonMonster,
  getDungeonStageCount,
  meetsDungeonLevelRequirement,
} from './dungeon-config.js';

test('dungeon definitions have unique IDs and complete monster attributes', () => {
  assert.equal(new Set(dungeons.map(({ id }) => id)).size, dungeons.length);

  for (const dungeon of dungeons) {
    assert.ok(dungeon.mobs.length > 0);
    assert.ok(dungeon.rewardExp > 0);
    assert.ok(Number.isInteger(dungeon.stages) && dungeon.stages > 0);
    assert.ok(Number.isInteger(dungeon.levelRequirement) && dungeon.levelRequirement > 0);
    for (const monster of [...dungeon.mobs, dungeon.boss]) {
      assert.equal(typeof monster.name, 'string');
      assert.ok(Number.isInteger(monster.hp) && monster.hp > 0);
      assert.ok(Number.isInteger(monster.attackPower) && monster.attackPower >= 0);
      assert.ok(Number.isInteger(monster.defense) && monster.defense >= 0);
    }
    assert.equal(getDungeonMonster(dungeon, dungeon.stages), dungeon.boss);
    assert.equal(getDungeonStageCount(dungeon), dungeon.stages);
  }
});

test('dungeon lookup returns only configured dungeons', () => {
  assert.equal(getDungeon('verdant-hollow'), dungeons[0]);
  assert.equal(getDungeon('unknown-dungeon'), undefined);
});

test('dungeons repeat mob encounters until the configured final boss stage', () => {
  const dungeon = getDungeon('ember-cavern');

  assert.equal(getDungeonMonster(dungeon, 1), dungeon.mobs[0]);
  assert.equal(getDungeonMonster(dungeon, dungeon.mobs.length + 1), dungeon.mobs[0]);
  assert.equal(getDungeonMonster(dungeon, dungeon.stages), dungeon.boss);
});

test('level requirement is inclusive', () => {
  const dungeon = getDungeon('ember-cavern');

  assert.equal(meetsDungeonLevelRequirement(dungeon, dungeon.levelRequirement - 1), false);
  assert.equal(meetsDungeonLevelRequirement(dungeon, dungeon.levelRequirement), true);
});
