import { characters, characterSpriteLayout } from '../game/characters.js';

const equipmentSlots = [
  { id: 'character', name: 'Base character' },
  { id: 'hair', name: 'Hair' },
  { id: 'headwear', name: 'Headwear' },
  { id: 'top', name: 'Top' },
  { id: 'bottom', name: 'Bottoms' },
  { id: 'shoes', name: 'Shoes' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'weapon', name: 'Weapon' },
];

export function createPaperDollCustomizer({ canvas, slotsElement, statusElement }) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not initialize the paper-doll preview canvas.');
  }

  const slotStatuses = new Map();
  const fragment = document.createDocumentFragment();
  for (const slot of equipmentSlots) {
    const item = document.createElement('li');
    item.className = 'paper-doll-slot';

    const name = document.createElement('strong');
    name.textContent = slot.name;
    const status = document.createElement('span');
    status.textContent = 'No items available';

    item.append(name, status);
    fragment.append(item);
    slotStatuses.set(slot.id, status);
  }
  slotsElement.replaceChildren(fragment);

  let renderId = 0;
  function render(characterId) {
    const character = characters.find(({ id }) => id === characterId);
    if (!character) {
      throw new Error(`Unknown paper-doll character: ${characterId}`);
    }

    renderId += 1;
    const currentRenderId = renderId;
    const image = new Image();
    const layout = character.spriteLayout ?? characterSpriteLayout;
    const { frameWidth, frameHeight, frameTop, idleFrames } = layout;
    canvas.setAttribute('aria-label', `${character.name} character preview`);
    slotStatuses.get('character').textContent = character.name;
    statusElement.textContent = '';

    image.onload = () => {
      if (currentRenderId !== renderId) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        idleFrames[0],
        frameTop,
        frameWidth,
        frameHeight,
        18,
        0,
        canvas.width - 36,
        canvas.height,
      );
      statusElement.textContent = '';
    };
    image.onerror = () => {
      if (currentRenderId !== renderId) return;
      console.error(`Could not load the ${character.name} paper-doll preview.`);
      statusElement.textContent = 'Could not load the character preview.';
    };
    image.src = character.spriteSheet;
  }

  return { render };
}
