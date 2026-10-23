export function createDungeonCatalog(container, dungeons, onEnterDungeon, playerLevel = 1) {
  container.replaceChildren();

  for (const dungeon of dungeons) {
    const card = document.createElement('article');
    card.className = 'dungeon-card';

    const heading = document.createElement('div');
    heading.className = 'dungeon-card-heading';
    const title = document.createElement('h3');
    title.textContent = dungeon.name;
    const reward = document.createElement('span');
    reward.textContent = `${dungeon.rewardExp.toLocaleString()} EXP`;
    heading.append(title, reward);

    const description = document.createElement('p');
    description.textContent = dungeon.description;

    const requirements = document.createElement('p');
    requirements.textContent = `${dungeon.stages} stages · Level ${dungeon.levelRequirement} required`;

    const mobHeading = document.createElement('h4');
    mobHeading.textContent = `Mobs · ${dungeon.mobs.length}`;
    const monsterList = document.createElement('ul');
    monsterList.className = 'monster-list';
    for (const mob of dungeon.mobs) {
      monsterList.append(createMonsterCard(mob, 'Mob'));
    }

    const bossHeading = document.createElement('h4');
    bossHeading.textContent = 'Boss';
    const bossList = document.createElement('ul');
    bossList.className = 'monster-list';
    bossList.append(createMonsterCard(dungeon.boss, 'Boss'));

    const enterButton = document.createElement('button');
    enterButton.className = 'button button-primary dungeon-enter';
    enterButton.type = 'button';
    const canEnter = playerLevel >= dungeon.levelRequirement;
    enterButton.textContent = canEnter
      ? 'Enter dungeon'
      : `Requires level ${dungeon.levelRequirement}`;
    enterButton.disabled = !canEnter;
    enterButton.addEventListener('click', () => onEnterDungeon(dungeon));

    card.append(
      heading,
      description,
      requirements,
      mobHeading,
      monsterList,
      bossHeading,
      bossList,
      enterButton,
    );
    container.append(card);
  }
}

function createMonsterCard(monster, kind) {
  const entry = document.createElement('li');
  entry.className = 'monster-entry';

  const name = document.createElement('strong');
  name.textContent = monster.name;
  const type = document.createElement('span');
  type.className = 'monster-kind';
  type.textContent = kind;

  const stats = document.createElement('dl');
  for (const [label, value] of [
    ['HP', monster.hp],
    ['Attack', monster.attackPower],
    ['Defense', monster.defense],
  ]) {
    const stat = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const amount = document.createElement('dd');
    amount.textContent = String(value);
    stat.append(term, amount);
    stats.append(stat);
  }

  entry.append(name, type, stats);
  return entry;
}
