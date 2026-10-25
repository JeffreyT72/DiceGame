export function createScreenController({
  onQuitDungeon,
  onOpenLab,
  onOpenLeaderboard,
  onOpenMultiplayer,
  onOpenDungeons,
  onOpenSettings,
}) {
  const screens = {
    lobby: document.querySelector('#lobby-screen'),
    dungeonCatalog: document.querySelector('#dungeon-catalog-screen'),
    dungeon: document.querySelector('#dungeon-screen'),
    multiplayer: document.querySelector('#multiplayer-screen'),
    lab: document.querySelector('#lab-screen'),
    leaderboard: document.querySelector('#leaderboard-screen'),
    settings: document.querySelector('#settings-screen'),
    placeholder: document.querySelector('#placeholder-screen'),
  };
  const gameActions = document.querySelector('#game-actions');

  function show(name) {
    for (const [screenName, panel] of Object.entries(screens)) {
      panel.hidden = screenName !== name;
    }
    gameActions.hidden = name !== 'dungeon';
  }

  document.querySelector('#start-game-button').addEventListener('click', () => {
    show('dungeonCatalog');
    onOpenDungeons();
  });
  document.querySelector('#lab-button').addEventListener('click', () => {
    show('lab');
    onOpenLab();
  });
  document.querySelector('#leaderboard-button').addEventListener('click', () => {
    show('leaderboard');
    onOpenLeaderboard();
  });
  document.querySelector('#multiplayer-button').addEventListener('click', () => {
    show('multiplayer');
    onOpenMultiplayer();
  });
  document.querySelector('#settings-button').addEventListener('click', () => {
    show('settings');
    onOpenSettings();
  });
  document.querySelectorAll('[data-back-to-lobby]').forEach((button) => {
    button.addEventListener('click', () => {
      show('lobby');
      if (screens.dungeon.contains(button)) onQuitDungeon();
    });
  });

  return { show };
}
