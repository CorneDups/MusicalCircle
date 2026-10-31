import assert from "node:assert/strict";
import test from "node:test";
import {
  AudioAnalysis, SampleClock, SILENCE_RMS, MAX_NORMALIZATION_GAIN,
  frequencyBins, envelope, frameFade
} from "../audio-analysis.js";

const fftSize = 2048;

function samples(level = 0, frequency = 1000, sampleRate = 48000) {
  const spectrum = new Float32Array(fftSize / 2).fill(-Infinity);
  if (level) spectrum[Math.round(frequency * fftSize / sampleRate)] = 20 * Math.log10(level);
  const waveform = Float32Array.from({ length: fftSize },
    (_, i) => level * Math.sin(2 * Math.PI * frequency * i / sampleRate));
  return { spectrum, waveform };
}

function tick(analysis, input, seconds = 1 / 60, available = true) {
  return analysis.update(input.spectrum, input.waveform, seconds, available);
}

test("Hz bands are half-open, contiguous, exclude DC and respect Nyquist", () => {
  for (const sampleRate of [44100, 48000, 22050]) {
    const bands = [[30, 250], [250, 4000], [4000, 16000]]
      .map(([low, high]) => frequencyBins(sampleRate, fftSize, low, high));
    assert.equal(bands[0].start, Math.max(1, Math.ceil(30 * fftSize / sampleRate)));
    assert.equal(bands[0].end, bands[1].start);
    assert.equal(bands[1].end, bands[2].start);
    assert.equal(bands[2].end, Math.min(fftSize / 2, Math.ceil(16000 * fftSize / sampleRate)));
    for (const band of bands) assert.ok(band.start >= 1 && band.end <= fftSize / 2);
  }
  assert.deepEqual(frequencyBins(48000, 2048, 30000, 40000), { start: 1024, end: 1024 });
  assert.throws(() => frequencyBins(0, fftSize, 30, 250), RangeError);
  assert.throws(() => frequencyBins(Infinity, fftSize, 30, 250), RangeError);
});

test("80, 1000 and 8000 Hz activate their intended band at both sample rates", () => {
  for (const rate of [44100, 48000]) {
    for (const [frequency, key] of [[80, "bass"], [1000, "mids"], [8000, "treble"]]) {
      const analysis = new AudioAnalysis(rate, fftSize);
      const input = samples(0.2, frequency, rate);
      let metrics;
      for (let i = 0; i < 60; i += 1) metrics = tick(analysis, input);
      assert.ok(metrics[key] > 0.2);
      for (const other of ["bass", "mids", "treble"].filter(k => k !== key)) {
        assert.equal(metrics[other], 0);
      }
      assert.ok(Math.abs(metrics.rms - 0.2 / Math.sqrt(2)) < 0.002);
    }
  }
});

test("silence and unavailable audio produce no onsets or amplified noise", () => {
  const analysis = new AudioAnalysis(48000, fftSize);
  const silent = samples();
  for (let i = 0; i < 100; i += 1) {
    const m = tick(analysis, silent);
    assert.equal(m.onset, false);
    assert.equal(m.energy, 0);
    assert.equal(m.silent, true);
  }
  assert.equal(tick(analysis, samples(SILENCE_RMS / 2)).energy, 0);
  const m = analysis.update(null, null, 1 / 60, false);
  assert.equal(m.available, false);
  assert.equal(m.rms, 0);
  assert.equal(m.onset, false);
});

test("synthetic 120 BPM spectral impulses yield exactly one event per click", () => {
  const analysis = new AudioAnalysis(48000, fftSize);
  const quiet = samples();
  const click = samples(0.4);
  click.spectrum.fill(-35);
  const events = [];
  for (let i = 0; i < 600; i += 1) {
    const isClick = i >= 30 && i % 30 < 2;
    if (tick(analysis, isClick ? click : quiet).onset) events.push(i / 60);
  }
  assert.equal(events.length, 19);
  for (let i = 0; i < events.length; i += 1) assert.equal(events[i], (i + 1) * 0.5);
});

test("reset, resumption and long gaps seed spectra without a stale onset", () => {
  const analysis = new AudioAnalysis(48000, fftSize);
  tick(analysis, samples());
  assert.equal(tick(analysis, samples(0.8)).onset, true);
  analysis.reset();
  assert.equal(tick(analysis, samples(0.8)).onset, false);
  tick(analysis, samples(), 1 / 60, false);
  assert.equal(tick(analysis, samples(0.8)).onset, false);
  assert.equal(tick(analysis, samples(0.8), 2).onset, false);
  assert.equal(analysis.historyCount, 1);
});

test("onsets attack immediately and decay with a 200 ms time constant", () => {
  const analysis = new AudioAnalysis(48000, fftSize);
  tick(analysis, samples());
  const peak = tick(analysis, samples(0.8)).beat;
  assert.ok(peak > 0);
  for (let i = 0; i < 12; i += 1) tick(analysis, samples());
  assert.ok(Math.abs(analysis.metrics.beat / peak - Math.exp(-1)) < 1e-6);
});

test("quiet non-silent tracks adapt over seconds with bounded gain", () => {
  const analysis = new AudioAnalysis(48000, fftSize);
  const input = samples(0.01);
  const initial = tick(analysis, input).gain;
  for (let i = 0; i < 60 * 30; i += 1) tick(analysis, input);
  assert.ok(analysis.metrics.gain > initial);
  assert.equal(analysis.metrics.gain, MAX_NORMALIZATION_GAIN);
  assert.ok(analysis.metrics.energy > 0.02);
  const reference = analysis.reference;
  tick(analysis, samples());
  assert.equal(analysis.reference, reference);
  assert.ok(analysis.metrics.gain <= MAX_NORMALIZATION_GAIN);
});

test("envelopes, fades and terrain sampling are independent of render frequency", () => {
  const outputs = [];
  for (const fps of [30, 60, 144]) {
    let value = 0;
    let trail = 1;
    let count = 0;
    const clock = new SampleClock();
    const analysis = new AudioAnalysis(48000, fftSize);
    for (let frame = 0; frame < fps * 3; frame += 1) {
      const active = frame < fps;
      value = envelope(value, active ? 1 : 0, 1 / fps);
      trail *= 1 - frameFade(0.105, 1 / fps);
      count += clock.advance(1 / fps, 2 / 60);
      tick(analysis, samples(active ? 0.1 : 0), 1 / fps);
    }
    outputs.push({ value, trail, count, energy: analysis.metrics.energy });
    assert.equal(count, 90);
    assert.equal(clock.advance(2, 2 / 60), 0);
    assert.equal(clock.elapsed, 0);
  }
  for (const result of outputs.slice(1)) {
    for (const key of ["value", "trail", "energy"]) {
      assert.ok(Math.abs(result[key] / outputs[0][key] - 1) < 0.05, key);
    }
  }
  assert.throws(() => new SampleClock().advance(NaN, 0.05), RangeError);
});

test("malformed sample data and invalid elapsed times fail explicitly", () => {
  const analysis = new AudioAnalysis(48000, fftSize);
  assert.throws(() => analysis.update(null, null, 0.01), RangeError);
  assert.throws(() => tick(analysis, samples(), -1), RangeError);
  const input = samples();
  input.waveform[0] = NaN;
  assert.throws(() => tick(analysis, input), RangeError);
  input.waveform[0] = 0;
  input.spectrum[1] = NaN;
  assert.throws(() => tick(analysis, input), RangeError);
});
