import './style.css';
import { createBlackjackGame } from './blackjack-scene.js';
import { request } from './services/api.js';
import { createAuthController } from './ui/auth.js';
import { createCharacterLab } from './ui/character-lab.js';
import { createDungeonCatalog } from './ui/dungeon-catalog.js';
import { createScreenController } from './ui/screens.js';
import { chooseItemOptions, getItem, getItemEffects } from './items.js';
import {
  dungeons,
  getDungeonMonster,
  getDungeonStageCount,
} from '../../shared/dungeon-config.js';

const cardActionDelayMs = 200;
const winningOutcomes = ['player_blackjack', 'player_win', 'dealer_bust'];
const losingOutcomes = ['dealer_blackjack', 'player_bust', 'dealer_win'];
const expRequiredForNextLevel = (level) => level * 100;

let game = null;
let currentGame = null;
let currentPlayer = null;
let currentStats = {
  totalExp: 0,
  strength: 0,
  agility: 0,
  constitution: 0,
  luck: 0,
  availableStatPoints: 0,
};
let runState = null;
let resolvingStage = false;
let startingHand = false;
let renderProgression;

const hitButton = document.querySelector('#hit-button');
const standButton = document.querySelector('#stand-button');
const doubleDownButton = document.querySelector('#double-down-button');
const newGameButton = document.querySelector('#new-game-button');
const suggestedLevel = document.querySelector('#suggested-level');
const status = document.querySelector('#status');
const dungeonProgress = document.querySelector('#dungeon-progress');
const table = document.querySelector('#table');
const lootPanel = document.querySelector('#loot-panel');
const accountName = document.querySelector('#account-name');
const experienceLeaderboardList = document.querySelector('#experience-leaderboard-list');
const monstersLeaderboardList = document.querySelector('#monsters-leaderboard-list');
const leaderboardStatus = document.querySelector('#leaderboard-status');

function baseMaximumHealth() {
  return 100 + currentStats.constitution * 20;
}

function maximumHealth() {
  const itemEffects = runState && !['failed', 'complete'].includes(runState.phase)
    ? getItemEffects(runState.items)
    : { maxHealth: 0 };
  return baseMaximumHealth() + itemEffects.maxHealth;
}

function suggestedCharacterLevel() {
  return Math.min(10, Math.max(1, currentStats.level ?? 1));
}

function initialRunState(dungeon, run) {
  return {
    dungeonId: run.id,
    dungeon,
    suggestedLevel: run.suggestedLevel,
    stage: 1,
    playerHp: baseMaximumHealth(),
    monsterHp: getDungeonMonster(dungeon, 1).hp,
    lastResolvedGameId: null,
    lastRoundMessage: '',
    phase: 'active',
    pendingStageClear: null,
    items: [],
  };
}

function applyTotalExp(totalExp) {
  let level = 1;
  let remainingExp = totalExp;
  while (remainingExp >= expRequiredForNextLevel(level)) {
    remainingExp -= expRequiredForNextLevel(level);
    level += 1;
  }
  currentStats.totalExp = totalExp;
  currentStats.level = level;
  currentStats.expIntoLevel = remainingExp;
}

function currentMonster() {
  return runState ? getDungeonMonster(runState.dungeon, runState.stage) : null;
}

function currentStageCount() {
  return runState ? getDungeonStageCount(runState.dungeon) : getDungeonStageCount(dungeons[0]);
}

function maximumMonsterHealth() {
  return currentMonster()?.hp ?? 0;
}

function outcomeMessage(outcome) {
  const messages = {
    player_blackjack: 'Blackjack! You win the hand.',
    dealer_blackjack: 'The monster wins the hand.',
    player_bust: 'Bust! The monster wins the hand.',
    dealer_bust: 'The monster busts. You win the hand!',
    player_win: 'You win the hand!',
    dealer_win: 'The monster wins the hand.',
    push: 'Push. No damage dealt.',
  };
  return messages[outcome] ?? 'Your hand is in play.';
}

