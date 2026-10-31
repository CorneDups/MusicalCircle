import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  HarmonicAnalysis, TempoTracker, TEMPO_CONFIDENCE, tonnetzGeometry,
  logarithmicGroups, TerrainHistory, normalizePreset, normalizeVisualizerConfig
} from "../musical-features.js";

function spectrumFor(frequencies, sampleRate = 48000) {
  const spectrum = new Float32Array(4096).fill(-100);
  for (const [frequency, amplitude] of frequencies) {
    const bin = frequency * 8192 / sampleRate;
    for (let offset = -3; offset <= 3; offset += 1) {
      const index = Math.round(bin) + offset;
      spectrum[index] = Math.max(spectrum[index], amplitude - 8 * (index - bin) ** 2);
    }
  }
  return spectrum;
}

test("interpolated spectral peaks identify A bass and C/E/G at 44.1 and 48 kHz", () => {
  for (const rate of [44100, 48000]) {
    const features = new HarmonicAnalysis(rate);
    features.analyse(spectrumFor([[110, -20], [220, -25], [330, -30], [440, -32]], rate));
    features.update(1, true);
    assert.equal([...features.chroma].indexOf(Math.max(...features.chroma)), 9);
    assert.ok(features.confidence > 0.5);
    features.reset();
    features.analyse(spectrumFor([[261.6256, -20], [329.6276, -20], [391.9954, -20]], rate));
    features.update(1, true);
    const top = [...features.chroma].map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value).slice(0, 3).map(item => item.index).sort((a, b) => a - b);
    assert.deepEqual(top, [0, 4, 7]);
    assert.ok(features.confidence > 0.5);
  }
});

test("noise floor, flat broadband input and silence do not create confident harmonic activity", () => {
  const features = new HarmonicAnalysis();
  for (const spectrum of [new Float32Array(4096).fill(-35), new Float32Array(4096).fill(-Infinity),
    spectrumFor([[440, -80]])]) {
    features.reset();
    features.analyse(spectrum);
    features.update(1, true);
    assert.equal(features.confidence, 0);
    assert.ok(features.chroma.every(value => value === 0));
  }
  assert.throws(() => features.analyse(new Float32Array(20)), RangeError);
});

test("harmonic smoothing is time-based and unavailable input fades without decorative pitches", () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const features = new HarmonicAnalysis();
    features.analyse(spectrumFor([[440, -20]]));
    for (let index = 0; index < fps; index += 1) features.update(1 / fps, true);
    results.push(features.chroma[9]);
    for (let index = 0; index < fps * 5; index += 1) features.update(1 / fps, false);
    assert.ok(features.chroma[9] < 0.001);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 1e-6);
});

function feedTempo(tracker, onsets, end = onsets.at(-1) + 0.1) {
  let next = 0;
  for (let position = 0; position <= end; position += 0.016) {
    const onset = next < onsets.length && position >= onsets[next];
    if (onset) next += 1;
    tracker.update(position, onset);
  }
}

test("steady onset timing acquires 90/120/150 BPM and uses media position for phase", () => {
  for (const bpm of [90, 120, 150]) {
    const tracker = new TempoTracker();
    feedTempo(tracker, Array.from({ length: 16 }, (_, index) => 0.3 + index * 60 / bpm));
    assert.ok(tracker.confidence >= TEMPO_CONFIDENCE);
    assert.ok(Math.abs(60 / tracker.period - bpm) < 1);
    assert.ok(Math.abs(tracker.beats(tracker.anchor + tracker.period * 4) - 4) < 1e-9);
    assert.equal(tracker.beats(1, 1.1), null);
  }
});

test("tempo tolerates a missed onset but sparse/irregular events never force a clock", () => {
  const tracker = new TempoTracker();
  feedTempo(tracker, Array.from({ length: 18 }, (_, index) => 0.3 + index * 0.5).filter((_, index) => index !== 9));
  assert.ok(tracker.confidence >= TEMPO_CONFIDENCE);
  assert.ok(Math.abs(60 / tracker.period - 120) < 1);
  tracker.reset();
  feedTempo(tracker, [0.3, 0.8, 1.3]);
  assert.equal(tracker.beats(1.5), null);
  tracker.reset();
  feedTempo(tracker, [0.1, 0.33, 0.81, 1.53, 1.71, 2.17, 3.01, 3.32, 3.69, 4.24, 5.08]);
  assert.equal(tracker.beats(5.1), null);
});

test("seek, unavailable audio and long onset drought require tempo reacquisition", () => {
  for (const reset of ["seek", "unavailable", "drought"]) {
    const tracker = new TempoTracker();
    feedTempo(tracker, Array.from({ length: 16 }, (_, index) => 0.3 + index * 0.5));
    assert.ok(tracker.beats(8) !== null);
    if (reset === "seek") tracker.update(1, false);
    if (reset === "unavailable") tracker.update(7.91, false, false);
    if (reset === "drought") {
      for (let time = 7.91; time < 11.5; time += 0.016) tracker.update(time, false);
    }
    assert.equal(tracker.beats(12), null);
  }
});

