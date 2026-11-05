import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPaperDollTop, getPaperDollTop, paperDollTops } from './paper-doll.js';

test('paper-doll tops have unique IDs and a valid default', () => {
  const ids = paperDollTops.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(getPaperDollTop(defaultPaperDollTop));
  assert.equal(getPaperDollTop('unknown'), undefined);
});
