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
    description: 'Recover 10% of maximum HP on a successful hit.',
    rarity: 'uncommon',
    maxLevel: 10,
    chance: 0.7,
    effects: { healOnHitHpBased: 0.1 },
  },
  {
    id: 'white-cloak',
    name: 'White Cloak',
    description: 'Recover 30% of the damage you deal.',
    rarity: 'uncommon',
    maxLevel: 10,
    chance: 0.7,
    effects: { healOnHitDamageBased: 0.3 },
  },
  {
    id: 'assault-vest',
    name: 'Assault Vest',
    description: '10% damage reduction and +12% maximum HP.',
    rarity: 'rare',
    maxLevel: 10,
    chance: 0.5,
    effects: { damageReduction: 0.1, maxHealth: 0.12 },
  },
  {
    id: 'rocky-helmet',
    name: 'Rocky Helmet',
    description: 'Reflect 10% of damage taken back to the attacker.',
    rarity: 'uncommon',
    maxLevel: 10,
    chance: 0.7,
    effects: { damageReflection: 0.1 },
  },
  {
    id: 'mystic-amulet',
    name: 'Mystic Amulet',
    description: '+3% lifesteal on hit and +15% healing.',
    rarity: 'uncommon',
    maxLevel: 10,
    chance: 0.7,
    effects: { healOnHitDamageBased: 0.3, healing: 0.15 },
  },
  {
    id: 'bear-claw',
    name: 'Bear Claw',
    description: '+0.1 Hit Multiplier.',
    rarity: 'rare',
    maxLevel: 10,
    chance: 0.5,
    effects: { hitMultiplier: 0.1 },
  }

];

const itemsById = new Map(itemDefinitions.map((item) => [item.id, item]));

export function getItem(itemId) {
  return itemsById.get(itemId);
}

export function getItemEffects(collectedItems) {
  const effects = {
    attack: 0,
    damageReduction: 0,
    damageReflection: 0,
    maxHealth: 0,
    dodgeChance: 0,
    criticalChance: 0,
    healOnHitHpBased: 0,
    healOnHitDamageBased: 0,
    healing: 0,
    hitMultiplier: 0,
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
  effects.damageReflection = Math.min(1, effects.damageReflection);
  effects.dodgeChance = Math.min(1, effects.dodgeChance);
  effects.criticalChance = Math.min(1, effects.criticalChance);
  effects.healOnHitHpBased = Math.min(1, effects.healOnHitHpBased);
  effects.healOnHitDamageBased = Math.min(1, effects.healOnHitDamageBased);
  effects.healing = Math.min(1, effects.healing);
  effects.hitMultiplier = Math.min(1, effects.hitMultiplier);
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
