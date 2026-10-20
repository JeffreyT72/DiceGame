import './style.css';
import { createBlackjackGame } from './blackjack-scene.js';
import { request } from './services/api.js';
import { createAuthController } from './ui/auth.js';
import { createCharacterLab } from './ui/character-lab.js';
import { createScreenController } from './ui/screens.js';
import { chooseItemOptions, getItem, getItemEffects } from './items.js';
import { dungeonStageCount } from '../../shared/dungeon-config.js';

const stageCount = dungeonStageCount;
const mobHealth = 20;
const bossHealth = 100;
const dungeonExpReward = 1000;
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
let runStorageKey = '';
let gameStorageKey = '';
let resolvingStage = false;
let startingHand = false;
let dungeonLoadPromise = null;
let renderProgression;

const hitButton = document.querySelector('#hit-button');
const standButton = document.querySelector('#stand-button');
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

function initialRunState(dungeon) {
  return {
    dungeonId: dungeon.id,
    suggestedLevel: dungeon.suggestedLevel,
    stage: 1,
    playerHp: baseMaximumHealth(),
    monsterHp: mobHealth,
    lastResolvedGameId: null,
    lastRoundMessage: '',
    phase: 'active',
    pendingStageClear: null,
    items: [],
  };
}

function saveRunState() {
  if (runStorageKey && runState) {
    localStorage.setItem(runStorageKey, JSON.stringify(runState));
  }
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

function maximumMonsterHealth(stage) {
  return stage === stageCount ? bossHealth : mobHealth;
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
    const baseDamage = gameState.playerScore + currentStats.strength + itemEffects.attack;
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
    runState.lastRoundMessage = healing > 0
      ? `${hitMessage} The necklace restores ${healing} HP.`
      : hitMessage;
    if (runState.monsterHp === 0) {
      runState.phase = 'clearing';
      runState.pendingStageClear = { stage: runState.stage, gameId: gameState.id };
    }
  } else if (losingOutcomes.includes(gameState.outcome)) {
    const itemEffects = getItemEffects(runState.items);
    const baseDamage = gameState.dealerScore;
    const damage = Math.floor(baseDamage * (1 - itemEffects.damageReduction));
    const dodgeChance = Math.min(100, currentStats.agility * 5 + itemEffects.dodgeChance * 100);
    if (Math.random() * 100 < dodgeChance) {
      runState.lastRoundMessage = `You dodge the monster's ${damage}-damage attack.`;
    } else {
      runState.playerHp = Math.max(0, runState.playerHp - damage);
      runState.lastRoundMessage = `The monster deals ${damage} damage to you.`;
    }
    if (runState.playerHp === 0) {
      runState.phase = 'failed';
      runState.items = [];
    }
  } else {
    runState.lastRoundMessage = 'No damage dealt.';
  }

  runState.lastResolvedGameId = gameState.id;
  saveRunState();
  if (runState.pendingStageClear) {
    syncStageClear().catch((error) => {
      console.error(error);
      status.textContent = `Could not save stage ${runState.stage}: ${error.message}. Retry the stage clear.`;
      renderControls();
    });
  }
}

