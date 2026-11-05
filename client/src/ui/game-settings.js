import backgroundMusicUrl from '../assets/music/lofi-hip-hop1.mp3';

const fpsLimitOptions = [0, 30, 60, 90, 120, 144];
const fpsLimitStorageKey = 'blackjack-fps-limit';

export function createGameSettings({ onFpsLimitChange, onShowHandCountChange }) {
  const backgroundMusic = new Audio(backgroundMusicUrl);
  backgroundMusic.loop = true;
  const savedMusicVolumeValue = window.localStorage.getItem('blackjack-music-volume');
  const savedMusicVolume = savedMusicVolumeValue === null ? 0.3 : Number(savedMusicVolumeValue);
  backgroundMusic.volume = Number.isFinite(savedMusicVolume) && savedMusicVolume >= 0 && savedMusicVolume <= 1
    ? savedMusicVolume
    : 0.3;
  backgroundMusic.muted = window.localStorage.getItem('blackjack-music-muted') === 'true';
  backgroundMusic.preload = 'auto';

  const musicVolume = document.querySelector('#music-volume');
  const musicToggle = document.querySelector('#music-toggle');
  const fpsLimitInputs = [...document.querySelectorAll('input[name="fps-limit"]')];
  const handCountToggle = document.querySelector('#show-hand-count');
  const savedFpsLimit = Number(window.localStorage.getItem(fpsLimitStorageKey));
  let fpsLimit = fpsLimitOptions.includes(savedFpsLimit) ? savedFpsLimit : 0;
  let showHandCount = window.localStorage.getItem('blackjack-show-hand-count') !== 'false';
  fpsLimitInputs.forEach((input) => {
    input.checked = Number(input.value) === fpsLimit;
  });
  handCountToggle.checked = showHandCount;

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
    window.localStorage.setItem('blackjack-music-volume', String(nextVolume));
    window.localStorage.setItem('blackjack-music-muted', String(backgroundMusic.muted));
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
    window.localStorage.setItem('blackjack-music-volume', String(backgroundMusic.volume));
    window.localStorage.setItem('blackjack-music-muted', String(backgroundMusic.muted));
    syncMusicControls();
  });

  document.addEventListener('pointerdown', startBackgroundMusic, { once: true });
  document.addEventListener('keydown', startBackgroundMusic, { once: true });

  startBackgroundMusic();
  syncMusicControls();

  fpsLimitInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      fpsLimit = Number(input.value);
      window.localStorage.setItem(fpsLimitStorageKey, String(fpsLimit));
      onFpsLimitChange();
    });
  });

  handCountToggle.addEventListener('change', () => {
    showHandCount = handCountToggle.checked;
    window.localStorage.setItem('blackjack-show-hand-count', String(showHandCount));
    onShowHandCountChange(showHandCount);
  });

  document.querySelectorAll('[data-settings-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.settingsCategory;
      document.querySelectorAll('[data-settings-category]').forEach((categoryButton) => {
        if (categoryButton === button) categoryButton.setAttribute('aria-current', 'page');
        else categoryButton.removeAttribute('aria-current');
      });
      document.querySelectorAll('.settings-category').forEach((panel) => {
        panel.hidden = panel.id !== `settings-${category}`;
      });
    });
  });

  return {
    getFpsLimit: () => fpsLimit,
    getShowHandCount: () => showHandCount,
  };
}
