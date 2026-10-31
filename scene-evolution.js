import { envelope, MAX_FRAME_GAP } from "./audio-analysis.js";

const STRENGTH = { quiet: 0, building: 0.6, strong: 1, settling: 0.25 };

export class SceneEvolution {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = "quiet";
    this.energy = 0;
    this.strength = 0;
    this.candidate = null;
    this.evidence = 0;
  }

  update(metrics, seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(metrics.energy)) {
      throw new RangeError("Invalid scene energy or elapsed time.");
    }
    if (seconds > MAX_FRAME_GAP) {
      this.reset();
      return;
    }
    const energy = metrics.available && !metrics.silent ? Math.max(0, Math.min(1, metrics.energy)) : 0;
    this.energy = envelope(this.energy, energy, seconds, 1.5, 2.5);
    let next = null;
    if (this.phase === "quiet" && this.energy > 0.24) next = "building";
    if (this.phase === "building") {
      if (this.energy > 0.36) next = "strong";
      else if (this.energy < 0.16) next = "settling";
    }
    if (this.phase === "strong" && this.energy < 0.28) next = "settling";
    if (this.phase === "settling") {
      if (this.energy > 0.28) next = "building";
      else if (this.energy < 0.18) next = "quiet";
    }
    if (next !== this.candidate) {
      this.candidate = next;
      this.evidence = 0;
    }
    this.evidence = next ? this.evidence + seconds : 0;
    if (this.evidence >= 2) {
      this.phase = next;
      this.candidate = null;
      this.evidence = 0;
    }
    this.strength = envelope(this.strength, STRENGTH[this.phase], seconds, 3, 4);
  }

  get density() { return 0.65 + this.strength * 0.7; }
  get persistence() { return 0.75 + this.strength * 0.6; }
  get expansion() { return 1 + this.strength * 0.035; }
  get paletteMix() { return 0.15 + this.strength * 0.7; }
}
