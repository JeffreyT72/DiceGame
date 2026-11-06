import './styles/main.css';
import { createBlackjackGame } from './game/blackjack-scene.js';
import { characters, defaultCharacter } from './game/characters.js';
import { createInfiniteTowerMode } from './game/infinite-tower.js';
import deepTealPreview from './assets/tables/static/062633.png';
import berryPreview from './assets/tables/static/630632.png';
import { request } from './services/api.js';
import { outcomeMessage, resolveCombatRound } from './game/combat.js';
import { createAuthController } from './ui/auth.js';
import { createCharacterLab } from './ui/character-lab.js';
import { createDungeonCatalog } from './ui/dungeon-catalog.js';
import { createDailyQuestController } from './ui/daily-quests.js';
import { createGameSettings } from './ui/game-settings.js';
import { createLeaderboardController } from './ui/leaderboard.js';
import { createLootRenderer } from './ui/loot.js';
import { createMultiplayerController } from './ui/multiplayer.js';
import { createPaperDollCustomizer } from './ui/paper-doll-customizer.js';
import { createScreenController } from './ui/screens.js';
import { defaultPaperDollTop, getPaperDollTop } from '../../shared/paper-doll.js';
import { chooseItemOptions, getItem, getItemEffects } from '../../shared/items.js';
import {
  dungeons,
  getDungeonMonster,
  getDungeonStageCount,
} from '../../shared/dungeon-config.js';
import { tableThemes } from '../../shared/table-themes.js';
import { getTitle, titles } from '../../shared/titles.js';

const cardActionDelayMs = 200;
const expRequiredForNextLevel = (level) => level * 100;
const infiniteTower = createInfiniteTowerMode({ request });
let game = null;
let multiplayer;
const gameSettings = createGameSettings({
  onFpsLimitChange: () => {
    game?.cards.destroy(true);
    game?.battlefield.destroy(true);
    game = null;
    multiplayer?.refreshFpsLimit();
  },
  onShowHandCountChange: (showHandCount) => {
    game?.cards.scene.getScene('blackjack')?.setShowHandCount(showHandCount);
    multiplayer?.refreshShowHandCount(showHandCount);
  },
});

let currentGame = null;
let currentStats = {
  totalExp: 0,
  strength: 0,
  agility: 0,
  constitution: 0,
  luck: 0,
  currency: 0,
  availableStatPoints: 0,
  character: defaultCharacter,
  top: defaultPaperDollTop,
  title: '0',
  frame: '',
  tableTheme: 'default',
  ownedTableThemes: ['default'],
  ownedTitles: [0],
};
let runState = null;
let resolvingStage = false;
let startingHand = false;
let renderProgression;

const hitButton = document.querySelector('#hit-button');
const standButton = document.querySelector('#stand-button');
const doubleDownButton = document.querySelector('#double-down-button');
const splitButton = document.querySelector('#split-button');
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
const titleList = document.querySelector('#title-list');
const titleStatus = document.querySelector('#title-status');
const lobbyPlayerTitle = document.querySelector('#lobby-player-title');
const dailyQuestsDialog = document.querySelector('#daily-quests-dialog');
document.querySelector('#daily-challenges-button').addEventListener('click', () => {
  dailyQuestsDialog.showModal();
});
document.querySelector('#daily-quests-close').addEventListener('click', () => {
  dailyQuestsDialog.close();
});
const characterSelect = document.querySelector('#character-select');
const characterStatus = document.querySelector('#character-status');
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

let selectedCharacter = defaultCharacter;
characterSelect.value = selectedCharacter;
let selectedTop = defaultPaperDollTop;
let characterSettingsMessage = '';
let tableThemeMessage = '';
let tableThemeAction = null;
let titleMessage = '';
let titleAction = null;
const tableThemePreviews = {
  '062633': deepTealPreview,
  '630632': berryPreview,
};
paperDollCustomizer.render(selectedCharacter, selectedTop);

characterSelect.addEventListener('change', async () => {
  const character = characters.find(({ id }) => id === characterSelect.value);
  if (!character) {
    characterSelect.value = selectedCharacter;
    return;
  }
  characterSelect.disabled = true;
  paperDollCustomizer.topSelect.disabled = true;
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
    paperDollCustomizer.render(selectedCharacter, selectedTop);
  }
  characterStatus.textContent = characterSettingsMessage;
});

