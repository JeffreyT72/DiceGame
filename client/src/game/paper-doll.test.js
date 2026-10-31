import assert from 'node:assert/strict';
import test from 'node:test';
import { PaperDoll } from './paper-doll.js';

class FakeSprite {
  constructor(textureKey, frame) {
    this.textureKey = textureKey;
    this.frame = frame;
    this.depth = 0;
    this.destroyed = false;
  }

  setTexture(textureKey) {
    this.textureKey = textureKey;
    return this;
  }

  setFrame(frame) {
    this.frame = frame;
    return this;
  }

  setDepth(depth) {
    this.depth = depth;
    return this;
  }

  destroy() {
    this.destroyed = true;
  }
}

class FakeContainer {
  constructor() {
    this.list = [];
  }

  add(sprite) {
    this.list.push(sprite);
  }

  remove(sprite, destroy) {
    this.list = this.list.filter((child) => child !== sprite);
    if (destroy) sprite.destroy();
  }

  sort(property) {
    this.list.sort((first, second) => first[property] - second[property]);
  }

  destroy() {
    for (const child of this.list) child.destroy();
    this.list = [];
  }
}

function createScene() {
  const timers = [];
  return {
    timers,
    add: {
      container: () => new FakeContainer(),
      sprite: (_x, _y, textureKey, frame) => new FakeSprite(textureKey, frame),
    },
    time: {
      addEvent: (config) => {
        timers.push(config);
        return { remove: () => { config.removed = true; } };
      },
    },
  };
}

test('paper-doll layers advance on the same frame tick and preserve depth order', () => {
  const scene = createScene();
  const doll = new PaperDoll(scene, 10, 20);
  const top = doll.setLayer('top', 'top-texture', ['top-0', 'top-1'], 1);
  const body = doll.setLayer('body', 'body-texture', ['body-0', 'body-1']);

  assert.deepEqual(doll.container.list, [body, top]);
  scene.timers[0].callback();
  assert.equal(body.frame, 'body-1');
  assert.equal(top.frame, 'top-1');
});

test('paper-doll slots can change textures and be removed', () => {
  const scene = createScene();
  const doll = new PaperDoll(scene, 0, 0);
  const firstLayer = doll.setLayer('top', 'shirt-blue', ['frame-0']);
  const updatedLayer = doll.setLayer('top', 'shirt-red', ['frame-0']);

  assert.equal(updatedLayer, firstLayer);
  assert.equal(updatedLayer.textureKey, 'shirt-red');
  assert.equal(doll.container.list.length, 1);

  doll.removeLayer('top');
  assert.equal(updatedLayer.destroyed, true);
  assert.equal(doll.container.list.length, 0);
});

test('paper-doll animation requires a positive frame rate', () => {
  assert.throws(() => new PaperDoll(createScene(), 0, 0, { frameRate: 0 }), RangeError);
});
