import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAction,
  createGameState,
  resolveDealerHand,
  resolveHandOutcome,
  toPublicGame,
} from './blackjack.js';

function createTestState() {
  return {
    deck: [{ rank: '4', suit: 'clubs' }],
    dealerHand: [
      { rank: '10', suit: 'clubs' },
      { rank: '8', suit: 'clubs' },
    ],
    outcome: null,
    playerHand: [
      { rank: '10', suit: 'hearts' },
      { rank: '6', suit: 'hearts' },
    ],
    status: 'playing',
  };
}

test('multiplayer hands draw from one shared dealer hand and shoe', () => {
  const dealerHand = [
    { rank: '6', suit: 'clubs' },
    { rank: '5', suit: 'hearts' },
  ];
  const dealerDeck = [
    { rank: '2', suit: 'spades' },
    { rank: '3', suit: 'diamonds' },
    { rank: '4', suit: 'clubs' },
    { rank: '5', suit: 'spades' },
    { rank: '6', suit: 'hearts' },
    { rank: '7', suit: 'clubs' },
  ];
  const state = createGameState({ dealerHand, dealerDeck });

  assert.strictEqual(state.dealerHand, dealerHand);
  assert.strictEqual(state.deck, dealerDeck);
  assert.deepEqual(state.playerHand, [
    { rank: '7', suit: 'clubs' },
    { rank: '6', suit: 'hearts' },
  ]);
  applyAction(state, 'stand');
  assert.deepEqual(dealerHand.slice(2), [
    { rank: '5', suit: 'spades' },
    { rank: '4', suit: 'clubs' },
  ]);
});

test('deferred decisions do not reveal or resolve the dealer hand early', () => {
  const state = createTestState();
  const result = applyAction(state, 'stand', { deferDealerResolution: true });

  assert.equal(result.state.status, 'complete');
  assert.equal(result.state.outcome, null);
  assert.equal(state.dealerHand.length, 2);

  resolveDealerHand(state);
  assert.equal(resolveHandOutcome(state), 'dealer_win');
});

test('double down draws one card, doubles down, and ends the turn', () => {
  const state = createTestState();

  const result = applyAction(state, 'double_down');

  assert.equal(result.state.playerHand.length, 3);
  assert.equal(result.state.doubledDown, true);
  assert.equal(result.state.status, 'complete');
  assert.equal(result.state.outcome, 'player_win');
  assert.equal(applyAction(result.state, 'hit').status, 409);
  assert.equal(toPublicGame('game-id', result.state).doubledDown, true);
});

test('double down is rejected after the player has hit', () => {
  const state = createTestState();

  assert.equal(applyAction(state, 'hit').state.status, 'playing');
  const result = applyAction(state, 'double_down');

  assert.equal(result.status, 409);
  assert.equal(state.playerHand.length, 3);
  assert.equal(state.doubledDown, undefined);
});

test('each hit increases the attack multiplier by 0.2 for that hand', () => {
  const state = {
    ...createTestState(),
    deck: [
      { rank: '4', suit: 'clubs' },
      { rank: '5', suit: 'clubs' },
    ],
    playerHand: [
      { rank: '2', suit: 'hearts' },
      { rank: '3', suit: 'hearts' },
    ],
  };

  const firstHit = applyAction(state, 'hit');
  assert.equal(firstHit.state.hitCount, 1);
  assert.equal(firstHit.state.hitMultiplier, 1.2);
  assert.equal(toPublicGame('game-id', firstHit.state).hitMultiplier, 1.2);

  const secondHit = applyAction(firstHit.state, 'hit');
  assert.equal(secondHit.state.hitCount, 2);
  assert.equal(secondHit.state.hitMultiplier, 1.4);
  assert.equal(toPublicGame('game-id', secondHit.state).hitMultiplier, 1.4);
});
