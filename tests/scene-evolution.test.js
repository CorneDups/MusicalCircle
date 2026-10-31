import test from "node:test";
import assert from "node:assert/strict";
import { SceneEvolution } from "../scene-evolution.js";

const metrics = energy => ({ available: true, silent: false, energy });
function run(scene, energy, duration, hz = 60) {
  for (let i = 0; i < Math.round(duration * hz); i++) scene.update(metrics(energy), 1 / hz);
}

test("sustained build and release traverse all phases with gradual bounded output", () => {
  const scene = new SceneEvolution();
  run(scene, 0.05, 8);
  assert.equal(scene.phase, "quiet");
  const quiet = [scene.density, scene.persistence, scene.expansion, scene.paletteMix];
  run(scene, 0.3, 6);
  assert.equal(scene.phase, "building");
  run(scene, 0.6, 12);
  assert.equal(scene.phase, "strong");
  [scene.density, scene.persistence, scene.expansion, scene.paletteMix].forEach((value, i) => assert.ok(value > quiet[i]));
  assert.ok(scene.expansion <= 1.035);
  run(scene, 0.05, 5);
  assert.equal(scene.phase, "settling");
  run(scene, 0.05, 18);
  assert.equal(scene.phase, "quiet");
  assert.ok(scene.strength < 0.02);
});

test("isolated spikes and threshold chatter do not switch scenes", () => {
  const scene = new SceneEvolution();
  run(scene, 0.8, 0.3);
  run(scene, 0, 5);
  assert.equal(scene.phase, "quiet");
  for (let i = 0; i < 60; i++) run(scene, i % 2 ? 0.22 : 0.18, 0.2);
  assert.equal(scene.phase, "quiet");
});

test("scene envelopes and transitions agree within five percent across frame rates", () => {
  const results = [30, 60, 144].map(hz => {
    const scene = new SceneEvolution();
    run(scene, 0.05, 4, hz);
    run(scene, 0.5, 10, hz);
    run(scene, 0.05, 5, hz);
    return scene;
  });
  for (const scene of results) {
    assert.equal(scene.phase, "settling");
    assert.ok(Math.abs(scene.strength - results[1].strength) / results[1].strength < 0.05);
  }
});

test("reset and long gaps discard section memory; unavailable and silent input cannot build", () => {
  const scene = new SceneEvolution();
  run(scene, 0.6, 12);
  scene.reset();
  assert.equal(scene.phase, "quiet");
  assert.equal(scene.strength, 0);
  for (let i = 0; i < 1000; i++) scene.update({ available: false, silent: false, energy: 1 }, 0.02);
  assert.equal(scene.phase, "quiet");
  for (let i = 0; i < 1000; i++) scene.update({ available: true, silent: true, energy: 1 }, 0.02);
  assert.equal(scene.phase, "quiet");
  run(scene, 0.6, 12);
  scene.update(metrics(0.6), 0.2);
  assert.equal(scene.energy, 0);
  assert.equal(scene.strength, 0);
  assert.throws(() => scene.update(metrics(NaN), 0.02), RangeError);
  assert.throws(() => scene.update(metrics(0.2), -1), RangeError);
});

test("phase transitions do not produce abrupt flashes or mutate input metrics", () => {
  const scene = new SceneEvolution();
  const input = Object.freeze(metrics(0.6));
  let previous = 0;
  for (let i = 0; i < 1200; i++) {
    scene.update(input, 1 / 60);
    assert.ok(Math.abs(scene.strength - previous) < 0.006);
    previous = scene.strength;
  }
});
