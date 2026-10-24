import { request } from '../services/api.js';

export function createLeaderboardController() {
  const experienceLeaderboardList = document.querySelector('#experience-leaderboard-list');
  const monstersLeaderboardList = document.querySelector('#monsters-leaderboard-list');
  const leaderboardStatus = document.querySelector('#leaderboard-status');

  async function open() {
    experienceLeaderboardList.replaceChildren();
    monstersLeaderboardList.replaceChildren();
    leaderboardStatus.textContent = 'Loading leaderboard…';

    try {
      const { experience, monstersDefeated } = await request('/api/player/leaderboard');
      const renderEntries = (list, players, scoreLabel, emptyLabel) => {
        if (players.length === 0) {
          const emptyEntry = document.createElement('li');
          emptyEntry.className = 'leaderboard-empty';
          emptyEntry.textContent = emptyLabel;
          list.append(emptyEntry);
          return;
        }
        for (const player of players) {
          const entry = document.createElement('li');
          const username = document.createElement('strong');
          const score = document.createElement('span');
          username.textContent = player.username;
          score.textContent = scoreLabel(player);
          entry.append(username, score);
          list.append(entry);
        }
      };

      renderEntries(
        experienceLeaderboardList,
        experience,
        (player) => `${player.totalExp.toLocaleString()} EXP`,
        'No players have registered yet.',
      );
      renderEntries(
        monstersLeaderboardList,
        monstersDefeated,
        (player) => player.monstersDefeated.toLocaleString(),
        'No players have registered yet.',
      );
      leaderboardStatus.textContent = '';
    } catch (error) {
      console.error(error);
      leaderboardStatus.textContent = `Could not load leaderboard: ${error.message}`;
    }
  }

  return { open };
}
