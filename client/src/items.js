export const itemDefinitions = [
  {
    id: 'iron-sword',
    name: 'Iron Sword',
    description: '+3 attack damage.',
    rarity: 'common',
    chance: 1,
    effects: { attack: 3 },
  },
  {
    id: 'iron-shield',
    name: 'Iron Shield',
    description: 'Reduce incoming monster damage by 20%.',
    rarity: 'common',
    maxLevel: 10,
    chance: 1,
    effects: { damageReduction: 0.2 },
  },
  {
    id: 'iron-armor',
    name: 'Iron Armor',
    description: '+20 maximum HP and restore 20 HP when collected.',
    rarity: 'common',
    maxLevel: 10,
    chance: 1,
    effects: { maxHealth: 20 },
  },
  {
    id: 'leather-boots',
    name: 'Leather Boots',
    description: '+10% chance to dodge monster damage.',
    rarity: 'common',
    maxLevel: 10,
    chance: 1,
    effects: { dodgeChance: 0.1 },
  },
  {
    id: 'lucky-ring',
    name: 'Lucky Ring',
    description: '+5% critical chance for 1.5x damage.',
    rarity: 'common',
    maxLevel: 10,
    chance: 1,
    effects: { criticalChance: 0.05 },
  },
  {
    id: 'iron-necklace',
    name: 'Iron Necklace',
    description: 'Restore 10% of maximum HP on a successful hit.',
    rarity: 'common',
    maxLevel: 10,
    chance: 0.5,
    effects: { healOnHit: 0.1 },
  },
];

const itemsById = new Map(itemDefinitions.map((item) => [item.id, item]));

export function getItem(itemId) {
  return itemsById.get(itemId);
}

export function getItemEffects(collectedItems) {
  const effects = {
    attack: 0,
    damageReduction: 0,
    maxHealth: 0,
    dodgeChance: 0,
    criticalChance: 0,
    healOnHit: 0,
  };

  for (const collectedItem of collectedItems) {
    if (!collectedItem || typeof collectedItem.itemId !== 'string') continue;
    const item = getItem(collectedItem.itemId);
    if (!item) continue;
    for (const [effect, value] of Object.entries(item.effects)) {
      effects[effect] += value;
    }
  }

  effects.damageReduction = Math.min(1, effects.damageReduction);
  effects.dodgeChance = Math.min(1, effects.dodgeChance);
  effects.criticalChance = Math.min(1, effects.criticalChance);
  effects.healOnHit = Math.min(1, effects.healOnHit);
  return effects;
}

export function chooseItemOptions(count = 3, random = Math.random) {
  const availableItems = itemDefinitions.filter((item) => item.chance > 0);
  const choices = [];

  while (choices.length < count && availableItems.length > 0) {
    const totalChance = availableItems.reduce((total, item) => total + item.chance, 0);
    let roll = random() * totalChance;
    const selectedIndex = availableItems.findIndex((item) => {
      roll -= item.chance;
      return roll < 0;
    });
    const [selectedItem] = availableItems.splice(selectedIndex, 1);
    choices.push(selectedItem.id);
  }

  return choices;
}
