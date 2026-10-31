export const SILENCE_RMS = 0.001;
export const MAX_NORMALIZATION_GAIN = 4;
export const MAX_FRAME_GAP = 0.1;

export function frequencyBins(sampleRate, fftSize, lowHz, highHz) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(fftSize)
    || fftSize < 2 || fftSize % 2 || !Number.isFinite(lowHz) || !Number.isFinite(highHz)
    || lowHz < 0 || highHz <= lowHz) {
    throw new RangeError("Invalid frequency band or audio format.");
  }
  const end = Math.min(fftSize / 2, Math.ceil(highHz * fftSize / sampleRate));
  return { start: Math.min(end, Math.max(1, Math.ceil(lowHz * fftSize / sampleRate))), end };
}

export function envelope(previous, target, seconds, attack = 0.03, release = 0.18) {
  const duration = target > previous ? attack : release;
  return target + (previous - target) * Math.exp(-seconds / duration);
}

export function frameFade(alphaAt60Hz, seconds) {
  return 1 - Math.pow(1 - alphaAt60Hz, seconds * 60);
}

export class SampleClock {
  constructor() {
    this.elapsed = 0;
  }

  reset() {
    this.elapsed = 0;
  }

  advance(seconds, interval) {
    if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError("Invalid sampling interval.");
    }
    if (seconds > MAX_FRAME_GAP) {
      this.reset();
      return 0;
    }
    this.elapsed += seconds;
    const count = Math.floor((this.elapsed + 1e-9) / interval);
    this.elapsed = Math.max(0, this.elapsed - count * interval);
    return count;
  }
}

export class AudioAnalysis {
  constructor(sampleRate, fftSize) {
    this.bands = [
      frequencyBins(sampleRate, fftSize, 30, 250),
      frequencyBins(sampleRate, fftSize, 250, 4000),
      frequencyBins(sampleRate, fftSize, 4000, 16000)
    ];
    this.magnitudes = new Float32Array(fftSize / 2);
    this.previousSpectrum = new Float32Array(fftSize / 2);
    this.fluxHistory = new Float32Array(200);
    this.fluxTimes = new Float64Array(200);
    this.reset();
  }

  reset() {
    this.metrics = {
      available: false, silent: true, rms: 0, gain: 1,
      bass: 0, mids: 0, treble: 0, energy: 0, beat: 0, onset: false
    };
    this.reference = 0.18;
    this.time = 0;
    this.lastOnset = -Infinity;
    this.resetSpectrum();
  }

  resetSpectrum() {
    this.primed = false;
    this.historyIndex = 0;
    this.historyCount = 0;
    this.previousSpectrum.fill(0);
    this.fluxHistory.fill(0);
    this.fluxTimes.fill(0);
  }

  update(spectrumDb, waveform, seconds, available = true) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid analysis elapsed time.");
    if (available && (spectrumDb?.length !== this.magnitudes.length || !waveform?.length)) {
      throw new RangeError("Audio samples do not match the analysis format.");
    }
    if (seconds > MAX_FRAME_GAP) {
      this.reset();
      seconds = 0;
    }
    this.time += seconds;
    const metrics = this.metrics;
    metrics.available = available;
    metrics.onset = false;
    let sum = 0;
    if (available) {
      for (const value of waveform) {
        if (!Number.isFinite(value)) throw new RangeError("Invalid waveform sample.");
        sum += value * value;
      }
    }
    metrics.rms = available ? Math.sqrt(sum / waveform.length) : 0;
    metrics.silent = metrics.rms < SILENCE_RMS;
    let bass = 0;
    let mids = 0;
    let treble = 0;
    let energy = 0;

    if (available) {
      let flux = 0;
      for (let bin = 0; bin < spectrumDb.length; bin += 1) {
        if (Number.isNaN(spectrumDb[bin]) || spectrumDb[bin] === Infinity) {
          throw new RangeError("Invalid spectral sample.");
        }
        const magnitude = bin === 0 ? 0 : Math.pow(10, spectrumDb[bin] / 20);
        this.magnitudes[bin] = magnitude;
        flux += Math.max(0, magnitude - this.previousSpectrum[bin]);
      }
      flux /= this.magnitudes.length;
      let total = 0;
      let squared = 0;
      let count = 0;
      for (let i = 0; i < this.historyCount; i += 1) {
        if (this.time - this.fluxTimes[i] > 1) continue;
        total += this.fluxHistory[i];
        squared += this.fluxHistory[i] ** 2;
        count += 1;
      }
      const mean = count ? total / count : 0;
      const deviation = Math.sqrt(Math.max(0, count ? squared / count - mean * mean : 0));
      const threshold = Math.max(0.00008, mean * 1.5 + deviation * 1.5);
      if (this.primed && !metrics.silent && flux > threshold && this.time - this.lastOnset >= 0.12) {
        metrics.onset = true;
        metrics.beat = Math.max(metrics.beat, Math.min(1, flux / (threshold * 3)));
        this.lastOnset = this.time;
      }
      this.previousSpectrum.set(this.magnitudes);
      this.primed = true;
      this.fluxHistory[this.historyIndex] = flux;
      this.fluxTimes[this.historyIndex] = this.time;
      this.historyIndex = (this.historyIndex + 1) % this.fluxHistory.length;
      this.historyCount = Math.min(this.historyCount + 1, this.fluxHistory.length);

      if (!metrics.silent) {
        this.reference = envelope(this.reference, metrics.rms, seconds, 3, 8);
        metrics.gain = Math.min(MAX_NORMALIZATION_GAIN, 0.3 / Math.max(0.03, this.reference));
        const levels = this.bands.map(({ start, end }) => {
          let power = 0;
          for (let bin = start; bin < end; bin += 1) power += this.magnitudes[bin] ** 2;
          return Math.min(1, Math.sqrt(power) * 2 * metrics.gain);
        });
        [bass, mids, treble] = levels;
        energy = Math.min(1, metrics.rms * metrics.gain);
      }
    } else {
      this.resetSpectrum();
    }

    metrics.bass = envelope(metrics.bass, bass, seconds, 0.04, 0.2);
    metrics.mids = envelope(metrics.mids, mids, seconds, 0.05, 0.22);
    metrics.treble = envelope(metrics.treble, treble, seconds, 0.025, 0.16);
    metrics.energy = envelope(metrics.energy, energy, seconds, 0.05, 0.25);
    if (!metrics.onset) metrics.beat = envelope(metrics.beat, 0, seconds, 0.01, 0.2);
    return metrics;
  }
}
