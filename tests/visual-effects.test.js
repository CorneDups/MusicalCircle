import assert from "node:assert/strict";
import test from "node:test";
import {
  VisualEffects, MAX_WAVES, MAX_SPARKS, MAX_SPARK_RATE,
  WAVE_LIFETIME, responseAmplitude, waveformOffset
} from "../visual-effects.js";

const loud = {
  available: true, silent: false, bass: 0.8, treble: 0.8,
  energy: 0.8, beat: 0.8, onset: false
};
const quiet = { ...loud, bass: 0.01, treble: 0.005, energy: 0.01, beat: 0 };
const silent = { ...quiet, silent: true, onset: false };

test("one onset creates one finite wave, with bounded concurrency and spacing", () => {
  const effects = new VisualEffects();
  effects.update({ ...loud, onset: true }, 0.016);
  assert.equal(effects.waves.length, 1);
  effects.update({ ...loud, onset: true }, 0.016);
  assert.equal(effects.waves.length, 1);
  for (let i = 0; i < 100; i += 1) {
    effects.update({ ...loud, onset: true }, 0.016);
    assert.ok(effects.waves.length <= MAX_WAVES);
    for (const wave of effects.waves) {
      assert.ok(wave.age < WAVE_LIFETIME && wave.strength > 0 && wave.strength <= 1);
    }
  }
  for (let i = 0; i < 60; i += 1) effects.update(silent, 1 / 60);
  assert.equal(effects.waves.length, 0);
});

test("treble sparks are deterministic, finite and limited to 18 per second", () => {
  const first = new VisualEffects(42);
  const second = new VisualEffects(42);
  let emitted = 0;
  for (let i = 0; i < 60 * 30; i += 1) {
    const oldSeed = first.seed;
    first.update(loud, 1 / 60);
    second.update(loud, 1 / 60);
    if (first.seed !== oldSeed) emitted += 1;
    assert.deepEqual(first.sparks, second.sparks);
    assert.ok(first.sparks.length <= MAX_SPARKS);
    for (const spark of first.sparks) {
      assert.ok(spark.age < spark.life && spark.life <= 0.65);
      assert.ok(spark.radius >= 0.39 && spark.radius <= 0.435);
    }
  }
  assert.ok(emitted <= MAX_SPARK_RATE * 30);
  for (let i = 0; i < 60; i += 1) first.update(silent, 1 / 60);
  assert.equal(first.sparks.length, 0);
  assert.equal(first.sparkBudget, 0);
});

test("quiet passages do not emit treble sparks; silence cannot invent onsets", () => {
  const effects = new VisualEffects();
  for (let i = 0; i < 600; i += 1) effects.update(quiet, 1 / 60);
  assert.equal(effects.sparks.length, 0);
  assert.equal(effects.waves.length, 0);
  effects.update({ ...silent, onset: true }, 0.016);
  assert.equal(effects.waves.length, 0);
});

test("measured-scale treble produces sparse sparks without requiring a full-scale band", () => {
  const effects = new VisualEffects();
  let emitted = 0;
  for (let i = 0; i < 120; i += 1) {
    const oldSeed = effects.seed;
    effects.update({ ...loud, treble: 0.022, energy: 0.2 }, 1 / 60);
    if (effects.seed !== oldSeed) emitted += 1;
  }
  assert.ok(emitted >= 1 && emitted <= 6);
  assert.ok(effects.sparks.length <= 3);
});

test("pause, buffering, reduced motion, resets and gaps suppress transient effects", () => {
  const effects = new VisualEffects();
  for (const mode of ["unavailable", "reduced", "reset", "gap"]) {
    for (let i = 0; i < 60; i += 1) effects.update({ ...loud, onset: i === 59 }, 1 / 60);
    assert.ok(effects.sparks.length > 0 && effects.waves.length > 0);
    if (mode === "reset") effects.reset();
    else if (mode === "gap") effects.update(loud, 1);
    else effects.update(mode === "unavailable" ? { ...loud, available: false } : loud,
      0.016, mode === "reduced");
    assert.equal(effects.waves.length, 0);
    assert.equal(effects.sparks.length, 0);
    assert.equal(effects.sparkBudget, 0);
  }
});

test("bass deformation and artwork envelopes depend on elapsed time, not drawing", () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const effects = new VisualEffects();
    for (let frame = 0; frame < fps * 2; frame += 1) effects.update(loud, 1 / fps);
    results.push({ bass: effects.bass, artwork: effects.artwork, energy: effects.energy });
    assert.ok(effects.artwork > 0 && effects.artwork <= 1);
    for (let frame = 0; frame < fps * 3; frame += 1) effects.update(silent, 1 / fps);
    assert.ok(effects.artwork < 0.00001);
  }
  for (const result of results.slice(1)) {
    for (const key of ["bass", "artwork", "energy"]) {
      assert.ok(Math.abs(result[key] - results[0][key]) < 1e-6);
    }
  }
});

test("intensity scales only response amplitude, never event counts or timing", () => {
  const amplitudes = [0.5, 1, 2].map(intensity => responseAmplitude(0.4, intensity));
  assert.deepEqual(amplitudes, [0.2, 0.4, 0.8]);
  const waveform = [0.5, 1, 2].map(intensity => waveformOffset(0.4, 2, intensity, 0.5));
  assert.ok(waveform[0] < waveform[1] && waveform[1] < waveform[2]);
  assert.equal(waveformOffset(1, 4, 2, 0), 0);
  assert.ok(Math.abs(waveformOffset(1, 4, 2, 1)) < 1e-16);
  assert.ok(Math.abs(waveformOffset(-10, 4, 2, 0.5)) <= 0.036);
});

test("invalid elapsed time fails explicitly", () => {
  const effects = new VisualEffects();
  assert.throws(() => effects.update(loud, NaN), RangeError);
  assert.throws(() => effects.update(loud, -1), RangeError);
});
