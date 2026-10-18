import './style.css';
import { createBlackjackGame } from './blackjack-scene.js';

let game = null;
const hitButton = document.querySelector('#hit-button');
const standButton = document.querySelector('#stand-button');
const newGameButton = document.querySelector('#new-game-button');
const status = document.querySelector('#status');
const table = document.querySelector('#table');
const authPanel = document.querySelector('#auth-panel');
const authForm = document.querySelector('#auth-form');
const authTitle = document.querySelector('#auth-title');
const authSubmit = document.querySelector('#auth-submit');
const authSwitch = document.querySelector('#auth-switch');
const authError = document.querySelector('#auth-error');
const loginFields = document.querySelector('#login-fields');
const signupFields = document.querySelector('#signup-fields');
const authIdentifier = document.querySelector('#auth-identifier');
const authUsername = document.querySelector('#auth-username');
const authEmail = document.querySelector('#auth-email');
const authPassword = document.querySelector('#auth-password');
const gamePanel = document.querySelector('#game-panel');
const accountName = document.querySelector('#account-name');
const signoutButton = document.querySelector('#signout-button');

const initialCombatState = () => ({
  playerHp: 100,
  monsterHp: 100,
  playerLevel: 1,
  playerExp: 0,
  lastResolvedGameId: null,
  lastRoundMessage: '',
  pendingExpAwards: [],
});
const monsterDefeatExp = 50;
const expRequiredForNextLevel = (level) => level * 100;
let currentGame = null;
let combatState = initialCombatState();
let currentPlayer = null;
let authMode = 'login';
let combatStorageKey = '';
let gameStorageKey = '';
const playerLevel = document.querySelector('#player-level');
const playerExp = document.querySelector('#player-exp');
const experienceBar = document.querySelector('#experience-bar');
const experienceFill = document.querySelector('#experience-fill');

function applyTotalExp(totalExp) {
  combatState.playerLevel = 1;
  combatState.playerExp = totalExp;
  while (combatState.playerExp >= expRequiredForNextLevel(combatState.playerLevel)) {
    combatState.playerExp -= expRequiredForNextLevel(combatState.playerLevel);
    combatState.playerLevel += 1;
  }
}

function getTotalExp() {
  const levelsCompleted = combatState.playerLevel - 1;
  return levelsCompleted * (levelsCompleted + 1) / 2 * 100 + combatState.playerExp;
}

function loadCombatState(totalExp) {
  const savedState = localStorage.getItem(combatStorageKey);
  if (!savedState) {
    combatState = initialCombatState();
  } else {
    const parsedState = JSON.parse(savedState);
    if (
      !Number.isInteger(parsedState.playerHp)
      || parsedState.playerHp < 0
      || parsedState.playerHp > 100
      || !Number.isInteger(parsedState.monsterHp)
      || parsedState.monsterHp < 0
      || parsedState.monsterHp > 100
      || (parsedState.lastResolvedGameId !== null && typeof parsedState.lastResolvedGameId !== 'string')
      || typeof parsedState.lastRoundMessage !== 'string'
      || (parsedState.pendingExpAwards !== undefined
        && (!Array.isArray(parsedState.pendingExpAwards)
          || parsedState.pendingExpAwards.some((gameId) => typeof gameId !== 'string')))
    ) {
      throw new Error('Saved combat health is invalid. Clear this site’s local storage to start fresh.');
    }

    combatState = {
      ...initialCombatState(),
      ...parsedState,
      pendingExpAwards: parsedState.pendingExpAwards ?? [],
    };
  }
  applyTotalExp(totalExp);
}

function saveCombatState() {
  if (combatStorageKey) {
    const { playerLevel: _playerLevel, playerExp: _playerExp, ...savedState } = combatState;
    localStorage.setItem(combatStorageKey, JSON.stringify(savedState));
  }
}

