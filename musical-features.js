import { envelope, frequencyBins, SampleClock, MAX_FRAME_GAP } from "./audio-analysis.js";

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const TEMPO_CONFIDENCE = 0.7;

export class HarmonicAnalysis {
  constructor(sampleRate = 48000, fftSize = 8192) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.band = frequencyBins(sampleRate, fftSize, 55, 6000);
    this.reset();
  }

  reset() {
    this.chroma = new Float32Array(12);
    this.target = new Float32Array(12);
    this.confidence = 0;
    this.targetConfidence = 0;
  }

  analyse(spectrum) {
    if (spectrum.length !== this.fftSize / 2) throw new RangeError("Invalid harmonic spectrum size.");
    const { start, end } = this.band;
    let totalPower = 0;
    let maximum = -Infinity;
    for (let bin = start; bin < end; bin += 1) {
      const value = spectrum[bin];
      if (Number.isNaN(value) || value === Infinity) throw new RangeError("Invalid harmonic spectrum.");
      totalPower += 10 ** (value / 10);
      maximum = Math.max(maximum, value);
    }
    const peaks = [];
    for (let bin = Math.max(4, start); bin < Math.min(end, spectrum.length - 4); bin += 1) {
      const db = spectrum[bin];
      if (db < Math.max(-72, maximum - 30) || db <= spectrum[bin - 1] || db < spectrum[bin + 1]) continue;
      const floor = Math.max(spectrum[bin - 4], spectrum[bin + 4]);
      if (db - floor < 8) continue;
      const left = Math.max(-150, spectrum[bin - 1]);
      const right = Math.max(-150, spectrum[bin + 1]);
      const denominator = left - 2 * db + right;
      const offset = denominator ? clamp(0.5 * (left - right) / denominator, -0.5, 0.5) : 0;
      const frequency = (bin + offset) * this.sampleRate / this.fftSize;
      let power = 0;
      for (let neighbor = Math.max(start, bin - 2); neighbor <= Math.min(end - 1, bin + 2); neighbor += 1) {
        power += 10 ** (spectrum[neighbor] / 10);
      }
      peaks.push({ frequency, power });
    }
    peaks.sort((a, b) => b.power - a.power);
    peaks.length = Math.min(64, peaks.length);
    const classes = new Float64Array(12);
    let tonalPower = 0;
    for (const peak of peaks) {
      let weight = Math.sqrt(peak.power);
      for (const lower of peaks) {
        const ratio = peak.frequency / lower.frequency;
        const harmonic = Math.round(ratio);
        // Reduce overtones only when a plausible lower fundamental is actually present.
        if (harmonic >= 2 && harmonic <= 6 && Math.abs(ratio - harmonic) < 0.035
          && lower.power >= peak.power * 0.15) weight /= Math.sqrt(harmonic);
      }
      const midi = 69 + 12 * Math.log2(peak.frequency / 440);
      const nearest = Math.round(midi);
      const tuningWeight = Math.max(0, 1 - Math.abs(midi - nearest) / 0.5);
      classes[((nearest % 12) + 12) % 12] += weight * tuningWeight;
      tonalPower += peak.power * tuningWeight;
    }
    const sum = classes.reduce((total, value) => total + value, 0);
    const strongest = Math.max(...classes);
    let entropy = 0;
    for (const value of classes) {
      const probability = sum ? value / sum : 0;
      if (probability) entropy -= probability * Math.log(probability) / Math.log(12);
    }
    this.targetConfidence = totalPower ? clamp(tonalPower / totalPower) * (1 - entropy * 0.7) : 0;
    for (let index = 0; index < 12; index += 1) {
      this.target[index] = strongest ? classes[index] / strongest : 0;
    }
  }

  update(seconds, active) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid harmonic elapsed time.");
    for (let index = 0; index < 12; index += 1) {
      this.chroma[index] = envelope(this.chroma[index], active ? this.target[index] : 0, seconds, 0.15, 0.65);
    }
    this.confidence = envelope(this.confidence, active ? this.targetConfidence : 0, seconds, 0.2, 0.5);
  }
}

