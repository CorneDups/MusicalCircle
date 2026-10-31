export const CONTROLS_IDLE_MS = 3000;

export function controlsCanHide(immersive, focused, fallbackOpen) {
  return immersive && !focused && !fallbackOpen;
}

export class AdaptiveQuality {
  constructor() {
    this.level = 0;
    this.resetTiming();
  }

  resetTiming() {
    this.slow = 0;
    this.healthy = 0;
  }

  update(seconds, drawMilliseconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(drawMilliseconds) || drawMilliseconds < 0) {
      throw new RangeError("Invalid rendering performance sample.");
    }
    if (seconds > 0.1) {
      this.resetTiming();
      return;
    }
    const slow = seconds > 0.025 || drawMilliseconds > 12;
    const healthy = seconds <= 0.02 && drawMilliseconds < 8;
    this.slow = slow ? this.slow + seconds : 0;
    this.healthy = healthy ? this.healthy + seconds : 0;
    if (this.slow >= 3 && this.level < 2) {
      this.level += 1;
      this.resetTiming();
    } else if (this.healthy >= 10 && this.level > 0) {
      this.level -= 1;
      this.resetTiming();
    }
  }

  get decorationScale() {
    return [1, 0.7, 0.4][this.level];
  }
}
