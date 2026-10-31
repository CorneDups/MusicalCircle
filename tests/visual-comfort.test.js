import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveQuality, controlsCanHide, CONTROLS_IDLE_MS } from "../visual-comfort.js";

test("immersive controls never hide focused controls or a manual link fallback", () => {
  assert.equal(CONTROLS_IDLE_MS, 3000);
  assert.equal(controlsCanHide(true, false, false), true);
  for (const values of [[false, false, false], [true, true, false], [true, false, true]]) {
    assert.equal(controlsCanHide(...values), false);
  }
});

test("quality requires three sustained slow seconds and changes only decoration", () => {
  const quality = new AdaptiveQuality();
  for (let index = 0; index < 89; index += 1) quality.update(1 / 30, 2);
  assert.equal(quality.level, 0);
  for (let index = 0; index < 2; index += 1) quality.update(1 / 30, 2);
  assert.equal(quality.level, 1);
  assert.equal(quality.decorationScale, 0.7);
  for (let index = 0; index < 200; index += 1) quality.update(1 / 30, 2);
  assert.equal(quality.level, 2);
  assert.equal(quality.decorationScale, 0.4);
});

test("expensive drawing reduces decoration, isolated spikes and long gaps do not", () => {
  const quality = new AdaptiveQuality();
  for (let index = 0; index < 200; index += 1) quality.update(1 / 60, 14);
  assert.equal(quality.level, 1);
  quality.resetTiming();
  for (let index = 0; index < 500; index += 1) quality.update(1 / 60, index % 60 === 0 ? 14 : 2);
  assert.equal(quality.level, 1);
  quality.update(20, 15);
  assert.equal(quality.slow, 0);
});

test("quality recovers one level only after ten sustained healthy seconds", () => {
  const quality = new AdaptiveQuality();
  quality.level = 2;
  for (let index = 0; index < 599; index += 1) quality.update(1 / 60, 2);
  assert.equal(quality.level, 2);
  for (let index = 0; index < 2; index += 1) quality.update(1 / 60, 2);
  assert.equal(quality.level, 1);
  assert.throws(() => quality.update(NaN, 1), RangeError);
});