export class TempoTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.onsets = [];
    this.period = 0;
    this.anchor = 0;
    this.confidence = 0;
    this.lastPosition = null;
  }

  update(position, onset, active = true) {
    if (!Number.isFinite(position) || position < 0) throw new RangeError("Invalid playback position.");
    if (!active || (this.lastPosition !== null && (position < this.lastPosition || position - this.lastPosition > 0.25))) {
      this.reset();
    }
    this.lastPosition = position;
    if (!active) return;
    if (this.onsets.length && position - this.onsets.at(-1) > 3) {
      this.onsets = [];
      this.confidence = 0;
      this.period = 0;
    }
    if (!onset) {
      if (this.onsets.length && position - this.onsets.at(-1) > 2) this.confidence = 0;
      return;
    }
    if (this.onsets.length && position - this.onsets.at(-1) < 0.12) return;
    this.onsets.push(position);
    this.onsets = this.onsets.filter(time => position - time <= 12).slice(-48);
    if (this.onsets.length < 6 || position - this.onsets[0] < 2) return;
    let best = null;
    const intervals = this.onsets.slice(1).map((time, index) => time - this.onsets[index]);
    for (const interval of intervals) {
      for (let divisor = 1; divisor <= 4; divisor += 1) {
        const period = interval / divisor;
        if (period < 1 / 3 || period > 1) continue;
        let score = 0;
        let steps = 0;
        for (const gap of intervals) {
          const multiple = Math.max(1, Math.round(gap / period));
          const error = Math.abs(gap - multiple * period) / period;
          score += Math.max(0, 1 - error / 0.12);
          steps += multiple;
        }
        const confidence = score / intervals.length;
        const rank = confidence - 0.08 * (steps / intervals.length - 1);
        if (!best || rank > best.rank) best = { period, confidence, rank };
      }
    }
    if (!best) {
      this.confidence = 0;
      return;
    }
    const consistent = intervals.filter(gap => Math.abs(gap / best.period - Math.round(gap / best.period)) < 0.12);
    const refined = consistent.map(gap => gap / Math.max(1, Math.round(gap / best.period)));
    this.period = refined.reduce((sum, value) => sum + value, 0) / refined.length;
    const anchor = this.onsets[0];
    const phaseErrors = this.onsets.map(time => {
      const cycles = (time - anchor) / this.period;
      return (cycles - Math.round(cycles)) * this.period;
    });
    this.anchor = anchor + phaseErrors.reduce((sum, value) => sum + value, 0) / phaseErrors.length;
    const alignment = phaseErrors.filter(error => Math.abs(error) < this.period * 0.12).length / phaseErrors.length;
    this.confidence = best.confidence * alignment;
  }

  beats(position, threshold = TEMPO_CONFIDENCE) {
    return this.period && this.confidence >= threshold ? (position - this.anchor) / this.period : null;
  }
}

export function tonnetzGeometry(columns, rows) {
  const nodes = [];
  const edges = [];
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const axialColumn = column - Math.floor(row / 2);
      nodes.push({
        x: column + (row % 2) * 0.5 - (columns - 1) / 2 - 0.25,
        y: (row - (rows - 1) / 2) * Math.sqrt(3) / 2,
        pitchClass: ((axialColumn * 7 + row * 4) % 12 + 12) % 12
      });
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (column + 1 < columns) edges.push([index, index + 1]);
      if (row + 1 >= rows) continue;
      const lowerColumns = row % 2 ? [column, column + 1] : [column - 1, column];
      for (const lower of lowerColumns) {
        if (lower >= 0 && lower < columns) edges.push([index, (row + 1) * columns + lower]);
      }
      if (lowerColumns[0] >= 0 && lowerColumns[1] < columns) {
        cells.push([index, (row + 1) * columns + lowerColumns[0], (row + 1) * columns + lowerColumns[1]]);
      }
      const lower = row % 2 ? column + 1 : column;
      if (column + 1 < columns && lower < columns) cells.push([index, index + 1, (row + 1) * columns + lower]);
    }
  }
  return { nodes, edges, cells };
}

export function logarithmicGroups(sampleRate, fftSize, count) {
  if (!Number.isInteger(count) || count < 2) throw new RangeError("Invalid logarithmic group count.");
  const high = Math.min(16000, sampleRate / 2);
  return Array.from({ length: count }, (_, index) => frequencyBins(
    sampleRate, fftSize, 30 * (high / 30) ** (index / count), 30 * (high / 30) ** ((index + 1) / count)
  ));
}

export class TerrainHistory {
  constructor() {
    this.reset();
  }

  reset() {
    this.clock = new SampleClock();
    this.ridges = [];
    this.pendingOnset = 0;
    this.groups = null;
    this.key = "";
  }

