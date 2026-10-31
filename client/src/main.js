import './styles/main.css';
import backgroundMusicUrl from './assets/music/lofi-hip-hop1.mp3';
import { createBlackjackGame } from './game/blackjack-scene.js';
import { characters } from './game/characters.js';
import deepTealPreview from './assets/tables/static/062633.png';
import berryPreview from './assets/tables/static/630632.png';
import { request } from './services/api.js';
import { outcomeMessage, resolveCombatRound } from './game/combat.js';
import { createAuthController } from './ui/auth.js';
import { createCharacterLab } from './ui/character-lab.js';
import { createDungeonCatalog } from './ui/dungeon-catalog.js';
import { createLeaderboardController } from './ui/leaderboard.js';
import { createLootRenderer } from './ui/loot.js';
import { createMultiplayerController } from './ui/multiplayer.js';
import { createPaperDollCustomizer } from './ui/paper-doll-customizer.js';
import { createScreenController } from './ui/screens.js';
import { chooseItemOptions, getItem, getItemEffects } from '../../shared/items.js';
import {
  dungeons,
  getDungeonMonster,
  getDungeonStageCount,
} from '../../shared/dungeon-config.js';
import { tableThemes } from '../../shared/table-themes.js';

const cardActionDelayMs = 200;
const expRequiredForNextLevel = (level) => level * 100;

const backgroundMusic = new Audio(backgroundMusicUrl);
backgroundMusic.loop = true;
backgroundMusic.volume = 0.3;
backgroundMusic.preload = 'auto';

const musicVolume = document.querySelector('#music-volume');
const musicToggle = document.querySelector('#music-toggle');

function syncMusicControls() {
  const isMuted = backgroundMusic.muted || backgroundMusic.volume === 0;
  musicToggle.textContent = isMuted ? 'Unmute' : 'Mute';
  musicToggle.setAttribute('aria-label', isMuted ? 'Unmute background music' : 'Mute background music');
  musicVolume.value = String(isMuted ? 0 : backgroundMusic.volume);
}

function startBackgroundMusic() {
  if (backgroundMusic.paused) {
    const playAttempt = backgroundMusic.play();
    if (playAttempt) {
      playAttempt.catch(() => {
        backgroundMusic.muted = true;
        syncMusicControls();
      });
    }
  }
}

musicVolume.addEventListener('input', (event) => {
  const nextVolume = Number(event.target.value) || 0;
  backgroundMusic.volume = nextVolume;
  backgroundMusic.muted = nextVolume === 0;
  syncMusicControls();

  if (nextVolume > 0) {
    startBackgroundMusic();
  }
});

musicToggle.addEventListener('click', () => {
  if (backgroundMusic.muted || backgroundMusic.volume === 0) {
    backgroundMusic.muted = false;
    backgroundMusic.volume = Number(musicVolume.value) || 0.3;
    startBackgroundMusic();
  } else {
    backgroundMusic.muted = true;
  }
  syncMusicControls();
});

document.addEventListener('pointerdown', startBackgroundMusic, { once: true });
document.addEventListener('keydown', startBackgroundMusic, { once: true });

startBackgroundMusic();
syncMusicControls();

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
  character: characters[0].id,
  title: '',
  frame: '',
  tableTheme: 'default',
  ownedTableThemes: ['default'],
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
const dungeonStageCount = document.querySelector('#dungeon-stage-count');
const dungeonTimeline = document.querySelector('#dungeon-timeline');
const battlefield = document.querySelector('#battlefield');
const lootPanel = document.querySelector('#loot-panel');
const accountName = document.querySelector('#account-name');
const lobbyCurrency = document.querySelector('#lobby-currency');
const storeCurrency = document.querySelector('#store-currency');
const tableThemeList = document.querySelector('#table-theme-list');
const tableThemeStatus = document.querySelector('#table-theme-status');
const characterSelect = document.querySelector('#character-select');
const settingsStatus = document.querySelector('#settings-status');
characterSelect.replaceChildren(...characters.map(({ id, name }) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = name;
  return option;
}));
const paperDollCustomizer = createPaperDollCustomizer({
  canvas: document.querySelector('#paper-doll-preview'),
  slotsElement: document.querySelector('#paper-doll-slots'),
  statusElement: document.querySelector('#paper-doll-preview-status'),
});

