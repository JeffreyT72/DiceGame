import { randomInt, randomUUID } from 'node:crypto';

const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

export function handValue(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      total += 11;
      aces += 1;
    } else {
      total += ['J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function dealerTurn(state) {
  const deck = state.dealerDeck ?? state.deck;
  while (handValue(state.dealerHand) < 17) {
    state.dealerHand.push(deck.pop());
  }

  const playerScore = handValue(state.playerHand);
  const dealerScore = handValue(state.dealerHand);

  if (dealerScore > 21) {
    state.outcome = 'dealer_bust';
  } else if (playerScore > dealerScore) {
    state.outcome = 'player_win';
  } else if (playerScore < dealerScore) {
    state.outcome = 'dealer_win';
  } else {
    state.outcome = 'push';
  }

  state.status = 'complete';
}

export function resolveDealerHand(state) {
  const deck = state.dealerDeck ?? state.deck;
  while (handValue(state.dealerHand) < 17) {
    const card = deck.pop();
    if (!card) break;
    state.dealerHand.push(card);
  }
}

export function resolveHandOutcome(state) {
  const playerScore = handValue(state.playerHand);
  const dealerScore = handValue(state.dealerHand);

  if (playerScore > 21) {
    state.outcome = 'player_bust';
  } else if (isBlackjack(state.playerHand) && isBlackjack(state.dealerHand)) {
    state.outcome = 'push';
  } else if (isBlackjack(state.playerHand)) {
    state.outcome = 'player_blackjack';
  } else if (isBlackjack(state.dealerHand)) {
    state.outcome = 'dealer_blackjack';
  } else if (dealerScore > 21) {
    state.outcome = 'dealer_bust';
  } else if (playerScore > dealerScore) {
    state.outcome = 'player_win';
  } else if (playerScore < dealerScore) {
    state.outcome = 'dealer_win';
  } else {
    state.outcome = 'push';
  }

  state.status = 'complete';
  return state.outcome;
}

export function createGameState({
  dealerHand,
  dealerDeck,
  deferDealerResolution = false,
} = {}) {
  const deck = dealerDeck ?? createDeck();
  const state = {
    deck,
    dealerHand: dealerHand ?? [deck.pop(), deck.pop()],
    dealerDeck: deck,
    hitCount: 0,
    hitMultiplier: 1.2,
    outcome: null,
    playerHand: [deck.pop(), deck.pop()],
    status: 'playing',
  };

  const playerBlackjack = isBlackjack(state.playerHand);
  const dealerBlackjack = isBlackjack(state.dealerHand);
  if (playerBlackjack || dealerBlackjack) {
    if (deferDealerResolution) {
      state.status = playerBlackjack ? 'complete' : 'playing';
    } else {
      state.status = 'complete';
      state.outcome = playerBlackjack && dealerBlackjack
        ? 'push'
        : playerBlackjack
          ? 'player_blackjack'
          : 'dealer_blackjack';
    }
  }

  return state;
}

export function applyAction(state, action, { deferDealerResolution = false } = {}) {
  if (state.status !== 'playing') {
    return { error: 'This hand is already complete.', status: 409 };
  }

  if (state.doubledDown && action === 'hit') {
    return { error: 'You cannot hit after doubling down.', status: 409 };
  }

  if (action === 'hit') {
    state.hitCount = (state.hitCount ?? 0) + 1;
    if (state.hitCount > 1) {
      state.hitMultiplier = Number(((state.hitMultiplier ?? 1.2) + 0.2).toFixed(1));
    } else {
      state.hitMultiplier ??= 1.2;
    }
    state.playerHand.push(state.deck.pop());
    const score = handValue(state.playerHand);
    if (score > 21) {
      state.status = 'complete';
      state.outcome = 'player_bust';
    } else if (score === 21) {
      if (deferDealerResolution) {
        state.status = 'complete';
      } else {
        dealerTurn(state);
      }
    }
  } else if (action === 'double_down') {
    if (state.playerHand.length !== 2) {
      return { error: 'You can only double down on your first turn.', status: 409 };
    }
    state.doubledDown = true;
    state.playerHand.push(state.deck.pop());
    if (handValue(state.playerHand) > 21) {
      state.status = 'complete';
      state.outcome = 'player_bust';
    } else if (deferDealerResolution) {
      state.status = 'complete';
    } else {
      dealerTurn(state);
    }
  } else if (action === 'stand') {
    if (deferDealerResolution) {
      state.status = 'complete';
    } else {
      dealerTurn(state);
    }
  } else {
    return { error: 'Action must be "hit", "stand", or "double_down".', status: 400 };
  }

  return { state };
}

export function newGameId() {
  return randomUUID();
}

export function toPublicGame(id, state, createdAt, updatedAt) {
  const isComplete = state.status === 'complete';
  const dealerHand = isComplete
    ? state.dealerHand
    : [state.dealerHand[0], { hidden: true }];

  return {
    id,
    status: state.status,
    outcome: state.outcome,
    doubledDown: Boolean(state.doubledDown),
    hitCount: state.hitCount ?? 0,
    hitMultiplier: state.hitMultiplier ?? 1.2,
    playerHand: state.playerHand.map(({ rank, suit }) => ({ rank, suit })),
    dealerHand: dealerHand.map((card) => (
      card.hidden ? { hidden: true } : { rank: card.rank, suit: card.suit }
    )),
    playerScore: handValue(state.playerHand),
    dealerScore: isComplete ? handValue(state.dealerHand) : null,
    createdAt,
    updatedAt,
  };
}
