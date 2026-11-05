import assert from 'node:assert/strict';
import test from 'node:test';
import { createInfiniteTowerMode } from './infinite-tower.js';

test('infinite tower initializes a run and clears floors through the tower API', async () => {
  const requests = [];
  const tower = createInfiniteTowerMode({
    request: async (...args) => {
      requests.push(args);
      return { expAwarded: 3 };
    },
  });

  const runState = tower.createRunState({ id: 'run-1', floor: 1 }, 4, 220);
  assert.equal(runState.mode, 'tower');
  assert.equal(runState.suggestedLevel, 4);
  assert.equal(runState.playerHp, 220);
  assert.equal(runState.monsterHp, tower.getMonster(runState).hp);

  await tower.clearFloor(runState, 1, 'game-1');
  assert.equal(requests[0][0], '/api/tower-runs/run-1/clear-floor');
  assert.deepEqual(JSON.parse(requests[0][1].body), { floor: 1, gameId: 'game-1' });
});
