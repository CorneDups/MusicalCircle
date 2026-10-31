import { AudioAnalysis } from "../audio-analysis.js";
import { TempoTracker } from "../musical-features.js";

// Run locally in a browser; Node has no native Web Audio implementation.
export async function checkWebAudio(sampleIntervalMs = 16) {
  const context = new AudioContext();
  try {
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    const mute = context.createGain();
    mute.gain.value = 0;
    analyser.connect(mute);
    mute.connect(context.destination);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const waveform = new Float32Array(analyser.fftSize);
    const analysis = new AudioAnalysis(context.sampleRate, analyser.fftSize);
    const bandResults = [];
    for (const [frequency, expected] of [[80, "bass"], [1000, "mids"], [8000, "treble"]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.2;
      oscillator.connect(gain);
      gain.connect(analyser);
      analysis.reset();
      oscillator.start();
      let previous = context.currentTime;
      const end = previous + 0.4;
      while (context.currentTime < end) {
        await new Promise(resolve => setTimeout(resolve, sampleIntervalMs));
        analyser.getFloatFrequencyData(spectrum);
        analyser.getFloatTimeDomainData(waveform);
        const time = context.currentTime;
        analysis.update(spectrum, waveform, time - previous);
        previous = time;
      }
      oscillator.stop();
      gain.disconnect();
      const metrics = { ...analysis.metrics };
      if (["bass", "mids", "treble"].some(key => key !== expected && metrics[key] >= metrics[expected])) {
        throw new Error(`${frequency} Hz did not activate ${expected} most strongly.`);
      }
      bandResults.push({ frequency, expected, metrics });
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    analysis.reset();
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.012), context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 123;
    for (let i = 0; i < data.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 2147483648 - 1) * Math.exp(-i / (context.sampleRate * 0.003));
    }
    const references = [];
    const start = context.currentTime + 0.3;
    for (let i = 0; i < 20; i += 1) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      references.push(start + i * 0.5);
      source.start(references[i]);
    }
    const events = [];
    const tempo = new TempoTracker();
    let previous = context.currentTime;
    while (context.currentTime < references.at(-1) + 1) {
      await new Promise(resolve => setTimeout(resolve, sampleIntervalMs));
      analyser.getFloatFrequencyData(spectrum);
      analyser.getFloatTimeDomainData(waveform);
      const time = context.currentTime;
      if (analysis.update(spectrum, waveform, time - previous).onset) events.push(time);
      tempo.update(time, analysis.metrics.onset, true);
      previous = time;
    }
    const latencies = [];
    let missed = 0;
    let extras = 0;
    for (const reference of references) {
      const matches = events.filter(time => time >= reference && time < reference + 0.5);
      if (!matches.length) missed += 1;
      else latencies.push((matches[0] - reference) * 1000);
      extras += Math.max(0, matches.length - 1);
    }
    extras += events.filter(time => time < references[0] || time >= references.at(-1) + 0.5).length;
    latencies.sort((a, b) => a - b);
    const latencyP95Ms = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];
    if (missed > 1 || extras > 1 || !(latencyP95Ms <= 80)) {
      throw new Error(`Onset targets missed: ${JSON.stringify({ missed, extras, latencyP95Ms })}`);
    }
    if (analysis.metrics.onset || !analysis.metrics.silent) {
      throw new Error("The silent tail did not settle.");
    }
    if (tempo.beats(context.currentTime) === null || Math.abs(60 / tempo.period - 120) > 2) {
      throw new Error("Click train did not acquire a confident 120 BPM pulse estimate.");
    }
    return {
      sampleRate: context.sampleRate, sampleIntervalMs, bandResults,
      expectedClicks: references.length, detectedEvents: events.length,
      missed, extras, latencyP95Ms, silentTail: analysis.metrics.silent,
      estimatedBpm: 60 / tempo.period, tempoConfidence: tempo.confidence
    };
  } finally {
    await context.close();
  }
}
