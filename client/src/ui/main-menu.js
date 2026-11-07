import { createMainMenuGame } from '../game/main-menu-scene.js';

export function createMainMenuController({ getFpsLimit }) {
  const lobby = document.querySelector('#lobby-screen');
  const parent = document.querySelector('#menu-game');
  const nav = document.querySelector('#lobby-menu');
  const buttons = [...nav.querySelectorAll('[data-menu]')];
  const lobbyLevel = document.querySelector('#lobby-level');
  let menuGame = null;

  const readHud = () => ({
    name: document.querySelector('#account-name').textContent,
    level: lobbyLevel.textContent.replace('Level ', ''),
    xp: Number(lobbyLevel.dataset.xp ?? 0),
    gold: document.querySelector('#lobby-currency').textContent,
    title: document.querySelector('#lobby-player-title').textContent,
    alerts: buttons.filter((button) => button.hasAttribute('data-alert')).map((button) => button.dataset.menu),
  });

  // The hidden lobby markup is the source of truth; mirror its text, XP and alert dots onto the canvas.
  new MutationObserver(() => menuGame?.registry.set('hud', readHud())).observe(lobby, {
    subtree: true,
    childList: true,
    attributeFilter: ['data-xp', 'data-alert'],
  });

  // Keyboard and screen readers use the real buttons; the canvas highlights whichever one has focus.
  nav.addEventListener('focusin', (event) => menuGame?.registry.set('focus', event.target.dataset.menu));
  nav.addEventListener('focusout', () => menuGame?.registry.set('focus', null));
  nav.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    buttons.at((buttons.indexOf(document.activeElement) + step) % buttons.length).focus();
  });

  function setActive(active) {
    if (!active) {
      if (menuGame?.isRunning) menuGame.loop.sleep();
      return;
    }
    if (!menuGame) {
      menuGame = createMainMenuGame(parent, {
        portrait: parent.clientWidth < parent.clientHeight,
        fpsLimit: getFpsLimit(),
      });
      menuGame.registry.set({ hud: readHud(), focus: null });
      // Clicking the real button keeps its disabled state, wiring and dialog behavior in one place.
      menuGame.events.on('menu-select', (key) => buttons.find((button) => button.dataset.menu === key)?.click());
      return;
    }
    if (!menuGame.isRunning) return;
    menuGame.loop.wake();
    // Replays the intro and clears the hover left behind by the click that left the lobby.
    menuGame.scene.getScene('main-menu')?.scene.restart();
  }

  function refreshFpsLimit() {
    // Phaser destroys a game on its next step, so a sleeping loop has to be woken first.
    menuGame?.loop.wake();
    menuGame?.destroy(true);
    menuGame = null;
  }

  return { setActive, refreshFpsLimit };
}
