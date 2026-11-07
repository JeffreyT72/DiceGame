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
      const {
        experience, monstersDefeated, me = {}, updatedAt,
      } = await request('/api/player/leaderboard');
      const createEntry = (player, scoreLabel, isSelf) => {
        const entry = document.createElement('li');
        const username = document.createElement('strong');
        const score = document.createElement('span');
        username.textContent = isSelf ? `${player.username} (you)` : player.username;
        score.textContent = scoreLabel(player);
        entry.append(username, score);
        if (isSelf) entry.classList.add('leaderboard-self');
        return entry;
      };
      const renderEntries = (list, players, self, scoreLabel, emptyLabel) => {
        if (players.length === 0) {
          const emptyEntry = document.createElement('li');
          emptyEntry.className = 'leaderboard-empty';
          emptyEntry.textContent = emptyLabel;
          list.append(emptyEntry);
          return;
        }
        players.forEach((player, index) => {
          list.append(createEntry(player, scoreLabel, self?.rank === index + 1));
        });
        if (self && self.rank > players.length) {
          const selfEntry = createEntry(self, scoreLabel, true);
          selfEntry.value = self.rank;
          list.append(selfEntry);
        }
      };

      renderEntries(
        experienceLeaderboardList,
        experience,
        me.experience,
        (player) => `${player.totalExp.toLocaleString()} EXP`,
        'No players have registered yet.',
      );
      renderEntries(
        monstersLeaderboardList,
        monstersDefeated,
        me.monstersDefeated,
        (player) => player.monstersDefeated.toLocaleString(),
        'No players have registered yet.',
      );
      leaderboardStatus.textContent = `Top 50 · updated ${new Date(updatedAt).toLocaleTimeString()}`;
    } catch (error) {
      console.error(error);
      leaderboardStatus.textContent = `Could not load leaderboard: ${error.message}`;
    }
  }

  return { open };
}
