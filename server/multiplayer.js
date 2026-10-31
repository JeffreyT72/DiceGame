import { randomBytes } from 'node:crypto';
import { getCombatHandModifiers } from '../shared/combat-rules.js';
import {
  applyAction,
  createGameState,
  handValue,
  resolveDealerHand,
  resolveHandOutcome,
  toPublicGame,
} from './blackjack.js';
import { getItemEffects, chooseItemOptions, getItem } from '../shared/items.js';
import {
  dungeons_multiplayer,
  getDungeonMonster,
  getDungeonStageCount,
  getMultiplayerMonsterHp,
} from '../shared/dungeon-multiplayer-config.js';

const maxPlayers = 4;
const turnDurationMs = 30_000;
const battleDurationMs = 3_000;
const disconnectedRoomRetentionMs = 15 * 60 * 1000;
const codeCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const winningOutcomes = new Set(['player_blackjack', 'player_win', 'dealer_bust']);
const losingOutcomes = new Set(['dealer_blackjack', 'player_bust', 'dealer_win']);

function makeRoomCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => codeCharacters[byte % codeCharacters.length]).join('');
}

function maximumHealth(member) {
  return 200 + member.stats.constitution * 20
    + getItemEffects(member.items).maxHealth;
}

function publicGame(game, room) {
  if (!game) return null;
  const result = toPublicGame(game.id, game.state, game.createdAt, game.updatedAt);
  if (!room.dealerRevealed) {
    result.dealerHand = room.dealerHand
      ? [
        { rank: room.dealerHand[0].rank, suit: room.dealerHand[0].suit },
        { hidden: true },
      ]
      : [];
    result.dealerScore = null;
    result.outcome = null;
  }
  return result;
}

export class MultiplayerRooms {
  constructor({
    awardMonster,
    now = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
    createHand = createGameState,
    randomRoomCode = makeRoomCode,
  }) {
    this.awardMonster = awardMonster;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.createHand = createHand;
    this.randomRoomCode = randomRoomCode;
    this.rooms = new Map();
    this.connections = new Map();
  }

  connect(player, socket) {
    const connection = { player, roomCode: null, socket, messagesThisSecond: 0, rateResetAt: 0 };
    this.connections.set(socket, connection);
    socket.on('message', (buffer) => {
      const now = this.now();
      if (now >= connection.rateResetAt) {
        connection.messagesThisSecond = 0;
        connection.rateResetAt = now + 1000;
      }
      connection.messagesThisSecond += 1;
      if (connection.messagesThisSecond > 20) {
        this.sendError(socket, 'You are sending actions too quickly.');
        return;
      }
      let message;
      try {
        message = JSON.parse(buffer.toString());
      } catch {
        this.sendError(socket, 'Message must be valid JSON.');
        return;
      }
      this.handleMessage(connection, message);
    });
    socket.on('close', () => this.disconnect(connection));
  }

