import assert from 'node:assert/strict';
import test from 'node:test';
import { getTowerEncounter, getTowerFloorExpReward, getTowerFloorInBlock } from './tower-config.js';
import { dungeons } from './dungeon-config.js';

test('tower encounters cycle dungeon mobs and bosses every ten floors', () => {
  const firstMob = dungeons[0].mobs[0];
  const firstBoss = dungeons[0].boss;
  const secondBoss = dungeons[1].boss;

  assert.equal(getTowerEncounter(1).monster.id, firstMob.id);
  assert.equal(getTowerEncounter(10).monster.id, firstBoss.id);
  assert.equal(getTowerEncounter(20).monster.id, secondBoss.id);
  assert.equal(getTowerEncounter(14).monster.id, dungeons[0].mobs[0].id);
  assert.equal(getTowerEncounter(10).boss, true);
  assert.equal(getTowerEncounter(11).boss, false);
});

test('tower stats increase by twenty percent for each completed ten-floor block', () => {
  const baseMonster = getTowerEncounter(1).monster;
  const harderMonster = getTowerEncounter(14).monster;

  assert.equal(harderMonster.hp, Math.round(baseMonster.hp * 1.2));
  assert.equal(harderMonster.attackPower, Math.round(baseMonster.attackPower * 1.2));
  assert.equal(harderMonster.defense, Math.round(baseMonster.defense * 1.2));
  assert.equal(getTowerFloorInBlock(11), 1);
  assert.equal(getTowerFloorInBlock(20), 10);
  assert.equal(getTowerFloorInBlock(0), 0);
});

test('tower EXP includes boss rewards but is capped at five next-level thresholds', () => {
  assert.equal(getTowerFloorExpReward(5), 15);
  assert.equal(getTowerFloorExpReward(1, 1000), 500);
  assert.equal(getTowerFloorExpReward(5, 200), 215);
  assert.equal(getTowerFloorExpReward(0), undefined);
});

test('tower encounters reject invalid floor numbers', () => {
  assert.equal(getTowerEncounter(0), undefined);
  assert.equal(getTowerEncounter(1.5), undefined);
  assert.equal(getTowerEncounter(Number.MAX_SAFE_INTEGER + 1), undefined);
});