  update(spectrum, sampleRate, fftSize, metrics, seconds, preset) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid terrain elapsed time.");
    if (seconds > MAX_FRAME_GAP) {
      this.reset();
      return;
    }
    if (!metrics.available) {
      this.clock.reset();
      this.pendingOnset = 0;
      return;
    }
    if (metrics.onset && !metrics.silent) this.pendingOnset = Math.max(this.pendingOnset, metrics.beat);
    const key = `${sampleRate}:${fftSize}:${preset.bins}`;
    if (key !== this.key) {
      this.groups = logarithmicGroups(sampleRate, fftSize, preset.bins);
      this.key = key;
      this.ridges = [];
    }
    const samples = this.clock.advance(seconds, preset.sampleEvery / 60);
    if (!samples) return;
    const levels = this.groups.map(({ start, end }) => {
      let power = 0;
      for (let bin = start; bin < end; bin += 1) power += 10 ** (spectrum[bin] / 10);
      return metrics.silent ? 0 : clamp(Math.sqrt(power) * 2 * metrics.gain);
    });
    for (let sample = 0; sample < samples; sample += 1) {
      this.ridges.unshift({ levels, onset: sample === 0 ? this.pendingOnset : 0 });
    }
    this.ridges.length = Math.min(preset.ridges, this.ridges.length);
    this.pendingOnset = 0;
  }
}

const schemas = {
  "circle-of-fifths": {
    radius: [0.34, 0.1, 0.42], rotationSpeed: [0.00005, -0.002, 0.002],
    polygonAlpha: [0.46, 0, 1], petalAlpha: [0.12, 0, 0.4], connectionThreshold: [0.45, 0, 1]
  },
  lissajous: {
    ratioX: [3, 1, 12], ratioY: [2, 1, 12], trailCount: [3, 1, 12],
    phaseSpeed: [0.0004, -0.002, 0.002], scale: [0.34, 0.1, 0.4], lineWidth: [1.8, 0.1, 6],
    waveformAmount: [0.012, 0, 0.025], onsetAmount: [0.06, 0, 0.12]
  },
  tonnetz: {
    columns: [9, 3, 15], rows: [9, 3, 15], spacing: [0.09, 0.03, 0.15],
    driftSpeed: [0.00005, -0.002, 0.002], nodeSize: [2.8, 0, 8],
    activeThreshold: [0.25, 0, 1], regionAlpha: [0.16, 0, 0.4], pathwayAlpha: [0.35, 0, 0.6]
  },
  polyrhythm: {
    speed: [0.00035, -0.002, 0.002], radiusStep: [0.07, 0, 0.08],
    nodeSize: [3.5, 0, 8], tempoConfidence: [TEMPO_CONFIDENCE, TEMPO_CONFIDENCE, 1]
  },
  "spectral-terrain": {
    ridges: [24, 4, 64], bins: [42, 12, 96], depth: [0.015, 0, 0.03],
    height: [0.2, 0, 0.3], sampleEvery: [3, 1, 12], fillAlpha: [0.055, 0, 0.3],
    transientHeight: [0.055, 0, 0.1], paletteMix: [0.65, 0, 1]
  }
};
const integers = new Set(["ratioX", "ratioY", "trailCount", "columns", "rows", "ridges", "bins", "sampleEvery"]);

export function normalizePreset(id, input = {}) {
  if (!schemas[id] || !input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid visualizer preset.");
  const result = { ...input };
  for (const [name, [fallback, minimum, maximum]] of Object.entries(schemas[id])) {
    const value = input[name] === undefined ? fallback : input[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum
      || (integers.has(name) && !Number.isInteger(value))) throw new RangeError(`Invalid ${id} preset field: ${name}.`);
    result[name] = value;
  }
  if (id === "polyrhythm") {
    for (const [name, fallback] of [["meters", [3, 4]], ["pulses", [2, 3]]]) {
      const values = input[name] === undefined ? fallback : input[name];
      if (!Array.isArray(values) || !values.length || values.length > 4
        || values.some(value => !Number.isInteger(value) || value < (name === "meters" ? 2 : 0) || value > 16)) {
        throw new RangeError(`Invalid polyrhythm preset field: ${name}.`);
      }
      result[name] = values;
    }
  }
  return result;
}

export function normalizeVisualizerConfig(id, config) {
  if (!config || typeof config !== "object" || !config.presets || typeof config.presets !== "object"
    || Array.isArray(config.presets)) throw new TypeError(`Invalid ${id} preset configuration.`);
  return {
    ...config,
    presets: Object.fromEntries(Object.entries(config.presets).map(([name, value]) => [name, normalizePreset(id, value)]))
  };
}