  handleMessage(connection, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      this.sendError(connection.socket, 'A valid message is required.');
      return;
    }
    switch (message.type) {
      case 'create_room':
        this.createRoom(connection);
        break;
      case 'join_room':
        this.joinRoom(connection, message.code);
        break;
      case 'start_game':
        this.startGame(connection);
        break;
      case 'action':
        this.playAction(connection, message.action);
        break;
      case 'bet':
        this.placeBet(connection, message.percentage);
        break;
      case 'choose_item':
        this.chooseItem(connection, message.itemId);
        break;
      case 'leave_room':
        this.leaveRoom(connection);
        break;
      default:
        this.sendError(connection.socket, 'Unknown multiplayer action.');
    }
  }

  createRoom(connection) {
    if (connection.roomCode) {
      this.sendError(connection.socket, 'Leave your current room before creating another.');
      return;
    }
    let code;
    do {
      code = this.randomRoomCode();
    } while (this.rooms.has(code));
    const room = {
      code,
      hostId: connection.player.id,
      phase: 'lobby',
      dungeon: dungeons_multiplayer[0],
      stage: 1,
      round: 0,
      monsterHp: getMultiplayerMonsterHp(dungeons_multiplayer[0], 1, 1),
      dealerHand: null,
      dealerDeck: null,
      dealerRevealed: false,
      battleDefeatedMonster: false,
      players: new Map(),
      currentPlayerId: null,
      actedPlayerIds: new Set(),
      turnEndsAt: null,
      timer: null,
      emptyTimer: null,
      expireTimer: null,
      lastMessage: '',
    };
    this.rooms.set(code, room);
    this.addPlayer(room, connection);
    this.broadcast(room);
  }

  joinRoom(connection, inputCode) {
    if (typeof inputCode !== 'string') {
      this.sendError(connection.socket, 'Enter a room code.');
      return;
    }
    const code = inputCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.sendError(connection.socket, 'Room not found.');
      return;
    }
    if (connection.roomCode && connection.roomCode !== code) {
      this.sendError(connection.socket, 'Leave your current room before joining another.');
      return;
    }
    const existing = room.players.get(connection.player.id);
    if (existing) {
      if (room.emptyTimer) this.cancel(room.emptyTimer);
      room.emptyTimer = null;
      existing.socket = connection.socket;
      existing.connected = true;
      connection.roomCode = code;
      this.broadcast(room);
      return;
    }
    if (room.phase !== 'lobby') {
      this.sendError(connection.socket, 'This game has already started.');
      return;
    }
    if (room.players.size >= maxPlayers) {
      this.sendError(connection.socket, 'This room is full.');
      return;
    }
    this.addPlayer(room, connection);
    this.broadcast(room);
  }

  addPlayer(room, connection) {
    room.players.set(connection.player.id, {
      id: connection.player.id,
      username: connection.player.username,
      stats: connection.player.stats,
      socket: connection.socket,
      connected: true,
      alive: true,
      playerHp: 200 + connection.player.stats.constitution * 20,
      items: [],
      lootChoices: [],
      hand: null,
      betPercentage: 0,
      betHp: 0,
      betPlaced: false,
      lastDamage: null,
    });
    connection.roomCode = room.code;
  }

  startGame(connection) {
    const room = this.getPlayerRoom(connection);
    if (!room) return;
    if (room.hostId !== connection.player.id) {
      this.sendError(connection.socket, 'Only the room host can start the dungeon.');
      return;
    }
    if (room.phase !== 'lobby') {
      this.sendError(connection.socket, 'This room has already started.');
      return;
    }
    if (room.players.size < 2) {
      this.sendError(connection.socket, 'At least two players are required to start.');
      return;
    }
    room.round = 1;
    room.monsterHp = getMultiplayerMonsterHp(room.dungeon, room.stage, room.players.size);
    this.beginBetting(room);
  }

  beginBetting(room) {
    this.cancelTurnTimer(room);
    room.phase = 'betting';
    room.currentPlayerId = null;
    room.dealerHand = null;
    room.dealerDeck = null;
    room.dealerRevealed = false;
    room.battleDefeatedMonster = false;
    room.actedPlayerIds.clear();
    for (const player of room.players.values()) {
      player.betPercentage = 0;
      player.betHp = 0;
      player.betPlaced = !player.alive;
      player.hand = null;
      player.lastDamage = null;
    }
    room.turnEndsAt = this.now() + turnDurationMs;
    room.timer = this.schedule(() => {
      if (room.phase !== 'betting') return;
      for (const player of room.players.values()) {
        if (player.alive && !player.betPlaced) player.betPlaced = true;
      }
      this.dealRound(room);
    }, turnDurationMs);
    room.lastMessage = 'Place your wager before the shared betting timer ends.';
    this.broadcast(room);
  }

  placeBet(connection, percentage) {
    const room = this.getPlayerRoom(connection);
    if (!room || room.phase !== 'betting') {
      this.sendError(connection.socket, 'Betting is not open.');
      return;
    }
    const player = room.players.get(connection.player.id);
    if (!player?.alive || player.betPlaced) {
      this.sendError(connection.socket, 'You have already placed your bet.');
      return;
    }
    if (![0, 0.1, 0.25, 0.5].includes(percentage)) {
      this.sendError(connection.socket, 'Choose a valid wager.');
      return;
    }
    const stake = Math.ceil(player.playerHp * percentage);
    if (percentage > 0 && stake >= player.playerHp) {
      this.sendError(connection.socket, 'You need at least 1 HP remaining after the wager.');
      return;
    }
    player.betPercentage = percentage;
    player.betHp = stake;
    player.playerHp -= stake;
    player.betPlaced = true;
    if ([...room.players.values()].every((member) => !member.alive || member.betPlaced)) {
      this.dealRound(room);
      return;
    }
    this.broadcast(room);
  }

  dealRound(room) {
    if (room.phase !== 'betting') return;
    this.cancelTurnTimer(room);
    room.phase = 'playing';
    room.actedPlayerIds.clear();
    room.dealerRevealed = false;
    let firstState = null;
    for (const player of room.players.values()) {
      if (!player.alive) continue;
      const state = firstState
        ? this.createHand({
          dealerHand: room.dealerHand,
          dealerDeck: room.dealerDeck,
          deferDealerResolution: true,
        })
        : this.createHand({ deferDealerResolution: true });
      if (!firstState) {
        firstState = state;
        room.dealerHand = state.dealerHand;
        room.dealerDeck = state.dealerDeck ?? state.deck;
      } else {
        state.dealerHand = room.dealerHand;
        state.dealerDeck = room.dealerDeck;
        state.deck = room.dealerDeck;
      }
      state.outcome = null;
      const playerBlackjack = state.playerHand.length === 2
        && handValue(state.playerHand) === 21;
      state.status = playerBlackjack ? 'complete' : 'playing';
      player.hand = {
        id: randomBytes(12).toString('hex'),
        state,
        createdAt: new Date(this.now()).toISOString(),
        updatedAt: new Date(this.now()).toISOString(),
      };
      if (playerBlackjack) room.actedPlayerIds.add(player.id);
    }
    room.lastMessage = 'Opening hands dealt. Players act in seat order.';
    this.beginNextTurn(room);
  }

  playAction(connection, action) {
    const room = this.getPlayerRoom(connection);
    if (!room || room.phase !== 'playing' || room.currentPlayerId !== connection.player.id) {
      this.sendError(connection.socket, 'It is not your turn.');
      return;
    }
    const player = room.players.get(connection.player.id);
    const result = applyAction(player.hand.state, action, { deferDealerResolution: true });
    if (result.error) {
      this.sendError(connection.socket, result.error);
      return;
    }
    player.hand.updatedAt = new Date(this.now()).toISOString();
    if (result.state.status === 'complete') {
      this.finishTurn(room, player);
    } else {
      this.broadcast(room);
    }
    this.scheduleDisconnectedCleanup(room);
  }

  finishTurn(room, player, timedOut = false) {
    if (room.currentPlayerId !== player.id || room.phase !== 'playing') return;
    this.cancelTurnTimer(room);
    if (timedOut && player.hand.state.status === 'playing') {
      const result = applyAction(player.hand.state, 'stand', { deferDealerResolution: true });
      if (result.error) {
        this.sendError(player.socket, `Timed-out turn could not be stood: ${result.error}`);
        return;
      }
    }
    player.hand.updatedAt = new Date(this.now()).toISOString();
    room.actedPlayerIds.add(player.id);
    room.currentPlayerId = null;
    this.beginNextTurn(room);
  }

  resolveRound(room) {
    this.cancelTurnTimer(room);
    const firstHand = [...room.players.values()].find(({ hand }) => hand)?.hand?.state;
    if (firstHand) resolveDealerHand(firstHand);
    room.dealerRevealed = true;
    for (const player of room.players.values()) {
      if (!player.alive || !player.hand) continue;
      resolveHandOutcome(player.hand.state);
    }
    for (const player of room.players.values()) {
      if (player.alive && player.hand) this.resolveHand(room, player);
    }
    room.currentPlayerId = null;
    if (![...room.players.values()].some(({ alive }) => alive)) {
      room.phase = 'failed';
      room.lastMessage = 'The party was defeated.';
      this.broadcast(room);
      this.scheduleRoomExpiration(room);
      return;
    }
    room.phase = 'battle';
    room.battleDefeatedMonster = room.monsterHp <= 0;
    room.lastMessage = 'Dealer revealed. The party resolves the round against the monster.';
    room.turnEndsAt = this.now() + battleDurationMs;
    room.timer = this.schedule(() => this.finishBattle(room), battleDurationMs);
    this.broadcast(room);
  }

  finishBattle(room) {
    if (room.phase !== 'battle') return;
    this.cancelTurnTimer(room);
    if (room.battleDefeatedMonster) {
      this.finishMonster(room);
      return;
    }
    room.round += 1;
    this.beginBetting(room);
  }

  resolveHand(room, player) {
    const state = player.hand.state;
    const monster = getDungeonMonster(room.dungeon, room.stage);
    const effects = getItemEffects(player.items);
    player.lastDamage = null;
    if (winningOutcomes.has(state.outcome)) {
      const handModifiers = getCombatHandModifiers(state.playerHand, state.hitCount);
      const attackDamage = Math.max(
        0,
        handValue(state.playerHand) + player.stats.strength + effects.attack - monster.defense,
      );
      const baseDamage = Math.max(
        1,
        attackDamage,
      ) * (state.doubledDown ? 2 : 1);
      const hitMultiplier = state.hitCount > 0 ? state.hitMultiplier + effects.hitMultiplier : 1;
      const pairMultiplier = handModifiers.matchingPair ? 1.5 : 1;
      const fiveCardMultiplier = handModifiers.fiveCardHand ? 2 : 1;
      const criticalChance = Math.min(100, player.stats.luck * 3 + effects.criticalChance * 100);
      const critical = Math.random() * 100 < criticalChance;
      const damage = Math.min(room.monsterHp, Math.floor(
        baseDamage * hitMultiplier * pairMultiplier * fiveCardMultiplier
          * (1 + player.betPercentage * 2) * (critical ? 1.5 : 1),
      ));
      room.monsterHp = Math.max(0, room.monsterHp - damage);
      const healing = Math.min(
        maximumHealth(player) - player.playerHp,
        Math.ceil((maximumHealth(player) * effects.healOnHitHpBased
          + damage * effects.healOnHitDamageBased) * (1 + effects.healing)),
      );
      player.playerHp += healing;
      player.lastDamage = {
        dealt: damage,
        healed: healing,
        critical,
        wagerHp: player.betHp,
        betPercentage: player.betPercentage,
        hitCount: state.hitCount,
        hitMultiplier,
        doubledDown: Boolean(state.doubledDown),
        itemAttack: effects.attack,
        matchingPair: handModifiers.matchingPair,
        fiveCardHand: handModifiers.fiveCardHand,
      };
    } else if (losingOutcomes.has(state.outcome)) {
      const handModifiers = getCombatHandModifiers(state.playerHand, state.hitCount);
      const dealerScore = handValue(state.dealerHand);
      let damage = Math.floor(
        (dealerScore + monster.attackPower) * (1 - effects.damageReduction)
          * (handModifiers.noHit ? 0.5 : 1),
      )
        * (state.doubledDown ? 2 : 1);
      const dodgeChance = Math.min(100, player.stats.agility * 5 + effects.dodgeChance * 100);
      if (Math.random() * 100 < dodgeChance) {
        damage = 0;
      } else {
        player.playerHp = Math.max(0, player.playerHp - damage);
        const reflected = Math.min(room.monsterHp, Math.floor(damage * effects.damageReflection));
        room.monsterHp -= reflected;
      }
      player.lastDamage = {
        taken: damage,
        dodged: damage === 0,
        wagerHp: player.betHp,
        betPercentage: player.betPercentage,
        noHit: handModifiers.noHit,
        doubledDown: Boolean(state.doubledDown),
        itemDamageReduction: effects.damageReduction,
      };
      if (player.playerHp === 0) {
        player.alive = false;
      }
    } else {
      room.lastMessage = `${player.username}'s hand was a push.`;
    }
  }

  finishMonster(room) {
    this.cancelTurnTimer(room);
    room.currentPlayerId = null;
    const finalStage = room.stage === getDungeonStageCount(room.dungeon);
    for (const player of room.players.values()) {
      if (player.alive) {
        player.progression = this.awardMonster(player.id, finalStage ? room.dungeon.rewardExp : 0);
      }
    }
    if (finalStage) {
      room.phase = 'complete';
      room.lastMessage = `${room.dungeon.name} cleared!`;
      this.broadcast(room);
      this.scheduleRoomExpiration(room);
      return;
    }
    room.phase = 'loot';
    for (const player of room.players.values()) {
      player.lootChoices = player.alive ? chooseItemOptions() : [];
    }
    room.lastMessage = `Stage ${room.stage} cleared. Choose an item before the shared timer ends.`;
    room.turnEndsAt = this.now() + turnDurationMs;
    room.timer = this.schedule(() => {
      if (room.phase !== 'loot') return;
      for (const player of room.players.values()) {
        if (player.alive && player.lootChoices.length) {
          this.applyItemChoice(player, room, player.lootChoices[0]);
        }
      }
      this.startNextStage(room);
    }, turnDurationMs);
    this.broadcast(room);
  }

  chooseItem(connection, itemId) {
    const room = this.getPlayerRoom(connection);
    if (!room || room.phase !== 'loot') {
      this.sendError(connection.socket, 'There is no item choice available.');
      return;
    }
    const player = room.players.get(connection.player.id);
    if (!player?.alive || !player.lootChoices.includes(itemId)) {
      this.sendError(connection.socket, 'Choose one of your offered items.');
      return;
    }
    this.applyItemChoice(player, room, itemId);
    if ([...room.players.values()].every(({ alive, lootChoices }) => !alive || lootChoices.length === 0)) {
      this.startNextStage(room);
      return;
    }
    this.broadcast(room);
  }

  applyItemChoice(player, room, itemId) {
    const previousMaxHealth = maximumHealth(player);
    player.items.push({ stage: room.stage, itemId });
    const item = getItem(itemId);
    if (item.effects.maxHealth) {
      player.playerHp = Math.min(
        maximumHealth(player),
        player.playerHp + maximumHealth(player) - previousMaxHealth,
      );
    }
    player.lootChoices = [];
  }

  startNextStage(room) {
    this.cancelTurnTimer(room);
    room.stage += 1;
    room.round = 1;
    room.actedPlayerIds.clear();
    room.monsterHp = getMultiplayerMonsterHp(room.dungeon, room.stage, room.players.size);
    room.phase = 'betting';
    room.lastMessage = `Stage ${room.stage} begins. Place your wager.`;
    this.beginBetting(room);
  }

  beginNextTurn(room) {
    if (room.phase !== 'playing') return;
    const eligible = [...room.players.values()].filter(
      (player) => player.alive && player.hand && !room.actedPlayerIds.has(player.id),
    );
    if (!eligible.length) {
      this.resolveRound(room);
      return;
    }
    const player = eligible[0];
    room.currentPlayerId = player.id;
    room.turnEndsAt = this.now() + turnDurationMs;
    room.timer = this.schedule(() => {
      if (room.currentPlayerId === player.id && room.phase === 'playing') {
        this.finishTurn(room, player, true);
      }
    }, turnDurationMs);
    this.broadcast(room);
  }

  getPlayerRoom(connection) {
    if (!connection.roomCode) {
      this.sendError(connection.socket, 'Join a room first.');
      return null;
    }
    const room = this.rooms.get(connection.roomCode);
    if (!room) {
      connection.roomCode = null;
      this.sendError(connection.socket, 'This room no longer exists.');
      return null;
    }
    return room;
  }

  leaveRoom(connection) {
    if (!connection.roomCode) return;
    const room = this.rooms.get(connection.roomCode);
    if (room) {
      this.removePlayer(room, connection.player.id);
      if (room.players.size === 0) {
        this.destroyRoom(room);
      } else {
        if (room.hostId === connection.player.id) {
          room.hostId = room.players.keys().next().value;
        }
        if (room.currentPlayerId === connection.player.id) {
          this.cancelTurnTimer(room);
          room.currentPlayerId = null;
          if (room.phase === 'playing') this.beginNextTurn(room);
        } else if (
          room.phase === 'betting'
          && [...room.players.values()].every(({ alive, betPlaced }) => !alive || betPlaced)
        ) {
          this.dealRound(room);
        } else if (
          room.phase === 'loot'
          && [...room.players.values()].every(({ alive, lootChoices }) => !alive || lootChoices.length === 0)
        ) {
          this.startNextStage(room);
        } else {
          this.broadcast(room);
        }
      }
    }
    connection.roomCode = null;
  }

  removePlayer(room, playerId) {
    room.players.delete(playerId);
    room.actedPlayerIds.delete(playerId);
  }

  disconnect(connection) {
    this.connections.delete(connection.socket);
    const room = connection.roomCode ? this.rooms.get(connection.roomCode) : null;
    if (!room) return;
    const player = room.players.get(connection.player.id);
    if (!player || player.socket !== connection.socket) return;
    player.connected = false;
    player.socket = null;
    if (room.hostId === player.id) {
      room.hostId = [...room.players.values()].find((member) => member.connected)?.id ?? player.id;
    }
    this.scheduleDisconnectedCleanup(room);
    this.broadcast(room);
  }

  scheduleDisconnectedCleanup(room) {
    if ([...room.players.values()].some((member) => member.connected)) {
      if (room.emptyTimer) this.cancel(room.emptyTimer);
      room.emptyTimer = null;
    } else if (!room.emptyTimer) {
      room.emptyTimer = this.schedule(() => {
        if (![...room.players.values()].some((member) => member.connected)) {
          this.destroyRoom(room);
        }
      }, disconnectedRoomRetentionMs);
    }
  }

  scheduleRoomExpiration(room) {
    if (room.expireTimer) return;
    room.expireTimer = this.schedule(() => {
      for (const player of room.players.values()) {
        if (player.connected) this.sendError(player.socket, 'This room has expired.');
      }
      this.destroyRoom(room);
    }, disconnectedRoomRetentionMs);
  }

  cancelTurnTimer(room) {
    if (room.timer) this.cancel(room.timer);
    room.timer = null;
    room.turnEndsAt = null;
  }

  destroyRoom(room) {
    this.cancelTurnTimer(room);
    if (room.emptyTimer) this.cancel(room.emptyTimer);
    if (room.expireTimer) this.cancel(room.expireTimer);
    room.emptyTimer = null;
    room.expireTimer = null;
    this.rooms.delete(room.code);
  }

  sendError(socket, message) {
    this.send(socket, { type: 'error', message });
  }

  send(socket, message) {
    if (socket?.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  }

  broadcast(room) {
    for (const player of room.players.values()) {
      if (player.connected) {
        this.send(player.socket, {
          type: 'room_state',
          room: this.publicRoom(room, player.id),
        });
      }
    }
  }

  publicRoom(room, viewerId) {
    const dealerHand = !room.dealerHand
      ? []
      : room.dealerRevealed
        ? room.dealerHand.map(({ rank, suit }) => ({ rank, suit }))
        : [
          { rank: room.dealerHand[0].rank, suit: room.dealerHand[0].suit },
          { hidden: true },
        ];
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      dungeonName: room.dungeon.name,
      stage: room.stage,
      stageCount: getDungeonStageCount(room.dungeon),
      round: room.round,
      monster: getDungeonMonster(room.dungeon, room.stage),
      monsterHp: room.monsterHp,
      dealerHand,
      dealerScore: room.dealerRevealed && room.dealerHand
        ? handValue(room.dealerHand)
        : null,
      currentPlayerId: room.currentPlayerId,
      turnEndsAt: room.turnEndsAt,
      battleTimerEndsAt: room.phase === 'battle' ? room.turnEndsAt : null,
      lastMessage: room.lastMessage,
      viewerId,
      viewerStats: room.players.get(viewerId)?.progression ?? null,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        username: player.username,
        connected: player.connected,
        alive: player.alive,
        playerHp: player.playerHp,
        maxHp: maximumHealth(player),
        betPercentage: player.betPercentage,
        betHp: player.betHp,
        betPlaced: player.betPlaced,
        items: player.items.map(({ itemId }) => getItem(itemId)?.name).filter(Boolean),
        hand: publicGame(player.hand, room),
        lastDamage: player.lastDamage,
        lootChoices: player.id === viewerId ? player.lootChoices : [],
      })),
    };
  }
}
