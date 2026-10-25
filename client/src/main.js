import './style.css';
import { createBlackjackGame } from './blackjack-scene.js';
import { characters } from './characters.js';
import { request } from './services/api.js';
import { outcomeMessage, resolveCombatRound } from './game/combat.js';
import { createAuthController } from './ui/auth.js';
import { createCharacterLab } from './ui/character-lab.js';
import { createDungeonCatalog } from './ui/dungeon-catalog.js';
import { createLeaderboardController } from './ui/leaderboard.js';
import { createLootRenderer } from './ui/loot.js';
import { createMultiplayerController } from './ui/multiplayer.js';
import { createScreenController } from './ui/screens.js';
import { chooseItemOptions, getItem, getItemEffects } from './items.js';
import {
  dungeons,
  getDungeonMonster,
  getDungeonStageCount,
} from '../../shared/dungeon-config.js';

const cardActionDelayMs = 200;
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
  currency: 0,
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
const wagerPanel = document.querySelector('#wager-panel');
const wagerButtons = document.querySelectorAll('[data-wager]');
const suggestedLevel = document.querySelector('#suggested-level');
const status = document.querySelector('#status');
const dungeonProgress = document.querySelector('#dungeon-progress');
const battlefield = document.querySelector('#battlefield');
const lootPanel = document.querySelector('#loot-panel');
const accountName = document.querySelector('#account-name');
const lobbyCurrency = document.querySelector('#lobby-currency');
const characterSelect = document.querySelector('#character-select');
const settingsStatus = document.querySelector('#settings-status');
const characterPreferenceKey = 'dungeon-run-character';

let selectedCharacter = characters[0].id;
let characterSettingsMessage = '';
try {
  const savedCharacter = window.localStorage.getItem(characterPreferenceKey);
  if (characters.some(({ id }) => id === savedCharacter)) {
    selectedCharacter = savedCharacter;
  }
} catch (error) {
  console.error(error);
  characterSettingsMessage = 'Could not load your saved character. The Adventurer is selected for this visit.';
}

characterSelect.addEventListener('change', () => {
  selectedCharacter = characterSelect.value;
  const character = characters.find(({ id }) => id === selectedCharacter);
  game?.battlefield.scene.getScene('blackjack')?.setCharacter(selectedCharacter);

  try {
    window.localStorage.setItem(characterPreferenceKey, selectedCharacter);
    characterSettingsMessage = `${character.name} selected.`;
  } catch (error) {
    console.error(error);
    characterSettingsMessage = `${character.name} selected for this visit, but the preference could not be saved.`;
  }
  settingsStatus.textContent = characterSettingsMessage;
});