function resolveCombatRound(gameState) {
  if (gameState.status !== 'complete' || gameState.id === combatState.lastResolvedGameId) {
    return null;
  }

  let earnedExp = false;
  if (['player_blackjack', 'player_win', 'dealer_bust'].includes(gameState.outcome)) {
    const damage = gameState.playerScore;
    const monsterWasAlive = combatState.monsterHp > 0;
    combatState.monsterHp = Math.max(0, combatState.monsterHp - damage);
    combatState.lastRoundMessage = `You deal ${damage} damage to the monster.`;
    if (monsterWasAlive && combatState.monsterHp === 0) {
      combatState.playerExp += monsterDefeatExp;
      earnedExp = true;
      combatState.lastRoundMessage += ` Monster defeated! You gain ${monsterDefeatExp} EXP.`;

      let leveledUp = false;
      while (combatState.playerExp >= expRequiredForNextLevel(combatState.playerLevel)) {
        combatState.playerExp -= expRequiredForNextLevel(combatState.playerLevel);
        combatState.playerLevel += 1;
        leveledUp = true;
      }
      if (leveledUp) {
        combatState.lastRoundMessage += ` Level up! You are now level ${combatState.playerLevel}.`;
      }
    }
  } else if (['dealer_blackjack', 'player_bust', 'dealer_win'].includes(gameState.outcome)) {
    const damage = gameState.dealerScore;
    combatState.playerHp = Math.max(0, combatState.playerHp - damage);
    combatState.lastRoundMessage = `The dealer deals ${damage} damage to you.`;
  } else {
    combatState.lastRoundMessage = 'No damage dealt.';
  }

  combatState.lastResolvedGameId = gameState.id;
  if (earnedExp) {
    combatState.pendingExpAwards.push(gameState.id);
  }
  saveCombatState();
  return earnedExp ? gameState.id : null;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function outcomeMessage(outcome) {
  const messages = {
    player_blackjack: 'Blackjack! You win.',
    dealer_blackjack: 'Dealer has blackjack. You lose.',
    player_bust: 'Bust! You went over 21.',
    dealer_bust: 'Dealer busts. You win!',
    player_win: 'You win!',
    dealer_win: 'Dealer wins.',
    push: 'Push. It’s a tie.',
  };
  return messages[outcome] ?? 'Your hand is in play.';
}

function render(gameState) {
  currentGame = gameState;
  const earnedExpGameId = resolveCombatRound(gameState);
  if (earnedExpGameId) {
    syncProgression(earnedExpGameId).catch((error) => {
      console.error(error);
      status.textContent = `Could not save your experience: ${error.message}`;
    });
  }
  game.scene.getScene('blackjack').renderGame(gameState, combatState);
  renderProgression();
  table.setAttribute(
    'aria-label',
    `Hero health ${combatState.playerHp} of 100. Monster health ${combatState.monsterHp} of 100. Dealer hand, ${gameState.dealerHand.length} cards. Your hand, ${gameState.playerHand.length} cards, score ${gameState.playerScore}.`,
  );
  const battleOver = combatState.playerHp === 0 || combatState.monsterHp === 0;
  hitButton.disabled = gameState.status !== 'playing' || battleOver;
  standButton.disabled = gameState.status !== 'playing' || battleOver;
  const roundMessage = gameState.status === 'complete'
    && gameState.id === combatState.lastResolvedGameId
    ? combatState.lastRoundMessage
    : '';
  const defeatMessage = combatState.playerHp === 0
    ? ' Your hero has fallen. Start a new game to begin a fresh battle.'
    : combatState.monsterHp === 0
      ? ' The monster is defeated! Start a new game to begin a fresh battle.'
      : '';
  status.textContent = [outcomeMessage(gameState.outcome), roundMessage].filter(Boolean).join(' ')
    + defeatMessage;
}

async function startGame() {
  const { game: newGame } = await request('/api/games', { method: 'POST' });
  localStorage.setItem(gameStorageKey, newGame.id);
  render(newGame);
}

async function loadGame() {
  const { stats } = await request('/api/player/stats');
  loadCombatState(stats.totalExp);
  const savedId = localStorage.getItem(gameStorageKey);
  if (!savedId) {
    await startGame();
  } else {
    try {
      const { game: savedGame } = await request(`/api/games/${encodeURIComponent(savedId)}`);
      render(savedGame);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
      await startGame();
    }
  }

  try {
    await syncPendingExpAwards();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not save your experience: ${error.message}`;
  }
}

async function syncProgression(gameId) {
  const { stats } = await request('/api/player/progression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId }),
  });
  applyTotalExp(Math.max(getTotalExp(), stats.totalExp));
  combatState.pendingExpAwards = combatState.pendingExpAwards.filter((pendingGameId) => pendingGameId !== gameId);
  saveCombatState();
  renderProgression();
}

async function syncPendingExpAwards() {
  for (const gameId of combatState.pendingExpAwards) {
    await syncProgression(gameId);
  }
}

function renderProgression() {
  const expRequired = expRequiredForNextLevel(combatState.playerLevel);
  playerLevel.textContent = `Level ${combatState.playerLevel}`;
  playerExp.textContent = `${combatState.playerExp} / ${expRequired} EXP`;
  experienceBar.setAttribute('aria-valuemax', String(expRequired));
  experienceBar.setAttribute('aria-valuenow', String(combatState.playerExp));
  experienceBar.setAttribute(
    'aria-valuetext',
    `${combatState.playerExp} of ${expRequired} experience toward level ${combatState.playerLevel + 1}`,
  );
  experienceFill.style.width = `${combatState.playerExp / expRequired * 100}%`;
}

function showAuth(mode = 'login') {
  authMode = mode;
  const signingUp = mode === 'signup';
  authTitle.textContent = signingUp ? 'Create your account' : 'Sign in to play';
  authSubmit.textContent = signingUp ? 'Create account' : 'Sign in';
  authSwitch.textContent = signingUp ? 'Already have an account? Sign in' : 'Need an account? Sign up';
  loginFields.hidden = signingUp;
  signupFields.hidden = !signingUp;
  authIdentifier.required = !signingUp;
  authUsername.required = signingUp;
  authEmail.required = signingUp;
  authPassword.autocomplete = signingUp ? 'new-password' : 'current-password';
  authError.textContent = '';
  authPanel.hidden = false;
  gamePanel.hidden = true;
}

async function enterGame(account) {
  currentPlayer = account.user;
  accountName.textContent = currentPlayer.username;
  combatStorageKey = `blackjack-combat-state-${currentPlayer.id}`;
  gameStorageKey = `blackjack-game-id-${currentPlayer.id}`;
  authPanel.hidden = true;
  gamePanel.hidden = false;
  game ??= createBlackjackGame('game');
  await loadGame();
}

async function takeAction(action) {
  if (!currentGame || currentGame.status !== 'playing') {
    return;
  }

  hitButton.disabled = true;
  standButton.disabled = true;
  status.textContent = action === 'hit' ? 'Dealing a card…' : 'Dealer’s turn…';

  try {
    const { game: updatedGame } = await request(`/api/games/${currentGame.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    render(updatedGame);
  } catch (error) {
    console.error(error);
    status.textContent = `Could not update the hand: ${error.message}`;
    hitButton.disabled = false;
    standButton.disabled = false;
  }
}

hitButton.addEventListener('click', () => takeAction('hit'));
standButton.addEventListener('click', () => takeAction('stand'));
newGameButton.addEventListener('click', async () => {
  newGameButton.disabled = true;
  try {
    if (combatState.playerHp === 0 || combatState.monsterHp === 0) {
      combatState = {
        ...combatState,
        playerHp: 100,
        monsterHp: 100,
        lastResolvedGameId: null,
        lastRoundMessage: '',
      };
      saveCombatState();
    }
    await startGame();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not start a new game: ${error.message}`;
  } finally {
    newGameButton.disabled = false;
  }
});

authSwitch.addEventListener('click', () => {
  showAuth(authMode === 'login' ? 'signup' : 'login');
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authError.textContent = '';
  try {
    const path = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const credentials = authMode === 'signup'
      ? { username: authUsername.value, email: authEmail.value, password: authPassword.value }
      : { identifier: authIdentifier.value, password: authPassword.value };
    const account = await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    authForm.reset();
    await enterGame(account);
  } catch (error) {
    console.error(error);
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

signoutButton.addEventListener('click', async () => {
  signoutButton.disabled = true;
  try {
    await request('/api/auth/logout', { method: 'POST' });
    currentPlayer = null;
    currentGame = null;
    game?.destroy(true);
    game = null;
    showAuth('login');
  } catch (error) {
    console.error(error);
    status.textContent = `Could not sign out: ${error.message}`;
  } finally {
    signoutButton.disabled = false;
  }
});

request('/api/auth/me').then(enterGame).catch((error) => {
  if (error.status === 401) {
    showAuth();
    return;
  }
  console.error(error);
  authError.textContent = `Could not check your session: ${error.message}`;
});
