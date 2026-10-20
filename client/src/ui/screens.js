export function createScreenController({ onStartGame, onOpenLab, onOpenLeaderboard }) {
  const screens = {
    lobby: document.querySelector('#lobby-screen'),
    dungeon: document.querySelector('#dungeon-screen'),
    lab: document.querySelector('#lab-screen'),
    leaderboard: document.querySelector('#leaderboard-screen'),
    placeholder: document.querySelector('#placeholder-screen'),
  };
  const gameActions = document.querySelector('#game-actions');
  const placeholderTitle = document.querySelector('#placeholder-title');
  const placeholderDescription = document.querySelector('#placeholder-description');

  function show(name) {
    for (const [screenName, panel] of Object.entries(screens)) {
      panel.hidden = screenName !== name;
    }
    gameActions.hidden = name !== 'dungeon';
  }

  document.querySelector('#start-game-button').addEventListener('click', onStartGame);
  document.querySelector('#lab-button').addEventListener('click', () => {
    show('lab');
    onOpenLab();
  });
  document.querySelector('#leaderboard-button').addEventListener('click', () => {
    show('leaderboard');
    onOpenLeaderboard();
  });
  document.querySelector('#multiplayer-button').addEventListener('click', () => {
    placeholderTitle.textContent = 'Multiplayer';
    placeholderDescription.textContent = 'Multiplayer features are coming soon.';
    show('placeholder');
  });
  document.querySelector('#settings-button').addEventListener('click', () => {
    placeholderTitle.textContent = 'Settings';
    placeholderDescription.textContent = 'Settings are coming soon.';
    show('placeholder');
  });
  document.querySelectorAll('[data-back-to-lobby]').forEach((button) => {
    button.addEventListener('click', () => show('lobby'));
  });

  return { show };
}
