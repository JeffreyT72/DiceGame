export class PaperDoll {
  constructor(scene, x, y, { frameRate = 4 } = {}) {
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
      throw new RangeError('Paper-doll frame rate must be a positive number.');
    }

    this.scene = scene;
    this.layers = new Map();
    this.frameIndex = 0;
    this.container = scene.add.container(x, y);
    this.frameTimer = scene.time.addEvent({
      delay: 1000 / frameRate,
      loop: true,
      callback: () => this.advanceFrame(),
    });
  }

  setLayer(slot, textureKey, frameNames, depth = 0) {
    if (!slot || !textureKey || !Array.isArray(frameNames) || frameNames.length === 0) {
      throw new TypeError('A paper-doll layer needs a slot, texture, and at least one frame.');
    }

    let layer = this.layers.get(slot);
    if (!layer) {
      const sprite = this.scene.add.sprite(0, 0, textureKey, frameNames[0]);
      layer = { sprite, frameNames };
      this.layers.set(slot, layer);
      this.container.add(sprite);
    } else {
      layer.frameNames = frameNames;
      layer.sprite.setTexture(textureKey);
    }

    layer.sprite.setDepth(depth);
    layer.sprite.setFrame(frameNames[this.frameIndex % frameNames.length]);
    this.container.sort('depth');
    return layer.sprite;
  }

  removeLayer(slot) {
    const layer = this.layers.get(slot);
    if (!layer) return;
    this.container.remove(layer.sprite, true);
    this.layers.delete(slot);
  }

  advanceFrame() {
    this.frameIndex += 1;
    for (const { sprite, frameNames } of this.layers.values()) {
      sprite.setFrame(frameNames[this.frameIndex % frameNames.length]);
    }
  }

  destroy() {
    this.frameTimer.remove(false);
    this.container.destroy(true);
    this.layers.clear();
  }
}