let selectedCharacter = characters[0].id;
let characterSettingsMessage = '';
let tableThemeMessage = '';
let tableThemeAction = null;
const tableThemePreviews = {
  '062633': deepTealPreview,
  '630632': berryPreview,
};
paperDollCustomizer.render(selectedCharacter);

characterSelect.addEventListener('change', async () => {
  const character = characters.find(({ id }) => id === characterSelect.value);
  if (!character) {
    characterSelect.value = selectedCharacter;
    return;
  }
  characterSelect.disabled = true;
  try {
    const { stats } = await request('/api/player/costume', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: character.id }),
    });
    currentStats = stats;
    selectedCharacter = stats.character;
    game?.battlefield.scene.getScene('blackjack')?.setCharacter(selectedCharacter);
    characterSettingsMessage = `${character.name} saved to your account.`;
  } catch (error) {
    console.error(error);
    characterSelect.value = selectedCharacter;
    characterSettingsMessage = `Could not save ${character.name}: ${error.message}`;
  } finally {
    characterSelect.disabled = false;
    paperDollCustomizer.render(selectedCharacter);
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
  const formattedCurrency = new Intl.NumberFormat().format(currentStats.currency);
  lobbyCurrency.textContent = formattedCurrency;
  storeCurrency.textContent = formattedCurrency;
}

function renderTableThemes() {
  const ownedThemes = new Set(currentStats.ownedTableThemes ?? ['default']);
  const cards = document.createDocumentFragment();
  for (const theme of tableThemes) {
    const card = document.createElement('article');
    card.className = 'table-theme-card';
    const previewSource = tableThemePreviews[theme.id];
    const preview = document.createElement(previewSource ? 'img' : 'div');
    preview.className = 'table-theme-preview';
    if (previewSource) {
      preview.src = previewSource;
      preview.alt = `${theme.name} table preview`;
    } else {
      preview.setAttribute('role', 'img');
      preview.setAttribute('aria-label', `${theme.name} table preview`);
      preview.style.backgroundColor = `#${theme.color}`;
    }

    const title = document.createElement('h4');
    title.textContent = theme.name;
    const action = document.createElement('button');
    action.className = `button ${ownedThemes.has(theme.id) ? 'button-secondary' : 'button-primary'}`;
    action.type = 'button';
    const isActive = currentStats.tableTheme === theme.id;
    action.textContent = isActive
      ? 'In use'
      : ownedThemes.has(theme.id)
        ? 'Apply'
        : `Purchase · ${theme.price} currency`;
    action.disabled = Boolean(tableThemeAction) || isActive;
    action.addEventListener('click', () => {
      void updateTableTheme(theme, ownedThemes.has(theme.id) ? 'apply' : 'purchase');
    });
    card.append(preview, title, action);
    cards.append(card);
  }
  tableThemeList.replaceChildren(cards);
  tableThemeStatus.textContent = tableThemeMessage;
}

