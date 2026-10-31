import { AdaptiveQuality } from "../visual-comfort.js";

export async function checkLowMotion() {
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) throw new Error("Enable reduced motion before this check.");
  const canvas = document.querySelector("#visualizerCanvas");
  const methods = ["clearRect", "arc", "moveTo", "lineTo", "quadraticCurveTo", "rotate", "scale"];
  const originals = new Map();
  const frames = [];
  let frame = null;
  try {
    for (const method of methods) {
      originals.set(method, CanvasRenderingContext2D.prototype[method]);
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas === canvas) {
          if (method === "clearRect") {
            frame = [];
            frames.push(frame);
          } else if (frame) {
            if (args.some(value => !Number.isFinite(value))) throw new Error("Invalid low-motion geometry.");
            frame.push([method, ...args]);
          }
        }
        return originals.get(method).apply(this, args);
      };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    const completed = frames.slice(1, -1);
    if (completed.length < 2 || !completed[0].length) throw new Error("No low-motion scene was captured.");
    if (completed.some(sample => JSON.stringify(sample) !== JSON.stringify(completed[0]))) {
      throw new Error("Low-motion geometry moved between frames.");
    }
    if (completed[0].some(([method]) => method === "rotate" || method === "scale")) {
      throw new Error("Low-motion scene used camera rotation or zoom.");
    }
    const artwork = getComputedStyle(document.querySelector(".artwork-disc"));
    if (artwork.animationName !== "none") throw new Error("Artwork animation remained active.");
    return { frames: completed.length, geometryCommands: completed[0].length, stationary: true, artworkAnimation: artwork.animationName };
  } finally {
    for (const [method, original] of originals) CanvasRenderingContext2D.prototype[method] = original;
  }
}

export async function checkAdaptiveRendering() {
  if (document.querySelector("#visualizerSelect").value !== "lissajous"
    || matchMedia("(prefers-reduced-motion: reduce)").matches) throw new Error("Use normal-motion Lissajous for this check.");
  const update = AdaptiveQuality.prototype.update;
  const moveTo = CanvasRenderingContext2D.prototype.moveTo;
  let quality;
  let reduced = false;
  let before = 0;
  let after = 0;
  try {
    CanvasRenderingContext2D.prototype.moveTo = function (...args) {
      if (new Error().stack.includes("drawLissajous")) {
        if (reduced) after += 1;
        else before += 1;
      }
      return moveTo.apply(this, args);
    };
    AdaptiveQuality.prototype.update = function (...args) {
      quality = this;
      return update.apply(this, args);
    };
    await new Promise(resolve => setTimeout(resolve, 200));
    if (!quality) throw new Error("No integrated quality model was captured.");
    quality.level = 0;
    quality.resetTiming();
    before = 0;
    await new Promise(resolve => setTimeout(resolve, 250));
    for (let index = 0; index < 190; index += 1) update.call(quality, 1 / 30, 2);
    reduced = true;
    await new Promise(resolve => setTimeout(resolve, 250));
    if (quality.level !== 2 || !(after < before)) throw new Error("Quality did not reduce rendered trail count.");
    return { level: quality.level, beforeTrailPaths: before, afterTrailPaths: after, volume: document.querySelector("audio").volume };
  } finally {
    AdaptiveQuality.prototype.update = update;
    CanvasRenderingContext2D.prototype.moveTo = moveTo;
    if (quality) {
      quality.level = 0;
      quality.resetTiming();
    }
  }
}
