import assert from 'node:assert/strict';
import test from 'node:test';
import { createTowerRunStore } from './tower-runs.js';

test('tower runs advance in order and allow an identical clear retry', () => {
  const runs = createTowerRunStore();
  const { towerRun: { id } } = runs.start('player-1');
  const result = { expAwarded: 25 };

  assert.deepEqual(runs.recordClear(id, 'player-1', 1, 'game-1', result), {
    result,
    retry: false,
  });
  assert.deepEqual(runs.recordClear(id, 'player-1', 1, 'game-1', result), {
    result,
    retry: true,
  });
  assert.deepEqual(runs.recordClear(id, 'player-1', 1, 'game-2', result), {
    error: 'out_of_order',
  });
  assert.equal(runs.get(id, 'player-1').floor, 2);
});

test('tower runs are isolated by player and replaced when a new run starts', () => {
  const runs = createTowerRunStore();
  const { towerRun: firstRun } = runs.start('player-1');
  const { towerRun: otherPlayerRun } = runs.start('player-2');
  const { towerRun: nextRun, replacedGameIds } = runs.start('player-1');

  assert.equal(runs.get(firstRun.id, 'player-1'), undefined);
  assert.equal(runs.get(otherPlayerRun.id, 'player-2').floor, 1);
  assert.equal(runs.get(nextRun.id, 'player-1').floor, 1);
  assert.equal(runs.delete(otherPlayerRun.id, 'player-1'), false);
  assert.deepEqual(replacedGameIds, []);
});