function resolveCombatRound(gameState) {
  if (
    !runState
    || runState.phase !== 'active'
    || gameState.status !== 'complete'
    || gameState.id === runState.lastResolvedGameId
  ) {
    return;
  }

  if (winningOutcomes.includes(gameState.outcome)) {
    const itemEffects = getItemEffects(runState.items);
    const baseDamage = Math.max(
      1,
      gameState.playerScore + currentStats.strength + itemEffects.attack - currentMonster().defense,
    )
      * (gameState.doubledDown ? 2 : 1);
    const criticalChance = Math.min(100, currentStats.luck * 3 + itemEffects.criticalChance * 100);
    const criticalHit = Math.random() * 100 < criticalChance;
    const damage = criticalHit ? Math.floor(baseDamage * 1.5) : baseDamage;
    runState.monsterHp = Math.max(0, runState.monsterHp - damage);
    const healing = Math.min(
      maximumHealth() - runState.playerHp,
      Math.ceil(maximumHealth() * itemEffects.healOnHit),
    );
    runState.playerHp += healing;
    const hitMessage = criticalHit
      ? `Critical hit! You deal ${damage} damage.`
      : `You deal ${damage} damage.`;
    const doubleDownMessage = gameState.doubledDown ? ' Double down doubles your attack!' : '';
    runState.lastRoundMessage = healing > 0
      ? `${hitMessage}${doubleDownMessage} The necklace restores ${healing} HP.`
      : `${hitMessage}${doubleDownMessage}`;
    if (runState.monsterHp === 0) {
      runState.phase = 'clearing';
      runState.pendingStageClear = { stage: runState.stage, gameId: gameState.id };
    }
  } else if (losingOutcomes.includes(gameState.outcome)) {
    const itemEffects = getItemEffects(runState.items);
    const baseDamage = gameState.dealerScore + currentMonster().attackPower;
    const damage = Math.floor(baseDamage * (1 - itemEffects.damageReduction))
      * (gameState.doubledDown ? 2 : 1);
    const dodgeChance = Math.min(100, currentStats.agility * 5 + itemEffects.dodgeChance * 100);
    if (Math.random() * 100 < dodgeChance) {
      runState.lastRoundMessage = `You dodge the monster's ${damage}-damage attack.${gameState.doubledDown ? ' Double down doubles the damage you would take.' : ''}`;
    } else {
      runState.playerHp = Math.max(0, runState.playerHp - damage);
      runState.lastRoundMessage = gameState.doubledDown
        ? `The monster deals ${damage} damage to you. Double down doubles the damage you take.`
        : `The monster deals ${damage} damage to you.`;
    }
    if (runState.playerHp === 0) {
      runState.phase = 'failed';
      runState.items = [];
      removeDungeonSession(runState.dungeonId, gameState.id).catch((error) => {
        console.error(error);
        status.textContent = `You were defeated on stage ${runState.stage}. Could not remove the dungeon session: ${error.message}`;
      });
    }
  } else {
    runState.lastRoundMessage = 'No damage dealt.';
  }

  runState.lastResolvedGameId = gameState.id;
  if (runState.pendingStageClear) {
    syncStageClear().catch((error) => {
      console.error(error);
      status.textContent = `Could not finish stage ${runState.stage}: ${error.message}. Retry the stage clear.`;
      renderControls();
    });
  }
}

function render(gameState) {
  currentGame = gameState;
  resolveCombatRound(gameState);
  const monster = currentMonster();
  const stageCount = currentStageCount();
  const boss = Boolean(runState && runState.stage === stageCount);
  if (game) {
    game.scene.getScene('blackjack')?.renderGame(gameState, {
      playerHp: runState?.playerHp ?? maximumHealth(),
      playerMaxHp: maximumHealth(),
      monsterHp: runState?.monsterHp ?? monster?.hp ?? 0,
      monsterMaxHp: maximumMonsterHealth(),
      monsterName: monster?.name ?? 'Monster',
      stage: runState?.stage ?? 1,
      stageCount,
      boss,
    });
  }
  renderProgression();
  renderControls();
  table.setAttribute(
    'aria-label',
    `Stage ${runState?.stage ?? 1} of ${stageCount}${boss ? ', boss' : ''}. Hero health ${runState?.playerHp ?? maximumHealth()} of ${maximumHealth()}. ${monster?.name ?? 'Monster'} health ${runState?.monsterHp ?? monster?.hp ?? 0}.`,
  );

  if (runState?.phase === 'failed') {
    status.textContent = `You were defeated in ${runState.dungeon.name} on stage ${runState.stage}. No EXP is awarded; start a new dungeon to try again.`;
  } else if (runState?.phase === 'complete') {
    status.textContent = `Dungeon cleared! You earned ${runState.dungeon.rewardExp} EXP.`;
  } else if (runState?.phase === 'loot') {
    status.textContent = `Stage ${runState.stage} cleared. Choose one item to continue.`;
  } else if (runState?.phase === 'clearing') {
    status.textContent = `Stage ${runState.stage} defeated. Resolving the stage…`;
  } else {
    const roundMessage = gameState.status === 'complete'
      && gameState.id === runState?.lastResolvedGameId
      ? runState.lastRoundMessage
      : '';
    status.textContent = [outcomeMessage(gameState.outcome), roundMessage].filter(Boolean).join(' ');
  }
}

