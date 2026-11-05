import { characters, characterSpriteLayout } from '../game/characters.js';
import { drawPaperDollTop } from '../game/paper-doll-tops.js';
import { defaultPaperDollTop, getPaperDollTop, paperDollTops } from '../../../shared/paper-doll.js';

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
  const topSelect = document.createElement('select');
  topSelect.id = 'paper-doll-top-select';
  topSelect.setAttribute('aria-label', 'Top clothing');
  topSelect.replaceChildren(...paperDollTops.map(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    return option;
  }));
  const fragment = document.createDocumentFragment();
  for (const slot of equipmentSlots) {
    const item = document.createElement('li');
    item.className = 'paper-doll-slot';

    const name = document.createElement('strong');
    name.textContent = slot.name;
    const status = document.createElement('span');
    status.textContent = 'No items available';

    item.append(name);
    if (slot.id === 'top') {
      const label = document.createElement('label');
      label.htmlFor = topSelect.id;
      label.textContent = 'Choose a top';
      item.append(label, topSelect);
    } else {
      item.append(status);
    }
    fragment.append(item);
    slotStatuses.set(slot.id, status);
  }
  slotsElement.replaceChildren(fragment);

  let renderId = 0;
  function render(characterId, topId = defaultPaperDollTop) {
    const character = characters.find(({ id }) => id === characterId);
    if (!character) {
      throw new Error(`Unknown paper-doll character: ${characterId}`);
    }
    const top = getPaperDollTop(topId) ?? getPaperDollTop(defaultPaperDollTop);
    const supportsTops = character.id === 'chibi';

    renderId += 1;
    const currentRenderId = renderId;
    const image = new Image();
    const layout = character.spriteLayout ?? characterSpriteLayout;
    const { frameWidth, frameHeight, frameTop, idleFrames } = layout;
    canvas.setAttribute('aria-label', `${character.name} character preview`);
    slotStatuses.get('character').textContent = character.name;
    slotStatuses.get('top').textContent = supportsTops ? top.name : 'Available for Chibi';
    topSelect.value = top.id;
    topSelect.disabled = !supportsTops;
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
      if (supportsTops) {
        context.save();
        context.translate(18, 0);
        context.scale((canvas.width - 36) / frameWidth, canvas.height / frameHeight);
        drawPaperDollTop(context, top.id, frameWidth, frameHeight);
        context.restore();
      }
      statusElement.textContent = '';
    };
    image.onerror = () => {
      if (currentRenderId !== renderId) return;
      console.error(`Could not load the ${character.name} paper-doll preview.`);
      statusElement.textContent = 'Could not load the character preview.';
    };
    image.src = character.spriteSheet;
  }

  return { render, topSelect };
}
