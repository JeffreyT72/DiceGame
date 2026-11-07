import { request } from '../services/api.js';

export function createDailyQuestController({ onCurrencyUpdated }) {
  const list = document.querySelector('#daily-quest-list');
  const status = document.querySelector('#daily-quest-status');
  const questsButton = document.querySelector('#daily-challenges-button');
  let quests = [];

  function render() {
    questsButton.toggleAttribute('data-alert', quests.some(({ completed, claimed }) => completed && !claimed));
    list.replaceChildren(...quests.map((quest) => {
      const card = document.createElement('article');
      card.className = 'daily-quest-card';

      const heading = document.createElement('h3');
      heading.textContent = quest.title;
      const progress = document.createElement('progress');
      progress.max = quest.target;
      progress.value = quest.progress;
      progress.setAttribute('aria-label', `${quest.title}: ${quest.progress} of ${quest.target}`);
      const details = document.createElement('p');
      details.textContent = `${quest.progress} / ${quest.target} · ${quest.reward} gold`;
      const claim = document.createElement('button');
      claim.className = 'button button-quiet';
      claim.type = 'button';
      claim.dataset.questClaim = quest.type;
      claim.textContent = quest.claimed ? 'Claimed' : 'Claim reward';
      claim.disabled = quest.claimed || !quest.completed;

      card.append(heading, progress, details, claim);
      return card;
    }));
  }

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-quest-claim]');
    if (!button || button.disabled) return;
    button.disabled = true;
    status.textContent = 'Claiming quest reward…';
    try {
      const result = await request(
        `/api/player/daily-quests/${encodeURIComponent(button.dataset.questClaim)}/claim`,
        { method: 'POST' },
      );
      quests = result.quests;
      onCurrencyUpdated(result.currency);
      status.textContent = '100 gold added to your pouch.';
      render();
    } catch (error) {
      console.error(error);
      status.textContent = `Could not claim the reward: ${error.message}`;
      try {
        const result = await request('/api/player/daily-quests');
        quests = result.quests;
        onCurrencyUpdated(result.currency);
        render();
        if (quests.find(({ type }) => type === button.dataset.questClaim)?.claimed) {
          status.textContent = '100 gold added to your pouch.';
        }
      } catch (refreshError) {
        console.error(refreshError);
        status.textContent += ` Quest status could not be refreshed: ${refreshError.message}`;
      }
    }
  });

  async function refresh() {
    status.textContent = 'Loading today’s quests…';
    try {
      const result = await request('/api/player/daily-quests');
      quests = result.quests;
      onCurrencyUpdated(result.currency);
      render();
      status.textContent = 'One hundred gold for each completed quest. Quests reset at midnight UTC.';
    } catch (error) {
      console.error(error);
      status.textContent = `Could not load daily quests: ${error.message}`;
    }
  }

  return { refresh };
}
