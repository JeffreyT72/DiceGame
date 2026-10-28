export function createScreenController({
  onQuitDungeon,
  onOpenLab,
  onOpenLeaderboard,
  onOpenMultiplayer,
  onOpenDungeons,
  onOpenSettings,
  onOpenStore,
}) {
  const screens = {
    lobby: document.querySelector('#lobby-screen'),
    dungeonCatalog: document.querySelector('#dungeon-catalog-screen'),
    dungeon: document.querySelector('#dungeon-screen'),
    multiplayer: document.querySelector('#multiplayer-screen'),
    lab: document.querySelector('#lab-screen'),
    store: document.querySelector('#store-screen'),
    leaderboard: document.querySelector('#leaderboard-screen'),
    settings: document.querySelector('#settings-screen'),
    placeholder: document.querySelector('#placeholder-screen'),
  };
  const gameActions = document.querySelector('#game-actions');
  const storeTabs = [...document.querySelectorAll('.store-tab')];
  const storePanels = [...document.querySelectorAll('.store-panel')];

  function selectStoreTab(selectedTab, focus = false) {
    for (const tab of storeTabs) {
      const selected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of storePanels) {
      panel.hidden = panel.getAttribute('aria-labelledby') !== selectedTab.id;
    }
    if (focus) selectedTab.focus();
  }

  storeTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectStoreTab(tab));
    tab.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % storeTabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + storeTabs.length) % storeTabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = storeTabs.length - 1;
      if (nextIndex !== null) {
        event.preventDefault();
        selectStoreTab(storeTabs[nextIndex], true);
      }
    });
  });

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
  document.querySelector('#store-button').addEventListener('click', () => {
    show('store');
    onOpenStore();
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
