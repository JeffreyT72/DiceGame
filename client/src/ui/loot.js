import { getItem } from '../../../shared/items.js';

export function createLootRenderer({ getItems, getChoices, isResolving, onChooseItem }) {
  const activeItems = document.querySelector('#active-items');
  const emptyInventory = document.querySelector('#empty-inventory');
  const lootChoices = document.querySelector('#loot-choices');

  function renderInventory() {
    const groupedItems = new Map();
    for (const collectedItem of getItems() ?? []) {
      if (!collectedItem || typeof collectedItem.itemId !== 'string') continue;
      const item = getItem(collectedItem.itemId);
      if (item) groupedItems.set(item, (groupedItems.get(item) ?? 0) + 1);
    }

    activeItems.replaceChildren();
    activeItems.hidden = groupedItems.size === 0;
    emptyInventory.hidden = groupedItems.size > 0;
    for (const [item, count] of groupedItems) {
      const entry = document.createElement('li');
      entry.textContent = `${item.name}${count > 1 ? ` ×${count}` : ''}`;
      activeItems.append(entry);
    }
  }

  function renderChoices() {
    lootChoices.replaceChildren();
    for (const itemId of getChoices() ?? []) {
      const item = getItem(itemId);
      if (!item) continue;
      const button = document.createElement('button');
      button.className = 'loot-choice';
      button.type = 'button';
      button.dataset.item = item.id;
      button.disabled = isResolving();
      const name = document.createElement('strong');
      name.textContent = item.name;
      const description = document.createElement('span');
      description.textContent = item.description;
      button.append(name, description);
      button.addEventListener('click', () => onChooseItem(item.id));
      lootChoices.append(button);
    }
  }

  return { renderInventory, renderChoices };
}
