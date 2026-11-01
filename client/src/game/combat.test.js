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

test('player and monster HP are rounded to whole numbers when resolving combat', () => {
  const runState = {
    phase: 'active',
    items: [{ itemId: 'iron-necklace' }],
    monsterHp: 90.4,
    playerHp: 199.6,
    stage: 1,
  };
  const gameState = {
    id: 'fractional-hp-hand',
    status: 'complete',
    outcome: 'player_win',
    playerScore: 20,
    dealerScore: 18,
    playerHand: [{ rank: '10' }, { rank: 'Q' }],
    hitCount: 0,
    hitMultiplier: 1,
    doubledDown: false,
  };

  resolveCombatRound(gameState, {
    runState,
    currentStats: { strength: 0, luck: 0 },
    currentMonster: () => ({ defense: 0, attackPower: 5 }),
    maximumHealth: () => 201.4,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {},
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  });

  assert.equal(runState.playerHp, 201);
  assert.equal(runState.monsterHp, 70);
  assert.ok(Number.isInteger(runState.playerHp));
  assert.ok(Number.isInteger(runState.monsterHp));
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

test('split hand outcomes resolve independently', () => {
  const runState = { phase: 'active', items: [], monsterHp: 100, playerHp: 200, stage: 1 };
  const gameState = {
    id: 'split-hand',
    status: 'complete',
    dealerScore: 18,
    playerHands: [
      {
        cards: [{ rank: '10' }, { rank: 'Q' }],
        score: 20,
        hitCount: 0,
        hitMultiplier: 1,
        doubledDown: false,
        outcome: 'player_win',
      },
      {
        cards: [{ rank: '10' }, { rank: '6' }],
        score: 16,
        hitCount: 0,
        hitMultiplier: 1,
        doubledDown: false,
        outcome: 'dealer_win',
      },
    ],
  };

  resolveCombatRound(gameState, {
    runState,
    currentStats: { strength: 0, luck: 0, agility: 0 },
    currentMonster: () => ({ defense: 0, attackPower: 5 }),
    maximumHealth: () => 200,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {},
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  });

  assert.equal(runState.monsterHp, 80);
  assert.equal(runState.playerHp, 189);
  assert.match(runState.lastRoundMessage, /Hand 1: You deal 20 damage/);
  assert.match(runState.lastRoundMessage, /Hand 2: The monster deals 11 damage/);
});

test('reflected damage cannot defeat a monster on a lost hand', () => {
  const runState = {
    phase: 'active',
    items: [{ itemId: 'rocky-helmet' }],
    monsterHp: 1,
    playerHp: 200,
    stage: 1,
  };
  let stageClearCalls = 0;
  const gameState = {
    id: 'lost-hand',
    status: 'complete',
    outcome: 'dealer_win',
    playerScore: 16,
    dealerScore: 18,
    playerHand: [{ rank: '10' }, { rank: '6' }],
    hitCount: 1,
    hitMultiplier: 1.2,
    doubledDown: false,
  };

  resolveCombatRound(gameState, {
    runState,
    currentStats: { strength: 0, luck: 0, agility: 0 },
    currentMonster: () => ({ defense: 0, attackPower: 5 }),
    maximumHealth: () => 200,
    removeDungeonSession: async () => {},
    syncStageClear: async () => {
      stageClearCalls += 1;
    },
    onDungeonSessionRemovalError: () => {},
    onStageClearError: () => {},
  });

  assert.equal(runState.monsterHp, 1);
  assert.equal(runState.phase, 'active');
  assert.equal(runState.pendingStageClear, undefined);
  assert.equal(stageClearCalls, 0);
});

test('outcome messages include a fallback for unknown outcomes', () => {
  assert.equal(outcomeMessage('player_blackjack'), 'Blackjack! You win the hand.');
  assert.equal(outcomeMessage('unknown'), 'Your hand is in play.');
});
