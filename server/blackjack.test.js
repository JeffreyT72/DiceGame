import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, toPublicGame } from './blackjack.js';

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
