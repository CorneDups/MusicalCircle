import { envelope, MAX_FRAME_GAP } from "./audio-analysis.js";

export const MAX_WAVES = 4;
export const MAX_SPARKS = 48;
export const WAVE_LIFETIME = 0.75;
export const MAX_SPARK_RATE = 18;

export function responseAmplitude(value, intensity) {
  return Math.max(0, Math.min(1, value)) * Math.max(0.5, Math.min(2, intensity));
}

export function waveformOffset(sample, gain, intensity, position) {
  return Math.max(-1, Math.min(1, sample * gain)) * 0.018 * intensity
    * Math.sin(position * Math.PI) ** 2;
}

export class VisualEffects {
  constructor(seed = 123) {
    this.initialSeed = seed;
    this.reset();
  }

  reset() {
    this.seed = this.initialSeed;
    this.waves = [];
    this.sparks = [];
    this.time = 0;
    this.lastWave = -Infinity;
    this.sparkBudget = 0;
    this.bass = 0;
    this.artwork = 0;
    this.energy = 0;
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  update(metrics, seconds, reducedMotion = false) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid effects elapsed time.");
    if (seconds > MAX_FRAME_GAP) {
      this.reset();
      seconds = 0;
    }
    this.time += seconds;
    const active = metrics.available && !metrics.silent;
    const moving = active && !reducedMotion;
    this.energy = envelope(this.energy, active ? metrics.energy : 0, seconds, 0.12, 0.3);
    this.bass = envelope(this.bass, moving ? metrics.bass : 0, seconds, 0.35, 0.6);
    const pulse = moving ? Math.min(1, metrics.energy * 0.35 + metrics.beat * 0.65) : 0;
    this.artwork = envelope(this.artwork, pulse, seconds, 0.02, 0.2);

    if (!metrics.available || reducedMotion) {
      this.waves.length = 0;
      this.sparks.length = 0;
      this.sparkBudget = 0;
      return;
    }
    for (const wave of this.waves) wave.age += seconds;
    this.waves = this.waves.filter(wave => wave.age < WAVE_LIFETIME);
    for (const spark of this.sparks) spark.age += seconds;
    this.sparks = this.sparks.filter(spark => spark.age < spark.life);

    if (moving && metrics.onset && this.time - this.lastWave >= 0.12
      && this.waves.length < MAX_WAVES) {
      this.waves.push({ age: 0, strength: Math.max(0.2, Math.min(1, metrics.beat)) });
      this.lastWave = this.time;
    }

    const treble = moving ? Math.max(0, Math.min(1, (metrics.treble - 0.01) / 0.06)) : 0;
    this.sparkBudget += seconds * MAX_SPARK_RATE * treble * Math.min(1, this.energy * 4);
    while (this.sparkBudget >= 1) {
      this.sparkBudget -= 1;
      if (this.sparks.length >= MAX_SPARKS) continue;
      this.sparks.push({
        angle: this.random() * Math.PI * 2,
        radius: 0.39 + this.random() * 0.045,
        speed: 0.01 + this.random() * 0.02,
        drift: (this.random() - 0.5) * 0.22,
        life: 0.3 + this.random() * 0.35,
        strength: 0.3 + treble * 0.7,
        age: 0
      });
    }
    if (!moving) this.sparkBudget = 0;
  }
}
