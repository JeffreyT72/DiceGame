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
    playerHand: [{ rank: '10' }, { rank: 'Q' }],
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

test('matching opening ranks multiply winning damage by 1.5', () => {
  const runState = { phase: 'active', items: [], monsterHp: 100, playerHp: 200, stage: 1 };
  const gameState = {
    id: 'pair-hand',
    status: 'complete',
    outcome: 'player_win',
    playerScore: 20,
    dealerScore: 18,
    playerHand: [{ rank: '10' }, { rank: '10' }],
    hitCount: 0,
    hitMultiplier: 1,
    doubledDown: false,
  };

  resolveCombatRound(gameState, {
    runState,
    currentStats: { strength: 0, luck: 0 },
    currentMonster: () => ({ defense: 0, attackPower: 5 }),
    maximumHealth: () => 200,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {},
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  });

  assert.equal(runState.lastDamageEvent.damage, 30);
  assert.equal(runState.lastDamageEvent.matchingPair, true);
});

test('a non-busting five-card win doubles damage on top of the hit multiplier', () => {
  const runState = { phase: 'active', items: [], monsterHp: 100, playerHp: 200, stage: 1 };
  const gameState = {
    id: 'five-card-hand',
    status: 'complete',
    outcome: 'player_win',
    playerScore: 20,
    dealerScore: 18,
    playerHand: [
      { rank: '2' },
      { rank: '3' },
      { rank: '4' },
      { rank: '5' },
      { rank: '6' },
    ],
    hitCount: 3,
    hitMultiplier: 1.6,
    doubledDown: false,
  };

  resolveCombatRound(gameState, {
    runState,
    currentStats: { strength: 0, luck: 0 },
    currentMonster: () => ({ defense: 0, attackPower: 5 }),
    maximumHealth: () => 200,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {},
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  });

  assert.equal(runState.lastDamageEvent.damage, 64);
  assert.equal(runState.lastDamageEvent.fiveCardHand, true);
});

test('not hitting reduces incoming monster damage by 50 percent', () => {
  const runState = { phase: 'active', items: [], monsterHp: 100, playerHp: 200, stage: 1 };
  const gameState = {
    id: 'stand-hand',
    status: 'complete',
    outcome: 'dealer_win',
    playerScore: 16,
    dealerScore: 18,
    playerHand: [{ rank: '10' }, { rank: '6' }],
    hitCount: 0,
    hitMultiplier: 1,
    doubledDown: false,
  };

  resolveCombatRound(gameState, {
    runState,
    currentStats: { strength: 0, luck: 0 },
    currentMonster: () => ({ defense: 0, attackPower: 5 }),
    maximumHealth: () => 200,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {},
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  });

  assert.equal(runState.playerHp, 189);
  assert.match(runState.lastRoundMessage, /reduces incoming damage by 50%/);
});

test('outcome messages include a fallback for unknown outcomes', () => {
  assert.equal(outcomeMessage('player_blackjack'), 'Blackjack! You win the hand.');
  assert.equal(outcomeMessage('unknown'), 'Your hand is in play.');
});
