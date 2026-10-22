import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dungeons,
  getDungeon,
  getDungeonMonster,
  getDungeonStageCount,
} from './dungeon-config.js';

test('dungeon definitions have unique IDs and complete monster attributes', () => {
  assert.equal(new Set(dungeons.map(({ id }) => id)).size, dungeons.length);

  for (const dungeon of dungeons) {
    assert.ok(dungeon.mobs.length > 0);
    assert.ok(dungeon.rewardExp > 0);
    for (const monster of [...dungeon.mobs, dungeon.boss]) {
      assert.equal(typeof monster.name, 'string');
      assert.ok(Number.isInteger(monster.hp) && monster.hp > 0);
      assert.ok(Number.isInteger(monster.attackPower) && monster.attackPower >= 0);
      assert.ok(Number.isInteger(monster.defense) && monster.defense >= 0);
    }
    assert.equal(getDungeonMonster(dungeon, dungeon.mobs.length + 1), dungeon.boss);
    assert.equal(getDungeonStageCount(dungeon), dungeon.mobs.length + 1);
  }
});

test('dungeon lookup returns only configured dungeons', () => {
  assert.equal(getDungeon('verdant-hollow'), dungeons[0]);
  assert.equal(getDungeon('unknown-dungeon'), undefined);
});