function renderControls() {
  const active = runState?.phase === 'active';
  const handInProgress = currentGame?.status === 'playing';
  const stageComplete = runState?.phase === 'loot';
  const canDoubleDown = currentGame?.playerHand.length === 2 && !currentGame?.doubledDown;
  hitButton.disabled = startingHand || !active || !handInProgress;
  standButton.disabled = startingHand || !active || !handInProgress;
  doubleDownButton.disabled = startingHand || !active || !handInProgress || !canDoubleDown;
  newGameButton.disabled = startingHand || resolvingStage
    || (runState?.phase === 'clearing' ? false : !active || handInProgress);
  suggestedLevel.textContent = `Level ${runState?.suggestedLevel ?? suggestedCharacterLevel()}`;
  lootPanel.hidden = !stageComplete;
  renderItemInventory();
  renderLootChoices();
  newGameButton.textContent = startingHand
    ? 'Starting hand…'
    : runState?.phase === 'clearing'
      ? 'Retry stage clear'
      : 'Next hand';

  if (!runState) {
    document.querySelector('#active-dungeon-name').textContent = '';
    dungeonProgress.textContent = 'Your next run is ready when you are.';
  } else {
    const stageCount = currentStageCount();
    const label = runState.stage === stageCount ? 'Boss' : 'Mob';
    dungeonProgress.textContent = runState.phase === 'complete'
      ? `${runState.dungeon.name} cleared!`
      : runState.phase === 'failed'
        ? `${runState.dungeon.name} · Defeated on stage ${runState.stage} of ${stageCount}`
        : `${runState.dungeon.name} · Stage ${runState.stage} of ${stageCount} · ${label} · ${runState.items.length} item${runState.items.length === 1 ? '' : 's'} collected`;
    document.querySelector('#active-dungeon-name').textContent = runState.dungeon.name;
  }
}

function renderItemInventory() {
  const activeItems = document.querySelector('#active-items');
  const emptyInventory = document.querySelector('#empty-inventory');
  const groupedItems = new Map();
  for (const collectedItem of runState?.items ?? []) {
    if (!collectedItem || typeof collectedItem.itemId !== 'string') continue;
    const item = getItem(collectedItem.itemId);
    if (item) groupedItems.set(item, (groupedItems.get(item) ?? 0) + 1);
  }

  activeItems.replaceChildren();
  activeItems.hidden = groupedItems.size === 0;
  emptyInventory.hidden = groupedItems.size > 0;
  for (const [item, count] of groupedItems) {
    const entry = document.createElement('li');
    entry.textContent = `${item.name}${count > 1 ? ` ×${count}` : ''}`;
    activeItems.append(entry);
  }
}

function renderLootChoices() {
  const lootChoices = document.querySelector('#loot-choices');
  lootChoices.replaceChildren();
  for (const itemId of runState?.lootChoices ?? []) {
    const item = getItem(itemId);
    if (!item) continue;
    const button = document.createElement('button');
    button.className = 'loot-choice';
    button.type = 'button';
    button.dataset.item = item.id;
    button.disabled = resolvingStage;
    const name = document.createElement('strong');
    name.textContent = item.name;
    const description = document.createElement('span');
    description.textContent = item.description;
    button.append(name, description);
    button.addEventListener('click', () => chooseItem(item.id));
    lootChoices.append(button);
  }
}

function clearCurrentHand() {
  currentGame = null;
  game?.scene.getScene('blackjack')?.clearHand();
}

async function startHand() {
  if (startingHand) {
    return;
  }
  startingHand = true;
  try {
    clearCurrentHand();
    renderControls();
    status.textContent = 'Dealing your opening hand…';
    const { game: newGame } = await request('/api/games', { method: 'POST' });
    render(newGame);
  } finally {
    startingHand = false;
    renderControls();
  }
}

