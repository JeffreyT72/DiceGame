import assert from 'node:assert/strict';
import test from 'node:test';
import { drawPaperDollTop } from './paper-doll-tops.js';

function createContext() {
  return {
    fillStyles: [],
    save() {},
    restore() {},
    scale() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {
      this.fillStyles.push(this.fillStyle);
    },
    stroke() {},
  };
}

test('generated tops draw their selected color and reject unknown designs', () => {
  const context = createContext();
  drawPaperDollTop(context, 'azure');
  assert.deepEqual(context.fillStyles, ['#479bd2', '#174a70']);
  assert.throws(() => drawPaperDollTop(context, 'unknown'), RangeError);
});
