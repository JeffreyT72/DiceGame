export function createScreenController({
  onQuitDungeon,
  onOpenLab,
  onOpenLeaderboard,
  onOpenMultiplayer,
  onOpenDungeons,
  onShowLobby = () => {},
  onShow = () => {},
  onStartTower,
  onOpenCharacter,
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
    character: document.querySelector('#character-screen'),
    settings: document.querySelector('#settings-screen'),
    placeholder: document.querySelector('#placeholder-screen'),
  };
  const gameActions = document.querySelector('#game-actions');

  for (const tablist of document.querySelectorAll('[role="tablist"]')) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const selectTab = (selectedTab, focus = false) => {
      for (const tab of tabs) {
        const selected = tab === selectedTab;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      }
      if (focus) selectedTab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', (event) => {
        let nextIndex = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex !== null) {
          event.preventDefault();
          selectTab(tabs[nextIndex], true);
        }
      });
    });
  }

  function show(name) {
    for (const [screenName, panel] of Object.entries(screens)) {
      panel.hidden = screenName !== name;
    }
    gameActions.hidden = name !== 'dungeon';
    onShow(name);
  }

  document.querySelector('#start-game-button').addEventListener('click', () => {
    show('dungeonCatalog');
    onOpenDungeons();
  });
  document.querySelector('#tower-button').addEventListener('click', onStartTower);
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
  });
  document.querySelector('#character-button').addEventListener('click', () => {
    show('character');
    onOpenCharacter();
  });
  document.querySelectorAll('[data-back-to-lobby]').forEach((button) => {
    button.addEventListener('click', () => {
      show('lobby');
      onShowLobby();
      if (screens.dungeon.contains(button)) onQuitDungeon();
    });
  });

  return { show };
}
