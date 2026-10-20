import { request } from '../services/api.js';

export function createCharacterLab({
  getStats,
  setStats,
  getRunState,
  maximumHealth,
  expRequiredForNextLevel,
  applyTotalExp,
  saveRunState,
  renderGame,
  setStatus,
}) {
  const statPoints = document.querySelector('#stat-points');
  const statButtons = [...document.querySelectorAll('[data-stat]')];
  const playerLevel = document.querySelector('#player-level');
  const playerExp = document.querySelector('#player-exp');
  const experienceBar = document.querySelector('#experience-bar');
  const experienceFill = document.querySelector('#experience-fill');
  const lobbyLevel = document.querySelector('#lobby-level');
  let allocatingStat = false;

  function renderProgression() {
    const stats = getStats();
    const level = stats.level ?? 1;
    const exp = stats.expIntoLevel ?? 0;
    const required = expRequiredForNextLevel(level);
    lobbyLevel.textContent = `Level ${level}`;
    playerLevel.textContent = `Level ${level}`;
    playerExp.textContent = `${exp} / ${required} EXP`;
    experienceBar.setAttribute('aria-valuemax', String(required));
    experienceBar.setAttribute('aria-valuenow', String(exp));
    experienceBar.setAttribute('aria-valuetext', `${exp} of ${required} experience toward level ${level + 1}`);
    experienceFill.style.width = `${exp / required * 100}%`;
    statPoints.textContent = `Unspent stat points: ${stats.availableStatPoints}`;
    for (const button of statButtons) {
      button.disabled = allocatingStat || stats.availableStatPoints < 1;
    }
    document.querySelector('#stat-strength').textContent = stats.strength;
    document.querySelector('#stat-agility').textContent = stats.agility;
    document.querySelector('#stat-constitution').textContent = stats.constitution;
    document.querySelector('#stat-luck').textContent = stats.luck;
    document.querySelector('#stat-agility-bonus').textContent = `${Math.min(100, stats.agility * 5)}% dodge`;
    document.querySelector('#stat-constitution-bonus').textContent = `+${stats.constitution * 20} max HP`;
    document.querySelector('#stat-luck-bonus').textContent = `${Math.min(100, stats.luck * 3)}% critical (1.5x)`;
  }

  async function allocateStat(stat) {
    allocatingStat = true;
    renderProgression();
    try {
      const { stats } = await request('/api/player/stats/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stat }),
      });
      setStats(stats);
      applyTotalExp(stats.totalExp);
      const runState = getRunState();
      if (stat === 'constitution' && runState) {
        runState.playerHp = Math.min(maximumHealth(), runState.playerHp + 20);
        saveRunState();
      }
      renderProgression();
      renderGame();
      setStatus(`${stat.toUpperCase()} increased.`);
    } catch (error) {
      console.error(error);
      setStatus(`Could not allocate your stat point: ${error.message}`);
    } finally {
      allocatingStat = false;
      renderProgression();
    }
  }

  for (const button of statButtons) {
    button.addEventListener('click', () => allocateStat(button.dataset.stat));
  }

  return { renderProgression };
}
