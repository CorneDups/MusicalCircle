import { SceneEvolution } from "../scene-evolution.js";

export async function checkSceneRendering() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) throw new Error("Use normal motion for scene rendering.");
  const audio = document.querySelector("#audioPlayer");
  if (audio.paused || !Number.isFinite(audio.duration)) throw new Error("Start a loaded song before this check.");
  const update = SceneEvolution.prototype.update;
  const canvas = document.querySelector("#visualizerCanvas");
  const methods = ["scale", "rotate", "moveTo", "lineTo", "arc", "fillRect"];
  const originals = new Map();
  let scene;
  let record;
  try {
    SceneEvolution.prototype.update = function () { scene = this; };
    for (const method of methods) {
      originals.set(method, CanvasRenderingContext2D.prototype[method]);
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas === canvas && record) {
          if (args.some(value => typeof value === "number" && !Number.isFinite(value))) {
            throw new Error("Non-finite scene geometry.");
          }
          if (method === "scale") record.scales.push(args[0]);
          if (method === "rotate") record.rotations.push(args[0]);
          if (method === "fillRect") {
            record.frames++;
            record.fade = this.fillStyle;
          }
          if (method === "moveTo" && new Error().stack.includes("drawLissajous")) record.trails++;
        }
        return originals.get(method).apply(this, args);
      };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!scene) throw new Error("No integrated scene model captured.");
    const rows = [];
    for (const energy of [0.05, 0.6, 0.05]) {
      for (let i = 0; i < 1200; i++) update.call(scene, { available: true, silent: false, energy }, 0.02);
      record = { scales: [], rotations: [], frames: 0, trails: 0, fade: "" };
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!record.frames) throw new Error("No rendered scene frames.");
      rows.push({
        phase: scene.phase, density: scene.density, persistence: scene.persistence,
        expansion: scene.expansion, paletteMix: scene.paletteMix,
        meanScale: record.scales.reduce((sum, value) => sum + value, 0) / record.scales.length,
        trailsPerFrame: record.trails / record.frames, rotations: record.rotations.length, fade: record.fade
      });
    }
    if (!(rows[1].meanScale > rows[0].meanScale && rows[1].density > rows[0].density
      && rows[1].persistence > rows[0].persistence && rows[1].paletteMix > rows[0].paletteMix)) {
      throw new Error("Strong scene did not expand or increase detail/persistence/palette.");
    }
    if (document.querySelector("#visualizerSelect").value === "circle-of-fifths"
      && rows.some(row => row.rotations)) throw new Error("Circle still has shared camera rotation.");
    const slider = document.querySelector("#progress");
    slider.value = "500";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    if (scene.strength !== 0 || scene.phase !== "quiet") throw new Error("Seek did not reset scene memory.");
    return { engine: document.querySelector("#visualizerSelect").value, rows, seekReset: true };
  } finally {
    SceneEvolution.prototype.update = update;
    for (const [method, original] of originals) CanvasRenderingContext2D.prototype[method] = original;
    if (scene) scene.reset();
  }
}