function baseMaximumHealth() {
  return 200 + currentStats.constitution * 20;
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
    lastExpAwarded: 0,
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

function renderCurrency() {
  lobbyCurrency.textContent = new Intl.NumberFormat().format(currentStats.currency);
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

function renderBattlefield() {
  if (!game) {
    return;
  }
  const monster = currentMonster();
  const stageCount = currentStageCount();
  const boss = Boolean(runState && runState.stage === stageCount);
  game.battlefield.scene.getScene('blackjack')?.renderBattlefield({
    playerHp: runState?.playerHp ?? maximumHealth(),
    playerMaxHp: maximumHealth(),
    monsterHp: runState?.monsterHp ?? monster?.hp ?? 0,
    monsterMaxHp: maximumMonsterHealth(),
    monsterName: monster?.name ?? 'Monster',
    damageEvent: runState?.lastDamageEvent ?? null,
    stage: runState?.stage ?? 1,
    stageCount,
    boss,
  });
  battlefield.setAttribute(
    'aria-label',
    `Stage ${runState?.stage ?? 1} of ${stageCount}${boss ? ', boss' : ''}. Hero health ${runState?.playerHp ?? maximumHealth()} of ${maximumHealth()}. ${monster?.name ?? 'Monster'} health ${runState?.monsterHp ?? monster?.hp ?? 0}.`,
  );
}

function render(gameState) {
  currentGame = gameState;
  resolveCombatRound(gameState, {
    runState,
    currentStats,
    currentMonster,
    maximumHealth,
    removeDungeonSession,
    syncStageClear,
    onDungeonSessionRemovalError: (error, failedRun) => {
      console.error(error);
      status.textContent = `You were defeated on stage ${failedRun.stage}. Could not remove the dungeon session: ${error.message}`;
    },
    onStageClearError: (error, failedRun) => {
      console.error(error);
      status.textContent = `Could not finish stage ${failedRun.stage}: ${error.message}. Retry the stage clear.`;
      renderControls();
    },
  });
  if (game) {
    game.cards.scene.getScene('blackjack')?.renderGame(gameState);
  }
  renderBattlefield();
  renderProgression();
  renderControls();

  if (runState?.phase === 'failed') {
    status.textContent = `You were defeated in ${runState.dungeon.name} on stage ${runState.stage}. No EXP is awarded; start a new dungeon to try again.`;
  } else if (runState?.phase === 'complete') {
    status.textContent = `Dungeon cleared! You earned ${runState.lastExpAwarded} EXP.`;
  } else if (runState?.phase === 'loot') {
    status.textContent = `Stage ${runState.stage} cleared! You earned ${runState.lastExpAwarded} EXP. Choose one item to continue.`;
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
  const awaitingWager = active && !handInProgress && !startingHand;
  const stageComplete = runState?.phase === 'loot';
  const canDoubleDown = currentGame?.playerHand.length === 2 && !currentGame?.doubledDown;
  hitButton.disabled = startingHand || !active || !handInProgress;
  standButton.disabled = startingHand || !active || !handInProgress;
  doubleDownButton.disabled = startingHand || !active || !handInProgress || !canDoubleDown;
  wagerPanel.hidden = !awaitingWager;
  for (const button of wagerButtons) {
    const percentage = Number(button.dataset.wager);
    const stake = Math.ceil((runState?.playerHp ?? 0) * percentage);
    if (percentage > 0) {
      button.textContent = `Bet ${percentage * 100}% HP (${stake} HP) · +${percentage * 200}% damage`;
    }
    button.disabled = startingHand || !awaitingWager
      || (percentage > 0 && stake >= (runState?.playerHp ?? 0));
  }
  newGameButton.disabled = startingHand || resolvingStage
    || (runState?.phase === 'clearing' ? false : !active || handInProgress);
  newGameButton.hidden = awaitingWager;
  suggestedLevel.textContent = `Level ${runState?.suggestedLevel ?? suggestedCharacterLevel()}`;
  lootPanel.hidden = !stageComplete;
  lootRenderer.renderInventory();
  lootRenderer.renderChoices();
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

function clearCurrentHand() {
  currentGame = null;
  game?.cards.scene.getScene('blackjack')?.clearHand();
}

async function startHand(percentage) {
  if (startingHand) {
    return;
  }
  if (![0, 0.1, 0.25, 0.5].includes(percentage) || !runState || runState.phase !== 'active') {
    return;
  }
  startingHand = true;
  const hpStake = Math.ceil(runState.playerHp * percentage);
  if (percentage > 0 && hpStake >= runState.playerHp) {
    startingHand = false;
    status.textContent = 'You need at least 1 HP remaining after the wager.';
    renderControls();
    return;
  }
  runState.playerHp -= hpStake;
  runState.activeWager = percentage > 0 ? { percentage, hpStake } : null;
  try {
    clearCurrentHand();
    renderControls();
    status.textContent = 'Dealing your opening hand…';
    const { game: newGame } = await request('/api/games', { method: 'POST' });
    render(newGame);
  } catch (error) {
    runState.playerHp += hpStake;
    runState.activeWager = null;
    throw error;
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
      renderCurrency();
    }
    runState.lastExpAwarded = result.expAwarded;
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
      status.textContent = `Dungeon cleared! You earned ${result.expAwarded} EXP.`;
    } else {
      status.textContent = `Stage ${stage} cleared! You earned ${result.expAwarded} EXP. Choose one item to continue.`;
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
    renderBattlefield();
    renderControls();
    status.textContent = 'Choose an HP wager or skip to start your hand.';
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
  resolvingStage = false;
  renderBattlefield();
  renderControls();
  status.textContent = 'Choose an HP wager or skip to start your hand.';
}

async function enterGame(account) {
  currentPlayer = account.user;
  currentStats = account.stats;
  applyTotalExp(account.stats.totalExp);
  renderCurrency();
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
    game ??= createBlackjackGame('game', 'battlefield-game', selectedCharacter);
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
}

for (const button of wagerButtons) {
  button.addEventListener('click', async () => {
    try {
      await startHand(Number(button.dataset.wager));
    } catch (error) {
      console.error(error);
      status.textContent = `Could not start the hand: ${error.message}`;
      renderControls();
    }
  });
}

hitButton.addEventListener('click', () => takeAction('hit'));
standButton.addEventListener('click', () => takeAction('stand'));
doubleDownButton.addEventListener('click', () => takeAction('double_down'));
newGameButton.addEventListener('click', nextHand);
const lootRenderer = createLootRenderer({
  getItems: () => runState?.items,
  getChoices: () => runState?.lootChoices,
  isResolving: () => resolvingStage,
  onChooseItem: chooseItem,
});
const leaderboard = createLeaderboardController();
const characterLab = createCharacterLab({
  getStats: () => currentStats,
  setStats: (stats) => {
    currentStats = stats;
    renderCurrency();
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
const multiplayer = createMultiplayerController({
  onStatsUpdated: (account) => {
    currentStats = account.stats;
    applyTotalExp(account.stats.totalExp);
    renderCurrency();
    renderProgression();
  },
});
const screens = createScreenController({
  onQuitDungeon: quitDungeon,
  onOpenLab: renderProgression,
  onOpenLeaderboard: leaderboard.open,
  onOpenMultiplayer: multiplayer.open,
  onOpenDungeons: () => createDungeonCatalog(
    document.querySelector('#dungeon-catalog'),
    dungeons,
    startGame,
    currentStats.level ?? 1,
  ),
  onOpenSettings: () => {
    characterSelect.value = selectedCharacter;
    settingsStatus.textContent = characterSettingsMessage;
  },
});
const auth = createAuthController({
  onAuthenticated: enterGame,
  onBeforeSignOut: async () => {
    multiplayer.close();
    if (runState?.dungeonId) {
      await removeDungeonSession(runState.dungeonId, currentGame?.id);
    }
  },
  onSignedOut: () => {
    currentPlayer = null;
    currentGame = null;
    runState = null;
    game?.cards.destroy(true);
    game?.battlefield.destroy(true);
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