async function updateTableTheme(theme, action) {
  tableThemeAction = theme.id;
  tableThemeMessage = '';
  renderTableThemes();
  try {
    const result = await request(
      action === 'purchase' ? '/api/player/tables/purchase' : '/api/player/table-theme',
      {
        method: action === 'purchase' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'purchase'
          ? { tableId: theme.id }
          : { tableTheme: theme.id }),
      },
    );
    currentStats = result.stats;
    renderCurrency();
    if (action === 'apply') {
      game?.cards.scene.getScene('blackjack')?.setTableTheme(theme.id);
      tableThemeMessage = `${theme.name} applied to your card table.`;
    } else {
      tableThemeMessage = `${theme.name} purchased. Apply it when you are ready.`;
    }
  } catch (error) {
    console.error(error);
    tableThemeMessage = `Could not ${action === 'purchase' ? 'purchase' : 'apply'} ${theme.name}: ${error.message}`;
  } finally {
    tableThemeAction = null;
    renderTableThemes();
  }
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
    dungeonStageCount.textContent = 'No active run';
    dungeonTimeline.hidden = true;
    dungeonTimeline.replaceChildren();
  } else {
    const stageCount = currentStageCount();
    const label = runState.stage === stageCount ? 'Boss' : 'Mob';
    dungeonProgress.textContent = runState.phase === 'complete'
      ? `${runState.dungeon.name} cleared!`
      : runState.phase === 'failed'
        ? `${runState.dungeon.name} · Defeated on stage ${runState.stage} of ${stageCount}`
        : `${runState.dungeon.name} · Stage ${runState.stage} of ${stageCount} · ${label} · ${runState.items.length} item${runState.items.length === 1 ? '' : 's'} collected`;
    document.querySelector('#active-dungeon-name').textContent = runState.dungeon.name;
    dungeonStageCount.textContent = runState.phase === 'complete'
      ? `${stageCount} / ${stageCount} cleared`
      : runState.phase === 'failed'
        ? `${runState.stage} / ${stageCount} · Defeated`
        : `${runState.stage} / ${stageCount} stages`;
    dungeonTimeline.hidden = false;
    const stages = document.createDocumentFragment();
    for (let stage = 1; stage <= stageCount; stage += 1) {
      const monster = getDungeonMonster(runState.dungeon, stage);
      const stageState = runState.phase === 'complete'
        || stage < runState.stage
        || (stage === runState.stage && runState.phase === 'loot')
        ? 'completed'
        : stage === runState.stage && runState.phase === 'failed'
          ? 'defeated'
          : stage === runState.stage && runState.phase === 'clearing'
            ? 'clearing'
            : stage === runState.stage
              ? 'current'
              : 'upcoming';
      const entry = document.createElement('li');
      entry.className = `dungeon-stage dungeon-stage-${stageState}`;
      const stageMarker = document.createElement('span');
      stageMarker.className = 'dungeon-stage-marker';
      stageMarker.textContent = stageState === 'completed' ? '✓' : String(stage);
      const stageLabel = document.createElement('span');
      stageLabel.className = 'dungeon-stage-label';
      stageLabel.textContent = stage === stageCount ? 'Boss' : `Stage ${stage}`;
      const encounter = document.createElement('span');
      encounter.className = 'dungeon-stage-encounter';
      encounter.textContent = monster?.name ?? 'Encounter';
      entry.setAttribute(
        'aria-label',
        `Stage ${stage} of ${stageCount}: ${monster?.name ?? 'Encounter'}, ${stageState}`,
      );
      if (stageState === 'current' || stageState === 'clearing' || stageState === 'defeated') {
        entry.setAttribute('aria-current', 'step');
      }
      entry.append(stageMarker, stageLabel, encounter);
      stages.append(entry);
    }
    dungeonTimeline.replaceChildren(stages);
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
  tableThemeMessage = '';
  selectedCharacter = characters.some(({ id }) => id === currentStats.character)
    ? currentStats.character
    : characters[0].id;
  characterSelect.value = selectedCharacter;
  paperDollCustomizer.render(selectedCharacter);
  game?.battlefield.scene.getScene('blackjack')?.setCharacter(selectedCharacter);
  game?.cards.scene.getScene('blackjack')?.setTableTheme(currentStats.tableTheme);
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
    game ??= createBlackjackGame(
      'game',
      'battlefield-game',
      selectedCharacter,
      currentStats.tableTheme,
    );
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
    paperDollCustomizer.render(selectedCharacter);
    settingsStatus.textContent = characterSettingsMessage;
  },
  onOpenStore: () => {
    renderCurrency();
    renderTableThemes();
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