function render(gameState) {
  currentGame = gameState;
  resolveCombatRound(gameState);
  const boss = runState?.stage === stageCount;
  if (game) {
    game.scene.getScene('blackjack').renderGame(gameState, {
      playerHp: runState?.playerHp ?? maximumHealth(),
      playerMaxHp: maximumHealth(),
      monsterHp: runState?.monsterHp ?? mobHealth,
      monsterMaxHp: runState ? maximumMonsterHealth(runState.stage) : mobHealth,
      stage: runState?.stage ?? 1,
      stageCount,
      boss,
    });
  }
  renderProgression();
  renderControls();
  table.setAttribute(
    'aria-label',
    `Stage ${runState?.stage ?? 1} of ${stageCount}${boss ? ', boss' : ''}. Hero health ${runState?.playerHp ?? maximumHealth()} of ${maximumHealth()}. Monster health ${runState?.monsterHp ?? mobHealth}.`,
  );

  if (runState?.phase === 'failed') {
    status.textContent = `You were defeated on stage ${runState.stage}. No EXP is awarded; start a new dungeon to try again.`;
  } else if (runState?.phase === 'complete') {
    status.textContent = `Dungeon cleared! You earned ${dungeonExpReward} EXP.`;
  } else if (runState?.phase === 'loot') {
    status.textContent = `Stage ${runState.stage} cleared. Choose one item to continue.`;
  } else if (runState?.phase === 'clearing') {
    status.textContent = `Stage ${runState.stage} defeated. Saving your progress…`;
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
  hitButton.disabled = startingHand || !active || !handInProgress;
  standButton.disabled = startingHand || !active || !handInProgress;
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
    dungeonProgress.textContent = 'Your next run is ready when you are.';
  } else {
    const label = runState.stage === stageCount ? 'Boss' : 'Mob';
    dungeonProgress.textContent = runState.phase === 'complete'
      ? 'Dungeon cleared!'
      : runState.phase === 'failed'
        ? `Run ended · Defeated on stage ${runState.stage} of ${stageCount}`
        : `Stage ${runState.stage} of ${stageCount} · ${label} · ${runState.items.length} item${runState.items.length === 1 ? '' : 's'} collected`;
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
  if (gameStorageKey) {
    localStorage.removeItem(gameStorageKey);
  }
  game?.scene.getScene('blackjack').clearHand();
}

async function startHand() {
  if (startingHand) {
    return;
  }
  startingHand = true;
  clearCurrentHand();
  renderControls();
  try {
    const { game: newGame } = await request('/api/games', { method: 'POST' });
    localStorage.setItem(gameStorageKey, newGame.id);
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
    runState.pendingStageClear = null;
    runState.phase = stage === stageCount ? 'complete' : 'loot';
    runState.lootChoices = stage === stageCount ? [] : chooseItemOptions();
    if (stage === stageCount) {
      runState.items = [];
      runState.playerHp = Math.min(runState.playerHp, baseMaximumHealth());
    }
    saveRunState();
    renderProgression();
    if (stage === stageCount) {
      status.textContent = `Dungeon cleared! You earned ${dungeonExpReward} EXP.`;
    } else {
      status.textContent = `Stage ${stage} cleared. Choose one item to continue.`;
    }
  } finally {
    resolvingStage = false;
    renderControls();
  }
}

async function beginDungeon() {
  clearCurrentHand();
  renderControls();
  try {
    const { dungeon } = await request('/api/dungeons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestedLevel: suggestedCharacterLevel() }),
    });
    runState = initialRunState(dungeon);
    saveRunState();
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
  runState.monsterHp = maximumMonsterHealth(runState.stage);
  runState.phase = 'active';
  runState.lastRoundMessage = '';
  saveRunState();
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

async function loadDungeon() {
  const storedRun = localStorage.getItem(runStorageKey);
  if (!storedRun) {
    runState = null;
    currentGame = null;
    renderControls();
    status.textContent = 'Your next run is ready when you are.';
    return;
  }

  const parsed = JSON.parse(storedRun);
  const savedMaxHealth = baseMaximumHealth()
    + getItemEffects(Array.isArray(parsed.items) ? parsed.items : []).maxHealth;
  if (
    typeof parsed.dungeonId !== 'string'
    || !Number.isInteger(parsed.stage)
    || parsed.stage < 1
    || parsed.stage > stageCount
    || !Number.isInteger(parsed.playerHp)
    || parsed.playerHp < 0
    || parsed.playerHp > savedMaxHealth
    || !Number.isInteger(parsed.monsterHp)
    || parsed.monsterHp < 0
    || parsed.monsterHp > bossHealth
    || !['active', 'clearing', 'loot', 'failed', 'complete'].includes(parsed.phase)
    || !Array.isArray(parsed.items)
  ) {
    throw new Error('Saved dungeon progress is invalid. Clear this site’s local storage to start fresh.');
  }
  runState = parsed;
  let dungeon;
  try {
    ({ dungeon } = await request(`/api/dungeons/${encodeURIComponent(runState.dungeonId)}`));
  } catch (error) {
    if (error.status !== 404) throw error;
    localStorage.removeItem(runStorageKey);
    localStorage.removeItem(gameStorageKey);
    runState = null;
    currentGame = null;
    renderProgression();
    renderControls();
    status.textContent = 'Your saved dungeon could not be found. Start a new dungeon to continue.';
    return;
  }
  if (dungeon.completed) {
    runState.phase = 'complete';
    runState.items = [];
    runState.lootChoices = [];
    runState.playerHp = Math.min(runState.playerHp, baseMaximumHealth());
    runState.stage = stageCount;
    runState.pendingStageClear = null;
  }
  runState.suggestedLevel = dungeon.suggestedLevel;
  saveRunState();
  renderControls();

  const savedGameId = localStorage.getItem(gameStorageKey);
  if (savedGameId) {
    try {
      const { game: savedGame } = await request(`/api/games/${encodeURIComponent(savedGameId)}`);
      render(savedGame);
    } catch (error) {
      if (error.status !== 404) throw error;
      if (runState.phase === 'active') {
        await startHand();
      } else {
        renderControls();
      }
    }
  } else if (runState.phase === 'active') {
    await startHand();
  } else {
    renderControls();
  }

  if (runState.pendingStageClear) {
    await syncStageClear();
  }
}

async function enterGame(account) {
  currentPlayer = account.user;
  currentStats = account.stats;
  applyTotalExp(account.stats.totalExp);
  accountName.textContent = currentPlayer.username;
  runStorageKey = `dungeon-run-state-${currentPlayer.id}`;
  gameStorageKey = `dungeon-game-id-${currentPlayer.id}`;
  screens.show('lobby');
  renderProgression();
  dungeonLoadPromise = loadDungeon();
  try {
    await dungeonLoadPromise;
  } catch (error) {
    console.error(error);
    status.textContent = `Could not load your dungeon: ${error.message}`;
  } finally {
    dungeonLoadPromise = null;
  }
}

async function startGame() {
  const startGameButton = document.querySelector('#start-game-button');
  startGameButton.disabled = true;
  try {
    await dungeonLoadPromise;
    screens.show('dungeon');
    game ??= createBlackjackGame('game');
    if (!runState || ['failed', 'complete'].includes(runState.phase)) {
      await beginDungeon();
    } else if (currentGame) {
      render(currentGame);
    } else if (runState.phase === 'active' && !currentGame) {
      await startHand();
    }
  } finally {
    startGameButton.disabled = false;
  }
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
  newGameButton.disabled = true;
  status.textContent = action === 'hit' ? 'Dealing a card…' : 'The monster takes its turn…';

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
      status.textContent = `Could not save stage ${runState.stage}: ${error.message}. Retry the stage clear.`;
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
  saveRunState,
  renderGame: () => {
    if (currentGame) render(currentGame);
  },
  setStatus: (message) => {
    status.textContent = message;
  },
});
renderProgression = characterLab.renderProgression;
const screens = createScreenController({
  onStartGame: startGame,
  onOpenLab: renderProgression,
  onOpenLeaderboard: openLeaderboard,
});
const auth = createAuthController({
  onAuthenticated: enterGame,
  onSignedOut: () => {
    currentPlayer = null;
    currentGame = null;
    runState = null;
    game?.destroy(true);
    game = null;
    runStorageKey = '';
    gameStorageKey = '';
  },
  onSignOutError: (error) => {
    status.textContent = `Could not sign out: ${error.message}`;
  },
});

auth.checkSession();
