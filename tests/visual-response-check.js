import { AudioAnalysis } from "../audio-analysis.js";
import { HarmonicAnalysis } from "../musical-features.js";

export async function captureVisualResponse() {
  const audio = document.querySelector("#audioPlayer");
  const canvas = document.querySelector("#visualizerCanvas");
  if (audio.paused) throw new Error("Start a song before checking renderer response.");
  const originalUpdate = AudioAnalysis.prototype.update;
  const originalFrequency = AnalyserNode.prototype.getByteFrequencyData;
  const originalFloatFrequency = AnalyserNode.prototype.getFloatFrequencyData;
  const originalHarmonicUpdate = HarmonicAnalysis.prototype.update;
  const methods = ["arc", "moveTo", "lineTo", "quadraticCurveTo"];
  const originals = new Map();
  const records = {};
  const metrics = {
    available: true, silent: false, rms: 0.2, gain: 1,
    bass: 0.4, mids: 0.4, treble: 0.4, energy: 0.4, beat: 0.4, onset: false
  };
  const engines = ["drawCircleOfFifths", "drawLissajous", "drawTonnetz", "drawPolyrhythm", "drawSpectralTerrain"];
  try {
    AudioAnalysis.prototype.update = function (spectrum, waveform) {
      if (waveform) {
        for (let i = 0; i < waveform.length; i += 1) waveform[i] = 0.3 * Math.sin(i * 0.1);
      }
      return metrics;
    };
    AnalyserNode.prototype.getByteFrequencyData = function (values) {
      values.fill(128);
    };
    AnalyserNode.prototype.getFloatFrequencyData = function (values) {
      values.fill(-50);
    };
    HarmonicAnalysis.prototype.update = function () {
      this.chroma.fill(0.4);
      this.confidence = 1;
    };
    await new Promise(resolve => setTimeout(resolve, 200));
    for (const method of methods) {
      originals.set(method, CanvasRenderingContext2D.prototype[method]);
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas === canvas) {
          if (args.slice(0, method === "arc" ? 5 : method === "quadraticCurveTo" ? 4 : 2)
            .some(value => !Number.isFinite(value))) {
            throw new Error("Non-finite renderer geometry.");
          }
          if (method === "arc" && args[2] < 0) throw new Error("Negative renderer radius.");
          const stack = new Error().stack;
          const engine = engines.find(name => stack.includes(name));
          if (engine) {
            records[engine] ||= { arcs: [], moves: [], lines: [], paths: [] };
            if (method !== "quadraticCurveTo") {
              records[engine][method === "arc" ? "arcs" : method === "moveTo" ? "moves" : "lines"].push(args.slice(0, 3));
            }
            if (method === "moveTo") records[engine].paths.push([args.slice(0, 2)]);
            if (method === "lineTo") records[engine].paths.at(-1)?.push(args.slice(0, 2));
          }
        }
        return originals.get(method).apply(this, args);
      };
    }
    await new Promise(resolve => setTimeout(resolve, 70));
    const engine = engines.find(name => records[name]);
    if (!engine) throw new Error("No active renderer was captured.");
    const record = records[engine];
    const rectangle = document.querySelector("#musicCircle").getBoundingClientRect();
    const size = Math.min(rectangle.width, rectangle.height);
    let amplitude;
    if (engine === "drawLissajous") {
      const xs = record.lines.map(point => point[0]);
      amplitude = Math.max(...xs) - Math.min(...xs);
    } else if (engine === "drawSpectralTerrain") {
      amplitude = size * 0.77 - Math.min(...record.paths.at(-1).map(point => point[1]));
    } else {
      amplitude = Math.max(...record.arcs.filter(point => point[2] < size * 0.1).map(point => point[2]));
    }
    const result = {
      engine, amplitude, finiteGeometry: true,
      artworkScale: Number(document.querySelector("#centrePlayer").style.getPropertyValue("--artwork-scale")),
      volume: audio.volume, intensity: new URLSearchParams(location.search).get("intensity")
    };
    if (!(amplitude > 0)) throw new Error("No measurable renderer response.");
    return result;
  } finally {
    AudioAnalysis.prototype.update = originalUpdate;
    AnalyserNode.prototype.getByteFrequencyData = originalFrequency;
    AnalyserNode.prototype.getFloatFrequencyData = originalFloatFrequency;
    HarmonicAnalysis.prototype.update = originalHarmonicUpdate;
    for (const [method, original] of originals) CanvasRenderingContext2D.prototype[method] = original;
  }
}