paperDollCustomizer.topSelect.addEventListener('change', async () => {
  const top = getPaperDollTop(paperDollCustomizer.topSelect.value);
  if (!top) {
    paperDollCustomizer.render(selectedCharacter, selectedTop);
    return;
  }
  paperDollCustomizer.topSelect.disabled = true;
  characterSelect.disabled = true;
  try {
    const { stats } = await request('/api/player/costume', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ top: top.id }),
    });
    currentStats = stats;
    selectedTop = stats.top;
    game?.battlefield.scene.getScene('blackjack')?.setTop(selectedTop);
    characterSettingsMessage = `${top.name} saved to your account.`;
  } catch (error) {
    console.error(error);
    characterSettingsMessage = `Could not save ${top.name}: ${error.message}`;
  } finally {
    characterSelect.disabled = false;
    paperDollCustomizer.render(selectedCharacter, selectedTop);
  }
  characterStatus.textContent = characterSettingsMessage;
});

function baseMaximumHealth() {
  return 200 + currentStats.constitution * 20;
}

function maximumHealth() {
  const itemEffects = runState && !['failed', 'complete'].includes(runState.phase)
    ? getItemEffects(runState.items)
    : { maxHealth: 0 };
  return Math.round(baseMaximumHealth() + itemEffects.maxHealth);
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

function renderTitles() {
  const ownedTitles = new Set(currentStats.ownedTitles ?? [0]);
  const cards = document.createDocumentFragment();
  for (const title of titles) {
    const card = document.createElement('article');
    card.className = 'table-theme-card';
    const name = document.createElement('h4');
    name.textContent = title.name;
    const action = document.createElement('button');
    action.className = `button ${ownedTitles.has(title.id) ? 'button-secondary' : 'button-primary'}`;
    action.type = 'button';
    const isActive = currentStats.title === String(title.id);
    action.textContent = isActive
      ? 'In use'
      : ownedTitles.has(title.id)
        ? 'Apply'
        : `Purchase · ${title.price} currency`;
    action.disabled = Boolean(titleAction) || isActive;
    action.addEventListener('click', () => {
      void updateTitle(title, ownedTitles.has(title.id) ? 'apply' : 'purchase');
    });
    card.append(name, action);
    cards.append(card);
  }
  titleList.replaceChildren(cards);
  titleStatus.textContent = titleMessage;
}

async function updateTitle(title, action) {
  titleAction = title.id;
  titleMessage = '';
  renderTitles();
  try {
    const result = await request(
      action === 'purchase' ? '/api/player/titles/purchase' : '/api/player/title',
      {
        method: action === 'purchase' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId: title.id }),
      },
    );
    currentStats = result.stats;
    renderCurrency();
    if (action === 'apply') {
      lobbyPlayerTitle.textContent = title.name;
      game?.battlefield.scene.getScene('blackjack')?.setTitle(title.name);
      titleMessage = `${title.name} equipped.`;
    } else {
      titleMessage = `${title.name} purchased. Apply it when you are ready.`;
    }
  } catch (error) {
    console.error(error);
    titleMessage = `Could not ${action === 'purchase' ? 'purchase' : 'apply'} ${title.name}: ${error.message}`;
  } finally {
    titleAction = null;
    renderTitles();
  }
}

function currentMonster() {
  return runState?.mode === 'tower'
    ? infiniteTower.getMonster(runState)
    : runState
      ? getDungeonMonster(runState.dungeon, runState.stage)
      : null;
}