test("Tonnetz edges and shaded cells are equilateral neighbors with no row wrap", () => {
  for (const [columns, rows] of [[3, 3], [7, 7], [11, 11]]) {
    const { nodes, edges, cells } = tonnetzGeometry(columns, rows);
    const keys = new Set(edges.map(edge => edge.slice().sort((a, b) => a - b).join(":")));
    assert.equal(keys.size, edges.length);
    for (const [first, second] of edges) {
      const a = nodes[first], b = nodes[second];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 1) < 1e-9);
      const interval = ((b.pitchClass - a.pitchClass) % 12 + 12) % 12;
      assert.ok([3, 4, 5, 7, 8, 9].includes(interval));
    }
    for (const cell of cells) {
      for (let index = 0; index < 3; index += 1) {
        assert.ok(keys.has([cell[index], cell[(index + 1) % 3]].sort((a, b) => a - b).join(":")));
      }
    }
    assert.equal(cells.length, (rows - 1) * (columns - 1) * 2);
  }
});

test("logarithmic terrain groups exclude DC, are ordered and respect actual Nyquist", () => {
  for (const rate of [22050, 44100, 48000]) {
    const groups = logarithmicGroups(rate, 8192, 54);
    assert.equal(groups.length, 54);
    for (let index = 0; index < groups.length; index += 1) {
      assert.ok(groups[index].start >= 1 && groups[index].end <= 4096);
      if (index) assert.equal(groups[index].start, groups[index - 1].end);
    }
    const width = groups.map(group => group.end - group.start);
    assert.ok(width.at(-1) > width[0]);
  }
});

test("terrain captures onsets between samples, travels through bounded fixed-time history and resets", () => {
  const history = new TerrainHistory();
  const preset = normalizePreset("spectral-terrain", { ridges: 4, sampleEvery: 3 });
  const metrics = { available: true, silent: false, gain: 1, onset: true, beat: 0.8 };
  const spectrum = spectrumFor([[1000, -20]]);
  history.update(spectrum, 48000, 8192, metrics, 0.016, preset);
  assert.equal(history.ridges.length, 0);
  for (let index = 0; index < 3; index += 1) {
    history.update(spectrum, 48000, 8192, { ...metrics, onset: false }, 0.016, preset);
  }
  assert.equal(history.ridges[0].onset, 0.8);
  assert.ok(history.ridges[0].levels.some(value => value > 0));
  for (let index = 0; index < 30; index += 1) {
    history.update(spectrum, 48000, 8192, { ...metrics, onset: false }, 0.016, preset);
  }
  assert.equal(history.ridges.length, 4);
  assert.ok(history.ridges.every(ridge => ridge.onset === 0));
  history.reset();
  assert.equal(history.ridges.length, 0);
});

test("terrain cadence is fixed-time across polling rates and long gaps drop pending transients", () => {
  const preset = normalizePreset("spectral-terrain", { ridges: 64, sampleEvery: 2 });
  const metrics = { available: true, silent: false, gain: 1, onset: false, beat: 0.8 };
  const spectrum = spectrumFor([[1000, -20]]);
  const counts = [];
  for (const fps of [30, 60, 144]) {
    const history = new TerrainHistory();
    for (let index = 0; index < fps; index += 1) history.update(spectrum, 48000, 8192, metrics, 1 / fps, preset);
    counts.push(history.ridges.length);
    history.update(spectrum, 48000, 8192, { ...metrics, onset: true }, 0.001, preset);
    history.update(spectrum, 48000, 8192, metrics, 1, preset);
    assert.equal(history.ridges.length, 0);
    assert.equal(history.pendingOnset, 0);
  }
  assert.deepEqual(counts, [30, 30, 30]);
});

test("every shipped preset loads, preserves names and supports compatible defaults and explicit zero", async () => {
  for (const id of ["circle-of-fifths", "lissajous", "tonnetz", "polyrhythm", "spectral-terrain"]) {
    const input = JSON.parse(await readFile(new URL(`../visualizers/${id}.json`, import.meta.url), "utf8"));
    const config = normalizeVisualizerConfig(id, input);
    assert.deepEqual(Object.keys(config.presets), Object.keys(input.presets));
    assert.equal(config.defaultPreset, input.defaultPreset);
  }
  assert.equal(normalizePreset("lissajous", { waveformAmount: 0, onsetAmount: 0, phaseSpeed: 0 }).waveformAmount, 0);
  assert.equal(normalizePreset("spectral-terrain", { transientHeight: 0, fillAlpha: 0 }).fillAlpha, 0);
  assert.equal(normalizePreset("polyrhythm", { pulses: [0], speed: 0 }).pulses[0], 0);
  for (const value of [-1, NaN, Infinity, "0.1", null]) {
    assert.throws(() => normalizePreset("lissajous", { waveformAmount: value }), RangeError);
  }
  assert.throws(() => normalizePreset("tonnetz", { rows: 3.5 }), RangeError);
  assert.throws(() => normalizePreset("polyrhythm", { tempoConfidence: 0 }), RangeError);
});
