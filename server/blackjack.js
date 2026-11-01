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

function cardValue(card) {
  return card.rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank);
}

function activeHand(state) {
  return state.hands?.[state.activeHandIndex] ?? state;
}

function syncActiveHand(state) {
  const hand = activeHand(state);
  for (const key of ['playerHand', 'hitCount', 'hitMultiplier', 'doubledDown', 'status', 'outcome']) {
    state[key] = hand[key];
  }
}

function finishSplitHand(state, hand) {
  hand.status = 'complete';
  const nextIndex = state.hands.findIndex(
    (candidate, index) => index > state.activeHandIndex && candidate.status === 'playing',
  );
  if (nextIndex === -1) {
    state.status = 'complete';
    syncActiveHand(state);
    return;
  }
  state.activeHandIndex = nextIndex;
  state.status = 'playing';
  syncActiveHand(state);
}

function dealerTurn(state) {
  resolveDealerHand(state);
  resolveHandOutcome(state);
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
  const dealerScore = handValue(state.dealerHand);
  const hands = state.hands ?? [state];
  for (const hand of hands) {
    const playerScore = handValue(hand.playerHand);
    if (playerScore > 21) {
      hand.outcome = 'player_bust';
    } else if (!state.hands && isBlackjack(hand.playerHand) && isBlackjack(state.dealerHand)) {
      hand.outcome = 'push';
    } else if (!state.hands && isBlackjack(hand.playerHand)) {
      hand.outcome = 'player_blackjack';
    } else if (isBlackjack(state.dealerHand)) {
      hand.outcome = 'dealer_blackjack';
    } else if (dealerScore > 21) {
      hand.outcome = 'dealer_bust';
    } else if (playerScore > dealerScore) {
      hand.outcome = 'player_win';
    } else if (playerScore < dealerScore) {
      hand.outcome = 'dealer_win';
    } else {
      hand.outcome = 'push';
    }
    hand.status = 'complete';
  }
  const outcome = state.hands
    ? hands.some(({ outcome }) => ['player_blackjack', 'player_win', 'dealer_bust'].includes(outcome))
      ? 'player_win'
      : hands.every(({ outcome }) => outcome === 'push')
        ? 'push'
        : hands.find(({ outcome }) => outcome !== 'push')?.outcome ?? 'push'
    : hands[0].outcome;
  state.status = 'complete';
  if (state.hands) syncActiveHand(state);
  state.outcome = outcome;
  return state.outcome;
}

export function canSplitHand(state) {
  return state.status === 'playing'
    && !state.hands
    && !state.doubledDown
    && state.playerHand.length === 2
    && cardValue(state.playerHand[0]) === cardValue(state.playerHand[1]);
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

  const hand = activeHand(state);
  if (hand.doubledDown && action === 'hit') {
    return { error: 'You cannot hit after doubling down.', status: 409 };
  }

  if (action === 'split') {
    if (!canSplitHand(state)) {
      return { error: 'You can only split an equal-value pair on your first turn.', status: 409 };
    }
    if (state.deck.length < 2) {
      return { error: 'There are not enough cards left to split this hand.', status: 409 };
    }
    const [first, second] = state.playerHand;
    const firstDraw = state.deck.pop();
    const secondDraw = state.deck.pop();
    const splitAces = first.rank === 'A';
    state.hands = [
      [first, firstDraw],
      [second, secondDraw],
    ].map((playerHand) => ({
      playerHand,
      hitCount: 0,
      hitMultiplier: 1.2,
      doubledDown: false,
      outcome: null,
      status: splitAces || handValue(playerHand) === 21 ? 'complete' : 'playing',
    }));
    state.splitAces = splitAces;
    state.activeHandIndex = state.hands.findIndex(({ status }) => status === 'playing');
    if (state.activeHandIndex === -1) {
      state.activeHandIndex = 0;
      state.status = 'complete';
    } else {
      state.status = 'playing';
    }
    syncActiveHand(state);
    if (state.status === 'complete' && !deferDealerResolution) {
      dealerTurn(state);
    }
  } else if (action === 'hit') {
    if (state.splitAces) {
      return { error: 'You cannot hit split aces.', status: 409 };
    }
    const card = state.deck.pop();
    if (!card) {
      return { error: 'There are no cards left in the deck.', status: 409 };
    }
    hand.hitCount = (hand.hitCount ?? 0) + 1;
    if (hand.hitCount > 1) {
      hand.hitMultiplier = Number(((hand.hitMultiplier ?? 1.2) + 0.2).toFixed(1));
    } else {
      hand.hitMultiplier ??= 1.2;
    }
    hand.playerHand.push(card);
    const score = handValue(hand.playerHand);
    if (score > 21 || score === 21) {
      hand.outcome = score > 21 ? 'player_bust' : null;
      if (state.hands) {
        finishSplitHand(state, hand);
      } else {
        state.status = 'complete';
        syncActiveHand(state);
        if (score === 21 && !deferDealerResolution) dealerTurn(state);
      }
    }
    if (state.hands) syncActiveHand(state);
    if (state.status === 'complete' && !deferDealerResolution && state.hands) {
      dealerTurn(state);
    }
  } else if (action === 'double_down') {
    if (state.hands || hand.playerHand.length !== 2) {
      return { error: 'You can only double down on your first turn.', status: 409 };
    }
    const card = state.deck.pop();
    if (!card) {
      return { error: 'There are no cards left in the deck.', status: 409 };
    }
    hand.doubledDown = true;
    hand.playerHand.push(card);
    if (handValue(hand.playerHand) > 21) {
      state.status = 'complete';
      state.outcome = 'player_bust';
    } else if (deferDealerResolution) {
      state.status = 'complete';
    } else {
      dealerTurn(state);
    }
  } else if (action === 'stand') {
    if (state.hands) {
      finishSplitHand(state, hand);
      if (state.status === 'complete' && !deferDealerResolution) {
        dealerTurn(state);
      }
    } else if (deferDealerResolution) {
      state.status = 'complete';
    } else {
      dealerTurn(state);
    }
  } else {
    return { error: 'Action must be "hit", "stand", "double_down", or "split".', status: 400 };
  }

  if (state.hands && state.status === 'playing') {
    syncActiveHand(state);
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
    playerHands: state.hands?.map((hand) => ({
      cards: hand.playerHand.map(({ rank, suit }) => ({ rank, suit })),
      score: handValue(hand.playerHand),
      status: hand.status,
      outcome: hand.outcome,
      hitCount: hand.hitCount,
      hitMultiplier: hand.hitMultiplier,
      doubledDown: Boolean(hand.doubledDown),
    })) ?? null,
    activeHandIndex: state.activeHandIndex ?? 0,
    splitAces: Boolean(state.splitAces),
    dealerHand: dealerHand.map((card) => (
      card.hidden ? { hidden: true } : { rank: card.rank, suit: card.suit }
    )),
    playerScore: handValue(state.playerHand),
    dealerScore: isComplete ? handValue(state.dealerHand) : null,
    createdAt,
    updatedAt,
  };
}