function currentStageCount() {
  return runState?.mode === 'tower'
    ? infiniteTower.getStageCount()
    : runState
      ? getDungeonStageCount(runState.dungeon)
      : getDungeonStageCount(dungeons[0]);
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
  const boss = runState?.mode === 'tower'
    ? infiniteTower.isBoss(runState)
    : Boolean(runState && runState.stage === stageCount);
  game.battlefield.scene.getScene('blackjack')?.renderBattlefield({
    mode: runState?.mode ?? 'dungeon',
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
    `${runState?.mode === 'tower' ? `Tower floor ${runState.stage}` : `Stage ${runState?.stage ?? 1} of ${stageCount}`}${boss ? ', boss' : ''}. Hero health ${Math.round(runState?.playerHp ?? maximumHealth())} of ${maximumHealth()}. ${monster?.name ?? 'Monster'} health ${Math.round(runState?.monsterHp ?? monster?.hp ?? 0)}.`,
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
      const location = failedRun.mode === 'tower' ? `floor ${failedRun.stage}` : `stage ${failedRun.stage}`;
      status.textContent = `You were defeated on ${location}. Could not remove the run: ${error.message}`;
    },
    onStageClearError: (error, failedRun) => {
      console.error(error);
      const location = failedRun.mode === 'tower' ? `floor ${failedRun.stage}` : `stage ${failedRun.stage}`;
      status.textContent = `Could not finish ${location}: ${error.message}. Retry the clear.`;
      renderControls();
    },
  });
  if (game) {
    game.cards.scene.getScene('blackjack')?.renderGame(gameState);
  }
  renderBattlefield();
  renderProgression();
  renderControls();

  if (runState?.phase === 'failed' && runState.mode === 'tower') {
    status.textContent = `Your tower run ended on floor ${runState.stage}.`;
  } else if (runState?.phase === 'failed') {
    status.textContent = `You were defeated in ${runState.dungeon.name} on stage ${runState.stage}. No EXP is awarded; start a new dungeon to try again.`;
  } else if (runState?.phase === 'complete') {
    status.textContent = `Dungeon cleared! You earned ${runState.lastExpAwarded} EXP.`;
  } else if (runState?.phase === 'loot') {
    const floorName = runState.mode === 'tower' ? `Floor ${runState.stage}` : `Stage ${runState.stage}`;
    status.textContent = `${floorName} cleared! You earned ${runState.lastExpAwarded} EXP. Choose one item to continue.`;
  } else if (runState?.phase === 'clearing') {
    status.textContent = `${runState.mode === 'tower' ? 'Floor' : 'Stage'} ${runState.stage} defeated. Resolving the clear…`;
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
  const cardScene = game?.cards.scene.getScene('blackjack');
  if (awaitingWager) cardScene?.clearHand();
  cardScene?.setTableInstruction(awaitingWager
    ? 'PLACE YOUR WAGER'
    : stageComplete
      ? 'CHOOSE AN ITEM TO CONTINUE'
      : '');
  const canDoubleDown = currentGame?.playerHand.length === 2 && !currentGame?.doubledDown;
  const firstCard = currentGame?.playerHand[0];
  const secondCard = currentGame?.playerHand[1];
  const splitStake = runState?.activeWager?.hpStake ?? 0;
  const canSplit = Boolean(
    firstCard
    && secondCard
    && currentGame?.playerHand.length === 2
    && !currentGame?.playerHands
    && firstCard.rank === secondCard.rank
    && splitStake < (runState?.playerHp ?? 0),
  );
  hitButton.disabled = startingHand || !active || !handInProgress;
  standButton.disabled = startingHand || !active || !handInProgress;
  doubleDownButton.disabled = startingHand || !active || !handInProgress
    || !canDoubleDown || Boolean(currentGame?.playerHands);
  splitButton.disabled = startingHand || !active || !handInProgress || !canSplit;
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
    dungeonTimeline.closest('.dungeon-progress-panel').classList.remove('tower-progress-panel');
    battlefield.classList.remove('tower-battlefield');
    document.querySelector('.dungeon-progress-kicker').textContent = 'Expedition path';
    document.querySelector('.dungeon-progress-heading h2').textContent = 'Stage progression';
  } else {
    const tower = runState.mode === 'tower';
    const stageCount = currentStageCount();
    const blockFloor = tower ? infiniteTower.getFloorInBlock(runState.stage) : runState.stage;
    const blockStart = tower ? runState.stage - blockFloor + 1 : 1;
    const currentEncounter = tower ? infiniteTower.getEncounter(runState.stage) : null;
    const isBoss = tower ? currentEncounter.boss : runState.stage === stageCount;
    const label = isBoss ? 'Boss' : 'Mob';
    dungeonProgress.textContent = runState.phase === 'complete'
      ? `${runState.dungeon.name} cleared!`
      : runState.phase === 'failed'
        ? tower
          ? `${runState.dungeon.name} · Run ended on floor ${runState.stage}`
          : `${runState.dungeon.name} · Defeated on stage ${runState.stage} of ${stageCount}`
        : tower
          ? `${runState.dungeon.name} · Floor ${runState.stage} · ${label} · Cycle ${Math.floor((runState.stage - 1) / 10) + 1} · ${runState.items.length} item${runState.items.length === 1 ? '' : 's'} collected`
          : `${runState.dungeon.name} · Stage ${runState.stage} of ${stageCount} · ${label} · ${runState.items.length} item${runState.items.length === 1 ? '' : 's'} collected`;
    document.querySelector('#active-dungeon-name').textContent = runState.dungeon.name;
    dungeonStageCount.textContent = tower
      ? `Floor ${runState.stage} · Cycle ${Math.floor((runState.stage - 1) / 10) + 1}`
      : runState.phase === 'complete'
      ? `${stageCount} / ${stageCount} cleared`
      : runState.phase === 'failed'
        ? `${runState.stage} / ${stageCount} · Defeated`
        : `${runState.stage} / ${stageCount} stages`;
    dungeonTimeline.closest('.dungeon-progress-panel').classList.toggle('tower-progress-panel', tower);
    battlefield.classList.toggle('tower-battlefield', tower);
    document.querySelector('.dungeon-progress-kicker').textContent = tower ? 'Tower climb' : 'Expedition path';
    document.querySelector('.dungeon-progress-heading h2').textContent = tower
      ? 'Floor progression'
      : 'Stage progression';
    dungeonTimeline.hidden = false;
    const stages = document.createDocumentFragment();
    for (let stage = 1; stage <= stageCount; stage += 1) {
      const floor = tower ? blockStart + stage - 1 : stage;
      const monster = tower
        ? infiniteTower.getEncounter(floor)?.monster
        : getDungeonMonster(runState.dungeon, stage);
      const current = tower ? stage === blockFloor : stage === runState.stage;
      const completed = tower ? stage < blockFloor : stage < runState.stage;
      const stageState = runState.phase === 'complete'
        || completed
        || (current && runState.phase === 'loot')
        ? 'completed'
        : current && runState.phase === 'failed'
          ? 'defeated'
          : current && runState.phase === 'clearing'
            ? 'clearing'
            : current
              ? 'current'
              : 'upcoming';
      const entry = document.createElement('li');
      entry.className = `dungeon-stage dungeon-stage-${stageState}${tower ? ' tower-stage' : ''}`;
      const stageMarker = document.createElement('span');
      stageMarker.className = 'dungeon-stage-marker';
      stageMarker.textContent = stageState === 'completed' ? '✓' : String(stage);
      const stageLabel = document.createElement('span');
      stageLabel.className = 'dungeon-stage-label';
      stageLabel.textContent = tower
        ? stage === stageCount ? 'Boss' : `Floor ${stage}`
        : stage === stageCount ? 'Boss' : `Stage ${stage}`;
      const encounter = document.createElement('span');
      encounter.className = 'dungeon-stage-encounter';
      encounter.textContent = monster?.name ?? 'Encounter';
      entry.setAttribute(
        'aria-label',
        tower
          ? `Floor ${floor}: ${monster?.name ?? 'Encounter'}${stage === stageCount ? ', boss' : ''}, ${stageState}`
          : `Stage ${stage} of ${stageCount}: ${monster?.name ?? 'Encounter'}, ${stageState}`,
      );
      if (current && ['current', 'clearing', 'defeated'].includes(stageState)) {
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
    const { game: newGame } = await request('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wagerPercentage: percentage }),
    });
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
    const tower = runState.mode === 'tower';
    const result = tower
      ? await infiniteTower.clearFloor(runState, stage, gameId)
      : await request(`/api/dungeons/${encodeURIComponent(runState.dungeonId)}/clear-stage`, {
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
    const finalStage = !tower && stage === currentStageCount();
    if (finalStage) {
      await removeDungeonSession(runState.dungeonId, currentGame?.id);
    }
    runState.pendingStageClear = null;
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
      const floorName = tower ? `Floor ${stage}` : `Stage ${stage}`;
      status.textContent = `${floorName} cleared! You earned ${result.expAwarded} EXP. Choose one item to continue.`;
    }
  } finally {
    resolvingStage = false;
    renderControls();
  }
}

async function removeDungeonSession(dungeonId, gameId) {
  const endpoint = runState?.mode === 'tower'
    ? infiniteTower.getRunEndpoint(dungeonId)
    : `/api/dungeons/${encodeURIComponent(dungeonId)}`;
  await request(endpoint, {
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
  currentStats = account.stats;
  tableThemeMessage = '';
  titleMessage = '';
  selectedCharacter = characters.some(({ id }) => id === currentStats.character)
    ? currentStats.character
    : defaultCharacter;
  selectedTop = getPaperDollTop(currentStats.top)?.id ?? defaultPaperDollTop;
  characterSelect.value = selectedCharacter;
  paperDollCustomizer.render(selectedCharacter, selectedTop);
  game?.battlefield.scene.getScene('blackjack')?.setTop(selectedTop);
  game?.battlefield.scene.getScene('blackjack')?.setCharacter(selectedCharacter);
  game?.cards.scene.getScene('blackjack')?.setTableTheme(currentStats.tableTheme);
  applyTotalExp(account.stats.totalExp);
  renderCurrency();
  accountName.textContent = currentStats.characterName;
  const activeTitle = getTitle(Number(currentStats.title))?.name ?? '';
  lobbyPlayerTitle.textContent = activeTitle;
  game?.battlefield.scene.getScene('blackjack')?.setTitle(activeTitle);
  screens.show('lobby');
  await dailyQuests.refresh();
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
      gameSettings.getFpsLimit(),
      getTitle(Number(currentStats.title))?.name ?? '',
      'dungeon',
      gameSettings.getShowHandCount(),
      selectedTop,
    );
    game.battlefield.scene.getScene('blackjack')?.setBattleMode('dungeon');
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

  const actionRunState = runState;
  const gameId = currentGame.id;
  hitButton.disabled = true;
  standButton.disabled = true;
  doubleDownButton.disabled = true;
  splitButton.disabled = true;
  newGameButton.disabled = true;
  const splitStake = action === 'split' ? runState.activeWager?.hpStake ?? 0 : 0;
  if (splitStake) {
    actionRunState.playerHp -= splitStake;
    if (runState === actionRunState) renderBattlefield();
  }
  status.textContent = action === 'hit'
    ? 'Dealing a card…'
    : action === 'double_down'
      ? 'Doubling down and dealing one card…'
      : action === 'split'
        ? 'Splitting your hand and placing a second wager…'
        : 'The monster takes its turn…';

  try {
    await new Promise((resolve) => setTimeout(resolve, cardActionDelayMs));
    const { game: updatedGame } = await request(`/api/games/${gameId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    render(updatedGame);
  } catch (error) {
    actionRunState.playerHp += splitStake;
    console.error(error);
    status.textContent = `Could not update the hand: ${error.message}`;
    if (runState === actionRunState) {
      renderBattlefield();
      renderControls();
    }
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
splitButton.addEventListener('click', () => takeAction('split'));
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
multiplayer = createMultiplayerController({
  getFpsLimit: () => gameSettings.getFpsLimit(),
  getShowHandCount: () => gameSettings.getShowHandCount(),
  onStatsUpdated: (account) => {
    currentStats = account.stats;
    applyTotalExp(account.stats.totalExp);
    renderCurrency();
    renderProgression();
  },
});
const screens = createScreenController({
  onQuitDungeon: quitDungeon,
  onShowLobby: () => dailyQuests.refresh(),
  onOpenLab: renderProgression,
  onOpenLeaderboard: leaderboard.open,
  onOpenMultiplayer: multiplayer.open,
  onOpenDungeons: () => createDungeonCatalog(
    document.querySelector('#dungeon-catalog'),
    dungeons,
    startGame,
    currentStats.level ?? 1,
  ),
  onStartTower: () => infiniteTower.start({
    towerButton: document.querySelector('#tower-button'),
    quitButton: document.querySelector('#dungeon-screen [data-back-to-lobby]'),
    showDungeon: () => screens.show('dungeon'),
    ensureGame: () => {
      game ??= createBlackjackGame(
        'game',
        'battlefield-game',
        selectedCharacter,
        currentStats.tableTheme,
        gameSettings.getFpsLimit(),
        getTitle(Number(currentStats.title))?.name ?? '',
        'dungeon',
        gameSettings.getShowHandCount(),
        selectedTop,
      );
    },
    begin: () => infiniteTower.begin({
      level: currentStats.level ?? 1,
      maximumHealth: baseMaximumHealth(),
      setRunState: (nextRunState) => { runState = nextRunState; },
      setBattleMode: () => game?.battlefield.scene.getScene('blackjack')?.setBattleMode('tower'),
      renderBattlefield,
      renderControls,
      setStatus: (message) => { status.textContent = message; },
    }),
  }),
  onOpenCharacter: () => {
    characterSelect.value = selectedCharacter;
    paperDollCustomizer.render(selectedCharacter, selectedTop);
    characterStatus.textContent = characterSettingsMessage;
  },
  onOpenStore: () => {
    renderCurrency();
    renderTableThemes();
    renderTitles();
  },
});
const dailyQuests = createDailyQuestController({
  onCurrencyUpdated: (currency) => {
    currentStats.currency = currency;
    renderCurrency();
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
  const endpoint = runState.mode === 'tower'
    ? infiniteTower.getRunEndpoint(runState.dungeonId)
    : `/api/dungeons/${encodeURIComponent(runState.dungeonId)}`;
  request(endpoint, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: currentGame?.id }),
    keepalive: true,
  }).catch((error) => console.error(error));
});
