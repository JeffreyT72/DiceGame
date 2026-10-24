import assert from 'node:assert/strict';
import test from 'node:test';
import { outcomeMessage, resolveCombatRound } from './combat.js';

test('a winning hand resolves damage once and starts the stage clear', () => {
  const runState = {
    phase: 'active',
    items: [],
    monsterHp: 10,
    playerHp: 200,
    stage: 1,
  };
  let stageClearCalls = 0;
  const dependencies = {
    runState,
    currentStats: { strength: 0, luck: 0 },
    currentMonster: () => ({ defense: 5, attackPower: 5 }),
    maximumHealth: () => 200,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {
      stageClearCalls += 1;
    },
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  };
  const gameState = {
    id: 'hand-1',
    status: 'complete',
    outcome: 'player_win',
    playerScore: 20,
    dealerScore: 18,
    hitCount: 0,
    hitMultiplier: 1,
    doubledDown: false,
  };

  resolveCombatRound(gameState, dependencies);
  resolveCombatRound(gameState, dependencies);

  assert.equal(runState.monsterHp, 0);
  assert.equal(runState.phase, 'clearing');
  assert.deepEqual(runState.pendingStageClear, { stage: 1, gameId: 'hand-1' });
  assert.equal(runState.lastDamageEvent.damage, 15);
  assert.equal(stageClearCalls, 1);
});

test('outcome messages include a fallback for unknown outcomes', () => {
  assert.equal(outcomeMessage('player_blackjack'), 'Blackjack! You win the hand.');
  assert.equal(outcomeMessage('unknown'), 'Your hand is in play.');
});
