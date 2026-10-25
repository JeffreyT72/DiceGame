import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { MultiplayerRooms } from './multiplayer.js';

class TestSocket extends EventEmitter {
  readyState = 1;
  messages = [];

  send(message) {
    this.messages.push(JSON.parse(message));
  }

  receive(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

function testHand() {
  return {
    deck: [],
    dealerHand: [
      { rank: '10', suit: 'clubs' },
      { rank: '8', suit: 'clubs' },
    ],
    playerHand: [
      { rank: '10', suit: 'hearts' },
      { rank: '9', suit: 'hearts' },
    ],
    outcome: null,
    status: 'playing',
  };
}

function createRoomFixture(options = {}) {
  let nextTimerId = 0;
  const timers = new Map();
  const rewards = [];
  const rooms = new MultiplayerRooms({
    awardMonster: (playerId, completionBonus) => rewards.push({ playerId, completionBonus }),
    createHand: options.createHand ?? testHand,
    randomRoomCode: () => 'ABC234',
    now: () => 1_000,
    schedule: (callback, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    cancel: (id) => timers.delete(id),
  });
  const players = [
    { id: 'player-1', username: 'AdventurerOne', stats: { strength: options.strength ?? 10, agility: 0, constitution: 0, luck: 0 } },
    { id: 'player-2', username: 'AdventurerTwo', stats: { strength: 0, agility: 0, constitution: 0, luck: 0 } },
  ];
  const sockets = players.map(() => new TestSocket());
  players.forEach((player, index) => rooms.connect(player, sockets[index]));
  sockets[0].receive({ type: 'create_room' });
  sockets[1].receive({ type: 'join_room', code: 'abc234' });
  return { rooms, sockets, players, timers, rewards };
}

function latestRoomState(socket) {
  return socket.messages.filter(({ type }) => type === 'room_state').at(-1)?.room;
}

function startRound(sockets) {
  sockets[0].receive({ type: 'start_game' });
  sockets[0].receive({ type: 'bet', percentage: 0 });
  sockets[1].receive({ type: 'bet', percentage: 0 });
}

test('round waits for all player decisions before reveal, then battle and shared-timer loot', () => {
  const { rooms, sockets, timers, rewards } = createRoomFixture();

  sockets[0].receive({ type: 'start_game' });
  assert.equal(latestRoomState(sockets[0]).phase, 'betting');
  assert.equal([...timers.values()][0].delay, 30_000);
  sockets[0].receive({ type: 'bet', percentage: 0 });
  assert.equal(latestRoomState(sockets[0]).phase, 'betting');
  sockets[1].receive({ type: 'bet', percentage: 0 });

  assert.equal(latestRoomState(sockets[0]).phase, 'playing');
  assert.equal(latestRoomState(sockets[0]).currentPlayerId, 'player-1');
  assert.equal([...timers.values()][0].delay, 30_000);
  assert.equal(latestRoomState(sockets[1]).players[0].hand.playerHand.length, 2);

  sockets[0].receive({ type: 'action', action: 'stand' });
  const decisionRoom = latestRoomState(sockets[0]);
  assert.equal(decisionRoom.phase, 'playing');
  assert.equal(decisionRoom.dealerScore, null);
  assert.equal(decisionRoom.players[0].hand.outcome, null);
  assert.equal(decisionRoom.players[1].hand.dealerHand[1].hidden, true);
  assert.equal(decisionRoom.currentPlayerId, 'player-2');
  assert.equal(rooms.rooms.get('ABC234').dealerHand.length, 2);

  sockets[1].receive({ type: 'action', action: 'stand' });
  const firstRoom = latestRoomState(sockets[0]);
  assert.equal(firstRoom.monsterHp, 0);
  assert.equal(firstRoom.dealerScore, 18);
  assert.equal(firstRoom.phase, 'battle');
  assert.equal(firstRoom.players[0].hand.outcome, 'player_win');
  assert.equal(firstRoom.players[1].hand.outcome, 'player_win');
  assert.equal([...timers.values()].some(({ delay }) => delay === 30_000), false);
  [...timers.values()].find(({ delay }) => delay === 3_000).callback();
  const lootRoom = latestRoomState(sockets[0]);
  assert.equal(lootRoom.phase, 'loot');
  assert.equal([...timers.values()].some(({ delay }) => delay === 30_000), true);
  assert.deepEqual(rewards.map(({ playerId }) => playerId), ['player-1', 'player-2']);
  assert.ok(latestRoomState(sockets[0]).players[0].lootChoices.length > 0);
  assert.ok(latestRoomState(sockets[1]).players[1].lootChoices.length > 0);

  const firstChoice = latestRoomState(sockets[0]).players[0].lootChoices[0];
  sockets[0].receive({ type: 'choose_item', itemId: firstChoice });
  assert.equal(latestRoomState(sockets[0]).phase, 'loot');
  const secondChoice = latestRoomState(sockets[1]).players[1].lootChoices[0];
  sockets[1].receive({ type: 'choose_item', itemId: secondChoice });

  const nextStage = latestRoomState(sockets[0]);
  assert.equal(nextStage.stage, 2);
  assert.equal(nextStage.phase, 'betting');
});

test('shared betting deducts each stake and applies its bonus only after the shared reveal', () => {
  const { sockets, rooms } = createRoomFixture({ strength: 0 });

  sockets[0].receive({ type: 'start_game' });
  sockets[0].receive({ type: 'bet', percentage: 0.1 });
  const room = rooms.rooms.get('ABC234');
  assert.equal(room.players.get('player-1').playerHp, 180);
  assert.equal(room.players.get('player-1').betHp, 20);
  assert.equal(latestRoomState(sockets[0]).phase, 'betting');
  sockets[1].receive({ type: 'bet', percentage: 0.25 });
  assert.equal(room.players.get('player-2').playerHp, 150);

  sockets[0].receive({ type: 'action', action: 'stand' });
  assert.equal(latestRoomState(sockets[0]).dealerScore, null);
  sockets[1].receive({ type: 'action', action: 'stand' });
  const revealed = latestRoomState(sockets[0]);
  assert.equal(revealed.phase, 'battle');
  assert.equal(revealed.players[0].lastDamage.wagerHp, 20);
  assert.equal(revealed.players[1].lastDamage.wagerHp, 50);
});

test('betting deadline starts the deal with an automatic no-bet for undecided players', () => {
  const { sockets, timers } = createRoomFixture();

  sockets[0].receive({ type: 'start_game' });
  sockets[0].receive({ type: 'bet', percentage: 0.1 });
  const bettingTimer = [...timers.values()].find(({ delay }) => delay === 30_000);
  bettingTimer.callback();

  const room = latestRoomState(sockets[0]);
  assert.equal(room.phase, 'playing');
  assert.equal(room.players[0].betHp, 20);
  assert.equal(room.players[1].betHp, 0);
  assert.equal(room.players[1].betPlaced, true);
  assert.equal(room.currentPlayerId, 'player-1');
});

test('item-pick deadline chooses the first offered item and opens the next betting phase', () => {
  const { rooms, sockets, timers } = createRoomFixture();
  const room = rooms.rooms.get('ABC234');
  room.monsterHp = 0;
  rooms.finishMonster(room);
  const initialChoices = [...room.players.values()].map(({ lootChoices }) => lootChoices[0]);
  const lootTimer = [...timers.values()].find(({ delay }) => delay === 30_000);

  lootTimer.callback();

  const nextStage = latestRoomState(sockets[0]);
  assert.equal(nextStage.stage, 2);
  assert.equal(nextStage.phase, 'betting');
  assert.equal(room.players.get('player-1').items[0].itemId, initialChoices[0]);
  assert.equal(room.players.get('player-2').items[0].itemId, initialChoices[1]);
});

test('all players use the same dealer hand and shoe during a round', () => {
  let handNumber = 0;
  const { rooms, sockets } = createRoomFixture({
    strength: 0,
    createHand: () => {
      const state = testHand();
      state.dealerHand = handNumber === 0
        ? [{ rank: '10', suit: 'clubs' }, { rank: '8', suit: 'clubs' }]
        : [{ rank: '2', suit: 'diamonds' }, { rank: '2', suit: 'diamonds' }];
      handNumber += 1;
      return state;
    },
  });

  startRound(sockets);
  const room = rooms.rooms.get('ABC234');
  const sharedDealerHand = room.players.get('player-1').hand.state.dealerHand;
  sockets[0].receive({ type: 'action', action: 'stand' });
  sockets[1].receive({ type: 'action', action: 'stand' });

  const secondHand = room.players.get('player-2').hand.state;
  assert.strictEqual(secondHand.dealerHand, sharedDealerHand);
  assert.strictEqual(secondHand.dealerDeck, room.dealerDeck);
  assert.deepEqual(latestRoomState(sockets[1]).dealerHand, secondHand.dealerHand);
  assert.equal(latestRoomState(sockets[1]).phase, 'battle');
});

test('rejects non-host starts and non-current-player actions', () => {
  const { sockets, rooms } = createRoomFixture();

  sockets[1].receive({ type: 'start_game' });
  assert.equal(latestRoomState(sockets[0]).phase, 'lobby');
  assert.ok(sockets[1].messages.some(({ type, message }) => (
    type === 'error' && message.includes('host')
  )));

  sockets[0].receive({ type: 'start_game' });
  sockets[0].receive({ type: 'bet', percentage: 0 });
  sockets[1].receive({ type: 'bet', percentage: 0 });
  sockets[1].receive({ type: 'action', action: 'stand' });
  assert.ok(sockets[1].messages.some(({ type, message }) => (
    type === 'error' && message.includes('not your turn')
  )));
  assert.equal(rooms.rooms.get('ABC234').currentPlayerId, 'player-1');
});

test('automatically stands after the active player reaches the 30-second deadline', () => {
  const losingHand = testHand();
  losingHand.playerHand = [
    { rank: '10', suit: 'hearts' },
    { rank: '6', suit: 'hearts' },
  ];
  const { sockets, timers } = createRoomFixture({
    strength: 0,
    createHand: () => structuredClone(losingHand),
  });
  startRound(sockets);
  const activeTimer = [...timers.values()].find(({ delay }) => delay === 30_000);

  activeTimer.callback();

  const room = latestRoomState(sockets[0]);
  assert.equal(room.currentPlayerId, 'player-2');
  assert.equal(room.players.find(({ id }) => id === 'player-1').hand.status, 'complete');
  assert.equal(room.players.find(({ id }) => id === 'player-1').playerHp, 200);
  assert.equal(room.dealerScore, null);
  sockets[1].receive({ type: 'action', action: 'stand' });
  const revealed = latestRoomState(sockets[0]);
  assert.equal(revealed.phase, 'battle');
  assert.equal(revealed.players.find(({ id }) => id === 'player-1').playerHp, 179);
});

test('limits rooms to four players and transfers host status after disconnect', () => {
  const rooms = new MultiplayerRooms({
    awardMonster: () => null,
    randomRoomCode: () => 'ROOM42',
  });
  const players = Array.from({ length: 5 }, (_, index) => ({
    id: `player-${index + 1}`,
    username: `Adventurer${index + 1}`,
    stats: { strength: 0, agility: 0, constitution: 0, luck: 0 },
  }));
  const sockets = players.map(() => new TestSocket());
  players.forEach((player, index) => rooms.connect(player, sockets[index]));
  sockets[0].receive({ type: 'create_room' });
  for (const socket of sockets.slice(1)) {
    socket.receive({ type: 'join_room', code: 'ROOM42' });
  }

  assert.equal(rooms.rooms.get('ROOM42').players.size, 4);
  assert.ok(sockets[4].messages.some(({ type, message }) => (
    type === 'error' && message.includes('full')
  )));

  sockets[0].emit('close');
  assert.equal(latestRoomState(sockets[1]).hostId, 'player-2');
});

test('awards the configured dungeon reward when the final stage is cleared', () => {
  const { rooms, sockets, rewards } = createRoomFixture();
  const room = rooms.rooms.get('ABC234');
  room.stage = room.dungeon.stages;

  rooms.finishMonster(room);

  assert.equal(latestRoomState(sockets[0]).phase, 'complete');
  assert.deepEqual(rewards.map(({ completionBonus }) => completionBonus), [room.dungeon.rewardExp, room.dungeon.rewardExp]);
});