async function syncStageClear() {
  if (!runState?.pendingStageClear || resolvingStage) {
    return;
  }
  resolvingStage = true;
  renderControls();
  const { stage, gameId } = runState.pendingStageClear;
  try {
    const result = await request(`/api/dungeons/${encodeURIComponent(runState.dungeonId)}/clear-stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, gameId }),
    });
    if (result.stats) {
      currentStats = result.stats;
      applyTotalExp(result.stats.totalExp);
    }
    if (stage === currentStageCount()) {
      await removeDungeonSession(runState.dungeonId, currentGame?.id);
    }
    runState.pendingStageClear = null;
    const finalStage = stage === currentStageCount();
    runState.phase = finalStage ? 'complete' : 'loot';
    runState.lootChoices = finalStage ? [] : chooseItemOptions();
    if (finalStage) {
      runState.items = [];
      runState.playerHp = Math.min(runState.playerHp, baseMaximumHealth());
    }
    renderProgression();
    if (finalStage) {
      status.textContent = `Dungeon cleared! You earned ${runState.dungeon.rewardExp} EXP.`;
    } else {
      status.textContent = `Stage ${stage} cleared. Choose one item to continue.`;
    }
  } finally {
    resolvingStage = false;
    renderControls();
  }
}

async function removeDungeonSession(dungeonId, gameId) {
  await request(`/api/dungeons/${encodeURIComponent(dungeonId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId }),
  });
}

async function beginDungeon(selectedDungeon) {
  renderControls();
  status.textContent = 'Entering the dungeon…';
  try {
    const { dungeon } = await request('/api/dungeons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dungeonKey: selectedDungeon.id,
        suggestedLevel: suggestedCharacterLevel(),
      }),
    });
    runState = initialRunState(selectedDungeon, dungeon);
    await startHand();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not enter the dungeon: ${error.message}`;
  }
}

async function chooseItem(itemId) {
  if (runState?.phase !== 'loot' || resolvingStage) {
    return;
  }
  const item = getItem(itemId);
  if (!item || !runState.lootChoices?.includes(itemId)) {
    return;
  }
  resolvingStage = true;
  renderControls();
  const clearedStage = runState.stage;
  const previousMaxHealth = maximumHealth();
  runState.items.push({ stage: clearedStage, itemId });
  if (item.effects.maxHealth) {
    runState.playerHp = Math.min(
      maximumHealth(),
      runState.playerHp + maximumHealth() - previousMaxHealth,
    );
  }
  runState.lootChoices = [];
  runState.stage += 1;
  runState.monsterHp = maximumMonsterHealth();
  runState.phase = 'active';
  runState.lastRoundMessage = '';
  try {
    await startHand();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not start stage ${runState.stage}: ${error.message}`;
    renderControls();
  } finally {
    resolvingStage = false;
    renderControls();
  }
}

async function enterGame(account) {
  currentPlayer = account.user;
  currentStats = account.stats;
  applyTotalExp(account.stats.totalExp);
  accountName.textContent = currentPlayer.username;
  screens.show('lobby');
  renderProgression();
}

async function startGame(selectedDungeon) {
  const startGameButton = document.querySelector('#start-game-button');
  const quitButton = document.querySelector('#dungeon-screen [data-back-to-lobby]');
  startGameButton.disabled = true;
  quitButton.disabled = true;
  try {
    screens.show('dungeon');
    game ??= createBlackjackGame('game');
    await beginDungeon(selectedDungeon);
  } finally {
    startGameButton.disabled = false;
    quitButton.disabled = false;
  }
}

async function quitDungeon() {
  const dungeonId = runState?.dungeonId;
  const gameId = currentGame?.id;
  if (dungeonId) {
    const startGameButton = document.querySelector('#start-game-button');
    startGameButton.disabled = true;
    try {
      await removeDungeonSession(dungeonId, gameId);
    } catch (error) {
      console.error(error);
      status.textContent = `Could not remove the dungeon session: ${error.message}`;
      screens.show('dungeon');
      startGameButton.disabled = false;
      return;
    }
    startGameButton.disabled = false;
  }
  currentGame = null;
  runState = null;
  clearCurrentHand();
  renderControls();
}

