import { HarmonicAnalysis, TempoTracker, TEMPO_CONFIDENCE } from "../musical-features.js";

export async function checkHarmonics() {
  const context = new AudioContext();
  try {
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    const mute = context.createGain();
    mute.gain.value = 0;
    analyser.connect(mute);
    mute.connect(context.destination);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const results = [];
    const fixtures = [
      { name: "A bass with overtones", frequencies: [110, 220, 330, 440], expected: [9] },
      { name: "C/E/G triad", frequencies: [261.6256, 329.6276, 391.9954], expected: [0, 4, 7] },
      { name: "Broadband noise", frequencies: [], expected: [] }
    ];
    for (const fixture of fixtures) {
      const sources = [];
      const gain = context.createGain();
      gain.gain.value = 0.15;
      gain.connect(analyser);
      if (fixture.frequencies.length) {
        for (const frequency of fixture.frequencies) {
          const source = context.createOscillator();
          source.frequency.value = frequency;
          source.connect(gain);
          source.start();
          sources.push(source);
        }

      } else {
        const source = context.createBufferSource();
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 123;
        for (let index = 0; index < data.length; index += 1) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          data[index] = seed / 2147483648 - 1;
        }
        source.buffer = buffer;
        source.connect(gain);
        source.start();
        sources.push(source);
      }
      const features = new HarmonicAnalysis(context.sampleRate, analyser.fftSize);
      let previous = context.currentTime;
      const end = previous + 1.2;
      while (context.currentTime < end) {
        await new Promise(resolve => setTimeout(resolve, 50));
        analyser.getFloatFrequencyData(spectrum);
        features.analyse(spectrum);
        features.update(context.currentTime - previous, true);
        previous = context.currentTime;
      }
      for (const source of sources) source.stop();
      gain.disconnect();
      const strongest = [...features.chroma].map((value, index) => ({ value, index }))
        .sort((a, b) => b.value - a.value).slice(0, fixture.expected.length).map(item => item.index).sort((a, b) => a - b);
      if (fixture.expected.length && (JSON.stringify(strongest) !== JSON.stringify(fixture.expected)
        || features.confidence < 0.5)) throw new Error(`${fixture.name}: harmonic identification failed.`);
      if (!fixture.expected.length && features.confidence >= 0.35) throw new Error("Broadband noise looked confident.");
      results.push({ fixture: fixture.name, strongest, confidence: features.confidence });
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return { sampleRate: context.sampleRate, results };
  } finally {
    await context.close();
  }
}

function clickWave() {
  const rate = 48000;
  const length = rate * 12;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  let seed = 123;
  for (let click = 0; click < 20; click += 1) {
    for (let index = 0; index < rate * 0.012; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const value = (seed / 2147483648 - 1) * Math.exp(-index / (rate * 0.003));
      view.setInt16(44 + 2 * (Math.floor((0.5 + click * 0.5) * rate) + index), Math.round(value * 24000), true);
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function checkPlayerPulse() {
  const audio = document.querySelector("#audioPlayer");
  if (audio.paused || !document.querySelector("#visualStyleBadge").textContent.startsWith("Polyrhythm")) {
    throw new Error("Start a song with the polyrhythm engine before checking the player pulse.");
  }
  const source = audio.currentSrc;
  const position = audio.currentTime;
  const originalUpdate = TempoTracker.prototype.update;
  const originalArc = CanvasRenderingContext2D.prototype.arc;
  const records = [];
  let tracker;
  let maxConfidence = 0;
  let onsets = 0;
  const url = URL.createObjectURL(clickWave());
  try {
    TempoTracker.prototype.update = function (...args) {
      const result = originalUpdate.apply(this, args);
      tracker = this;
      if (args[1]) onsets += 1;
      maxConfidence = Math.max(maxConfidence, this.confidence);
      return result;
    };
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (args[3] === -Math.PI / 2 && new Error().stack.includes("drawSongPlayhead")) {
        records.push({
          angle: args[4], radius: args[2], position: audio.currentTime,
          period: tracker.period, anchor: tracker.anchor, transform: this.getTransform()
        });
      }
      return originalArc.apply(this, args);
    };
    audio.src = url;
    audio.load();
    await audio.play();
    await new Promise(resolve => setTimeout(resolve, 11000));
    if (!(maxConfidence >= TEMPO_CONFIDENCE) || !records.length || Math.abs(60 / tracker.period - 120) > 2) {
      throw new Error("The player did not acquire and draw a confident 120 BPM pulse.");
    }
    const radii = [...new Set(records.map(record => record.radius))].sort((a, b) => a - b);
    const meters = [3, 4];
    // This fixture check deliberately uses the default 3/4 preset.
    if (radii.length !== meters.length) throw new Error("Use the default polyrhythm preset for this check.");
    let maximumAngleError = 0;
    for (const record of records) {
      const meter = meters[radii.indexOf(record.radius)];
      const beats = (record.position - record.anchor) / record.period;
      const phase = ((beats % meter) + meter) % meter / meter;
      maximumAngleError = Math.max(maximumAngleError, Math.abs(record.angle - (-Math.PI / 2 + phase * Math.PI * 2)));
      if (record.transform.b !== 0 || record.transform.c !== 0) throw new Error("Song playhead inherited decorative rotation.");
    }
    if (maximumAngleError > 0.03) throw new Error("Playhead angle did not match playback position and timing anchor.");
    return {
      onsets, estimatedBpm: 60 / tracker.period, confidence: tracker.confidence,
      maxConfidence, cursorArcs: records.length, maximumAngleError
    };
  } finally {
    TempoTracker.prototype.update = originalUpdate;
    CanvasRenderingContext2D.prototype.arc = originalArc;
    audio.pause();
    audio.src = source;
    audio.load();
    URL.revokeObjectURL(url);
    await audio.play();
    audio.currentTime = position;
  }
}
