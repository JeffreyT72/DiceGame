import { connectMultiplayer } from '../services/multiplayer.js';
import { request } from '../services/api.js';
import { createBlackjackMultiplayerGame } from '../blackjack-scene.js';

const savedRoomKey = 'blackjack-multiplayer-room';

export function createMultiplayerController({ onStatsUpdated }) {
  const entry = document.querySelector('#multiplayer-entry');
  const createButton = document.querySelector('#multiplayer-create');
  const joinForm = document.querySelector('#multiplayer-join-form');
  const joinCode = document.querySelector('#multiplayer-room-code');
  const roomPanel = document.querySelector('#multiplayer-room');
  const tableParent = document.querySelector('#multiplayer-table-game');
  const status = document.querySelector('#multiplayer-status');
  const roomCodeDisplay = document.querySelector('#multiplayer-room-code-display');
  const progress = document.querySelector('#multiplayer-progress');
  const monsterName = document.querySelector('#multiplayer-monster-name');
  const monsterHp = document.querySelector('#multiplayer-monster-hp');
  const monsterHealth = document.querySelector('#multiplayer-monster-health');
  const playersList = document.querySelector('#multiplayer-players');
  const startButton = document.querySelector('#multiplayer-start');
  const leaveButton = document.querySelector('#multiplayer-leave');
  const turnActions = document.querySelector('#multiplayer-turn-actions');
  const turnTimer = document.querySelector('#multiplayer-turn-timer');
  const betActions = document.querySelector('#multiplayer-bet-actions');
  const betTimer = document.querySelector('#multiplayer-bet-timer');
  const lootPanel = document.querySelector('#multiplayer-loot');
  const lootChoices = document.querySelector('#multiplayer-loot-choices');
  const lootTimer = document.querySelector('#multiplayer-loot-timer');
  let connection = null;
  let roomState = null;
  let reconnectTimer = null;
  let timerInterval = null;
  let intentionallyClosed = false;
  let awardRefreshPending = false;
  let lastStatsExp = null;
  let connected = false;
  let actionPending = false;
  let tableGame = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function send(message) {
    if (!connection) {
      setStatus('Multiplayer is disconnected. Reconnecting…');
      return false;
    }
    try {
      connection?.send(message);
      return true;
    } catch (error) {
      setStatus(error.message);
      return false;
    }
  }

  function open() {
    intentionallyClosed = false;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (connection) return;
    connect();
  }

  function connect() {
    connection = connectMultiplayer({
      onOpen: () => {
        connected = true;
        setStatus('Connected. Create a room or join with a code.');
        const code = window.localStorage.getItem(savedRoomKey);
        if (code) send({ type: 'join_room', code });
      },
      onClose: () => {
        connection = null;
        connected = false;
        actionPending = false;
        if (intentionallyClosed) return;
        setStatus('Connection lost. Reconnecting…');
        reconnectTimer = window.setTimeout(connect, 2000);
      },
      onError: () => setStatus('Could not connect to multiplayer. Check your connection and try again.'),
      onMessage: receive,
    });
  }

  function receive(message) {
    if (message.type === 'error') {
      actionPending = false;
      if (message.message === 'Room not found.' || message.message === 'This room has expired.') {
        window.localStorage.removeItem(savedRoomKey);
        roomState = null;
        roomPanel.hidden = true;
        entry.hidden = false;
      } else if (roomState) {
        render();
      }
      setStatus(message.message);
      return;
    }
    if (message.type !== 'room_state') return;
    actionPending = false;
    const previousPhase = roomState?.phase;
    roomState = message.room;
    if (roomState.viewerStats && roomState.viewerStats.totalExp !== lastStatsExp) {
      lastStatsExp = roomState.viewerStats.totalExp;
      onStatsUpdated({
        user: { id: roomState.viewerId },
        stats: roomState.viewerStats,
      });
    }
    if (roomState.phase === 'complete' || roomState.phase === 'failed') {
      window.localStorage.removeItem(savedRoomKey);
      if (roomState.phase === 'complete' && previousPhase !== 'complete') {
        refreshStats();
      }
    } else {
      window.localStorage.setItem(savedRoomKey, roomState.code);
    }
    render();
  }

  async function refreshStats() {
    if (awardRefreshPending) return;
    awardRefreshPending = true;
    try {
      const account = await request('/api/auth/me');
      onStatsUpdated(account);
    } catch (error) {
      setStatus(`Dungeon cleared, but player stats could not be refreshed: ${error.message}`);
    } finally {
      awardRefreshPending = false;
    }
  }

  function render() {
    if (!roomState) return;
    entry.hidden = true;
    roomPanel.hidden = false;
    roomCodeDisplay.textContent = roomState.code;
    tableGame ??= createBlackjackMultiplayerGame(tableParent);
    tableGame.scene.getScene('blackjack-multiplayer')?.renderRoom(roomState);
    const currentPlayer = roomState.players.find(({ id }) => id === roomState.currentPlayerId);
    const monster = roomState.monster;
    monsterName.textContent = monster?.name ?? roomState.dungeonName;
    monsterHp.textContent = `${roomState.monsterHp} / ${monster?.hp ?? 0} HP`;
    monsterHealth.style.width = `${monster?.hp
      ? Math.max(0, Math.min(100, roomState.monsterHp / monster.hp * 100))
      : 0}%`;
    progress.textContent = roomState.phase === 'lobby'
      ? 'Waiting for players. The host can start with at least two adventurers.'
      : roomState.phase === 'complete'
        ? `${roomState.dungeonName} cleared! Every surviving player earned the dungeon reward.`
        : roomState.phase === 'failed'
          ? 'The party was defeated.'
          : roomState.phase === 'loot'
            ? `Stage ${roomState.stage} cleared. Choose your item to continue.`
            : roomState.phase === 'betting'
              ? `${roomState.dungeonName} · Stage ${roomState.stage} · Round ${roomState.round} · Betting is open`
              : roomState.phase === 'battle'
                ? `${roomState.dungeonName} · Stage ${roomState.stage} · Round ${roomState.round} · Dealer revealed`
                : `${roomState.dungeonName} · Stage ${roomState.stage} of ${roomState.stageCount} · Round ${roomState.round}${currentPlayer ? ` · ${currentPlayer.username}'s turn` : ''}`;
    if (roomState.lastMessage) setStatus(roomState.lastMessage);

    playersList.replaceChildren(...roomState.players.map((player) => createPlayerRow(player, roomState)));
    const me = roomState.players.find(({ id }) => id === roomState.viewerId);
    const bettingOpen = roomState.phase === 'betting' && connected;
    betActions.hidden = !bettingOpen;
    if (bettingOpen) {
      const remainingSeconds = Math.max(0, Math.ceil((roomState.turnEndsAt - Date.now()) / 1000));
      betTimer.textContent = me?.betPlaced
        ? `Bet submitted · waiting for the party · ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`
        : `Shared betting window · ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`;
      for (const button of betActions.querySelectorAll('[data-multiplayer-bet]')) {
        const percentage = Number(button.dataset.multiplayerBet);
        const stake = Math.ceil((me?.playerHp ?? 0) * percentage);
        button.disabled = actionPending || !me?.alive || me.betPlaced
          || (percentage > 0 && stake >= (me?.playerHp ?? 0));
        button.textContent = percentage
          ? `Bet ${percentage * 100}% HP (${stake} HP) · +${percentage * 200}% damage`
          : 'Skip bet';
      }
    }
    const isMyTurn = roomState.phase === 'playing'
      && connected
      && roomState.currentPlayerId === roomState.viewerId
      && me?.hand?.status === 'playing';
    turnActions.hidden = !isMyTurn;
    if (isMyTurn) {
      const remainingSeconds = Math.max(0, Math.ceil((roomState.turnEndsAt - Date.now()) / 1000));
      turnTimer.textContent = `Your turn · ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`;
      const doubleDown = turnActions.querySelector('[data-multiplayer-action="double_down"]');
      for (const button of turnActions.querySelectorAll('[data-multiplayer-action]')) {
        button.disabled = actionPending;
      }
      doubleDown.disabled = actionPending || me.hand.playerHand.length !== 2 || me.hand.doubledDown;
    }
    startButton.hidden = !(roomState.phase === 'lobby' && roomState.hostId === roomState.viewerId);
    startButton.disabled = roomState.players.length < 2;
    lootPanel.hidden = roomState.phase !== 'loot' || !me?.lootChoices.length;
    if (roomState.phase === 'loot') {
      const remainingSeconds = Math.max(0, Math.ceil((roomState.turnEndsAt - Date.now()) / 1000));
      lootTimer.textContent = `Shared item-pick timer · ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`;
    }
    lootChoices.replaceChildren(...(me?.lootChoices ?? []).map((itemId) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'multiplayer-loot-choice';
      button.textContent = itemId.replaceAll('-', ' ');
      button.addEventListener('click', () => send({ type: 'choose_item', itemId }));
      return button;
    }));
    if (timerInterval) window.clearInterval(timerInterval);
    if (isMyTurn || bettingOpen || roomState.phase === 'loot') {
      timerInterval = window.setInterval(render, 1000);
    }
  }

  function createPlayerRow(player, room) {
    const row = document.createElement('li');
    row.className = 'multiplayer-player';
    const heading = document.createElement('div');
    heading.className = 'multiplayer-player-heading';
    const name = document.createElement('strong');
    name.textContent = `${player.username}${player.id === room.hostId ? ' · Host' : ''}${player.id === room.currentPlayerId ? ' · Taking turn' : ''}`;
    const health = document.createElement('span');
    health.textContent = `${player.alive ? player.playerHp : 0} / ${player.maxHp} HP${player.betHp ? ` · ${player.betHp} HP bet` : ''}${player.connected ? '' : ' · offline'}`;
    heading.append(name, health);
    row.append(heading);
    if (player.items.length) {
      const items = document.createElement('p');
      items.className = 'multiplayer-items';
      items.textContent = `Items: ${player.items.join(', ')}`;
      row.append(items);
    }
    return row;
  }

  createButton.addEventListener('click', () => send({ type: 'create_room' }));
  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    send({ type: 'join_room', code: joinCode.value });
  });
  startButton.addEventListener('click', () => send({ type: 'start_game' }));
  betActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-multiplayer-bet]');
    if (button && !button.disabled && !actionPending) {
      actionPending = true;
      for (const betButton of betActions.querySelectorAll('[data-multiplayer-bet]')) {
        betButton.disabled = true;
      }
      if (!send({ type: 'bet', percentage: Number(button.dataset.multiplayerBet) })) {
        actionPending = false;
        render();
      }
    }
  });
  leaveButton.addEventListener('click', () => {
    send({ type: 'leave_room' });
    roomState = null;
    window.localStorage.removeItem(savedRoomKey);
    lastStatsExp = null;
    tableGame?.destroy(true);
    tableGame = null;
    roomPanel.hidden = true;
    entry.hidden = false;
    setStatus('You left the room.');
  });
  turnActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-multiplayer-action]');
    if (button && !button.disabled && !actionPending) {
      actionPending = true;
      for (const actionButton of turnActions.querySelectorAll('[data-multiplayer-action]')) {
        actionButton.disabled = true;
      }
      if (!send({ type: 'action', action: button.dataset.multiplayerAction })) {
        actionPending = false;
        render();
      }
    }
  });

  function close() {
    intentionallyClosed = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (timerInterval) window.clearInterval(timerInterval);
    if (roomState && connection) send({ type: 'leave_room' });
    connection?.close();
    connection = null;
    connected = false;
    actionPending = false;
    roomState = null;
    window.localStorage.removeItem(savedRoomKey);
    lastStatsExp = null;
    roomPanel.hidden = true;
    entry.hidden = false;
  }

  return { open, close };
}
