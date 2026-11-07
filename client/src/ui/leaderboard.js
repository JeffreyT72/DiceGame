import { request } from '../services/api.js';

export function createLeaderboardController() {
  const leaderboardStatus = document.querySelector('#leaderboard-status');
  const boards = [
    ['experience', '#experience-leaderboard-list', (player) => `${player.totalExp.toLocaleString()} EXP`, 'No players have registered yet.'],
    ['monstersDefeated', '#monsters-leaderboard-list', (player) => player.monstersDefeated.toLocaleString(), 'No players have registered yet.'],
    ['towerFloor', '#tower-leaderboard-list', (player) => `Floor ${player.highestTowerFloor.toLocaleString()}`, 'No one has cleared a tower floor yet.'],
  ].map(([key, selector, scoreLabel, emptyLabel]) => ({
    key, list: document.querySelector(selector), scoreLabel, emptyLabel,
  }));

  function createEntry(player, rank, index, scoreLabel, isSelf) {
    const entry = document.createElement('li');
    const rankBadge = document.createElement('span');
    const username = document.createElement('strong');
    const score = document.createElement('span');
    rankBadge.className = 'leaderboard-rank';
    rankBadge.textContent = rank > 50 ? `#${rank.toLocaleString()}` : rank;
    username.textContent = isSelf ? `${player.username} (you)` : player.username;
    score.className = 'leaderboard-score';
    score.textContent = scoreLabel(player);
    entry.append(rankBadge, username, score);
    entry.dataset.rank = rank;
    entry.style.setProperty('--i', index);
    if (isSelf) entry.classList.add('leaderboard-self');
    return entry;
  }

  function renderEntries({ list, scoreLabel, emptyLabel }, players = [], self = undefined) {
    if (players.length === 0) {
      const emptyEntry = document.createElement('li');
      emptyEntry.className = 'leaderboard-empty';
      emptyEntry.textContent = emptyLabel;
      list.append(emptyEntry);
      return;
    }
    players.forEach((player, index) => {
      list.append(createEntry(player, index + 1, index, scoreLabel, self?.rank === index + 1));
    });
    if (self && self.rank > players.length) {
      const selfEntry = createEntry(self, self.rank, players.length, scoreLabel, true);
      selfEntry.value = self.rank;
      list.append(selfEntry);
    }
  }

  async function open() {
    for (const { list } of boards) list.replaceChildren();
    leaderboardStatus.textContent = 'Loading leaderboard…';

    try {
      const { me = {}, updatedAt, ...top } = await request('/api/player/leaderboard');
      // Defaults keep an older cached payload (missing a board) from breaking the page.
      for (const board of boards) renderEntries(board, top[board.key], me[board.key]);
      leaderboardStatus.textContent = `Top 50 · updated ${new Date(updatedAt).toLocaleTimeString()}`;
    } catch (error) {
      console.error(error);
      leaderboardStatus.textContent = `Could not load leaderboard: ${error.message}`;
    }
  }

  return { open };
}