async function openLeaderboard() {
  experienceLeaderboardList.replaceChildren();
  monstersLeaderboardList.replaceChildren();
  leaderboardStatus.textContent = 'Loading leaderboard…';

  try {
    const { experience, monstersDefeated } = await request('/api/player/leaderboard');
    const renderEntries = (list, players, scoreLabel, emptyLabel) => {
      if (players.length === 0) {
        const emptyEntry = document.createElement('li');
        emptyEntry.className = 'leaderboard-empty';
        emptyEntry.textContent = emptyLabel;
        list.append(emptyEntry);
        return;
      }
      for (const player of players) {
        const entry = document.createElement('li');
        const username = document.createElement('strong');
        const score = document.createElement('span');
        username.textContent = player.username;
        score.textContent = scoreLabel(player);
        entry.append(username, score);
        list.append(entry);
      }
    };

    renderEntries(
      experienceLeaderboardList,
      experience,
      (player) => `${player.totalExp.toLocaleString()} EXP`,
      'No players have registered yet.',
    );
    renderEntries(
      monstersLeaderboardList,
      monstersDefeated,
      (player) => player.monstersDefeated.toLocaleString(),
      'No players have registered yet.',
    );
    leaderboardStatus.textContent = '';
  } catch (error) {
    console.error(error);
    leaderboardStatus.textContent = `Could not load leaderboard: ${error.message}`;
  }
}

async function takeAction(action) {
  if (!currentGame || currentGame.status !== 'playing' || runState?.phase !== 'active') {
    return;
  }

  hitButton.disabled = true;
  standButton.disabled = true;
  doubleDownButton.disabled = true;
  newGameButton.disabled = true;
  status.textContent = action === 'hit'
    ? 'Dealing a card…'
    : action === 'double_down'
      ? 'Doubling down and dealing one card…'
      : 'The monster takes its turn…';

  try {
    await new Promise((resolve) => setTimeout(resolve, cardActionDelayMs));
    const { game: updatedGame } = await request(`/api/games/${currentGame.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    render(updatedGame);
  } catch (error) {
    console.error(error);
    status.textContent = `Could not update the hand: ${error.message}`;
    renderControls();
  }
}

async function nextHand() {
  if (runState?.phase === 'clearing') {
    try {
      await syncStageClear();
    } catch (error) {
      console.error(error);
      status.textContent = `Could not finish stage ${runState.stage}: ${error.message}. Retry the stage clear.`;
    }
    return;
  }
  if (runState?.phase !== 'active' || currentGame?.status === 'playing') {
    return;
  }
  newGameButton.disabled = true;
  try {
    await startHand();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not start the next hand: ${error.message}`;
    renderControls();
  }
}

hitButton.addEventListener('click', () => takeAction('hit'));
standButton.addEventListener('click', () => takeAction('stand'));
doubleDownButton.addEventListener('click', () => takeAction('double_down'));
newGameButton.addEventListener('click', nextHand);
const characterLab = createCharacterLab({
  getStats: () => currentStats,
  setStats: (stats) => {
    currentStats = stats;
  },
  getRunState: () => runState,
  maximumHealth,
  expRequiredForNextLevel,
  applyTotalExp,
  renderGame: () => {
    if (currentGame) render(currentGame);
  },
  setStatus: (message) => {
    status.textContent = message;
  },
});
renderProgression = characterLab.renderProgression;
const screens = createScreenController({
  onQuitDungeon: quitDungeon,
  onOpenLab: renderProgression,
  onOpenLeaderboard: openLeaderboard,
  onOpenDungeons: () => createDungeonCatalog(
    document.querySelector('#dungeon-catalog'),
    dungeons,
    startGame,
    currentStats.level ?? 1,
  ),
});
const auth = createAuthController({
  onAuthenticated: enterGame,
  onBeforeSignOut: async () => {
    if (runState?.dungeonId) {
      await removeDungeonSession(runState.dungeonId, currentGame?.id);
    }
  },
  onSignedOut: () => {
    currentPlayer = null;
    currentGame = null;
    runState = null;
    game?.destroy(true);
    game = null;
  },
  onSignOutError: (error) => {
    status.textContent = `Could not sign out: ${error.message}`;
  },
});

auth.checkSession();

window.addEventListener('pagehide', () => {
  if (!runState?.dungeonId) return;
  fetch(`/api/dungeons/${encodeURIComponent(runState.dungeonId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: currentGame?.id }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) console.error(`Could not remove the dungeon session (${response.status}).`);
  }).catch((error) => console.error(error));
});
