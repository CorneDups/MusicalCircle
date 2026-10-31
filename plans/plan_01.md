# Plan 01: A more immersive, musically connected Music Orbit

## 1. Objective

Make listeners feel that they are experiencing the song through light, shape,
motion, and visual memory, rather than watching an animation alongside playback.

The first priority is accurate, responsive musical mapping. More effects and a
different rendering technology are not substitutes for synchronization.

This document contains the execution plan and validation records for completed
phases. The original baseline findings came from source review; the execution
records distinguish browser measurements from unverified human perception.

### Intended experience

- Drum-like onsets create recognizable visual events.
- Sustained sounds produce continuous, slowly evolving shapes.
- Quiet passages remain expressive without amplifying silence or noise.
- Builds increase visual tension gradually; releases settle gracefully.
- Each album retains its palette and visual identity.
- Listeners can choose an immersive view without losing playback controls.
- Motion remains comfortable, accessible, and performant.

### Constraints

- Preserve the static, browser-local architecture and GitHub Pages support.
- Keep audio analysis local; do not upload audio or introduce remote services.
- Start with Canvas 2D and the existing five visualizer IDs.
- Preserve playback, artwork fallbacks, album sorting, natural track sorting,
  autoplay, volume, seeking, Media Session behavior, and shared song links.
- Keep existing album configurations valid.
- Avoid unrelated refactors and changes to the music collection.
- Do not hand-edit generated `songs.js`, `songs.json`, or `_site` output.
- Do not introduce dependencies until an implementation requirement justifies them.

## 2. Baseline findings and relevant code

| Area | Current behavior | Execution implication |
|---|---|---|
| Audio graph | `ensureAudioGraph` uses FFT size 512 and smoothing 0.82. | Separate transient and harmonic analysis instead of tuning one analyser for both. |
| Frequency bands | `analyserValues` uses percentages of FFT bins. At typical sample rates, the bass band reaches approximately 1.6-1.8 kHz. | Define frequency boundaries in Hz using the actual sample rate. |
| Beat metric | Positive bass change against a smoothed previous value. | Replace with adaptive onset detection; do not call it tempo tracking. |
| Pitch classes | `pitchClassEnergy` rounds each FFT bin to a MIDI pitch class. | Improve frequency resolution and peak selection before enhancing harmonic claims. |
| Drawing | `drawVisualizer` reads some metrics before updating analysis; several draw functions independently read theme colors. | Analyze once before rendering and cache theme colors on theme changes. |
| Rhythm wheels | `drawPolyrhythm` uses animation timestamp and preset speed. | Separate decorative rotation from music-synchronized playhead timing. |
| Artwork | CSS pulse has a fixed 4.8-second period; rotation has a fixed 26-second period. | Make pulse audio-driven; preserve slow rotation as an intentional aesthetic mode. |
| Timing | Smoothing, canvas fade, and terrain sampling depend on frame count. | Use elapsed-time-based envelopes, fading, and history sampling. |
| Intensity | Lissajous applies album intensity; the other active engines do not. | Define and test intensity behavior for every engine and shared effect layer. |
| Playback state | Terrain history is cleared on album presentation, not on every track change or seek. Paused analysis substitutes synthetic values. | Introduce explicit analysis lifecycle and distinguish idle animation from measured audio. |
| Accessibility | CSS honors reduced motion, but the JavaScript canvas loop does not. | Implement a low-motion canvas mode as well as CSS handling. |
| Reusable effects | `drawRadialBars`, `drawWaveRing`, and `drawConstellation` exist but are not in the active renderer map. | Reuse useful geometry; do not duplicate it or silently add new public visualizer IDs. |
| Configuration | Browser and generator both normalize album settings; browser track normalization retains only file, title, artist, and artwork. | Wire any new configuration through both generation and runtime normalization. |
| Deployment | The build explicitly copies application files and the `visualizers` directory. | Any new runtime file must be included in the build and HTML load order. |

Primary surfaces:

- [Application logic](../app.js): audio graph, analysis, rendering, state, and events.
- [Layout](../index.html): visualizer canvas and controls.
- [Styling](../styles.css): circular stage, artwork motion, responsive layout,
  and reduced-motion rules.
- [Presets](../visualizers/): geometry and variation for the five engines.
- [Manifest generator](../scripts/generate-song-list.mjs): album and track settings.
- [Build script](../scripts/build-site.mjs): deployment file inclusion.
- [Package scripts](../package.json): existing generation, preview, and build commands.
- [User documentation](../README.md): configuration and listening controls.

## 3. Implementation strategy

Use one analysis result per update, shared by all visual layers. Keep renderers
concerned with drawing rather than independently detecting musical features.

Suggested conceptual result:

```text
measured audio available
elapsed time
RMS level / silence state
bass, mids, treble
normalized overall energy
onset event and decaying onset envelope
waveform samples
smoothed chroma and harmonic confidence
optional tempo, beat phase, and tempo confidence
```

This is a data contract, not a requirement to introduce a framework or many files.
Keep small helpers in the existing application initially. Extract a focused,
dependency-free analysis module only if needed for reuse and deterministic tests.
If extracted, wire it into the build and page loading.

### Audio graph and sampling

- Keep exactly one `MediaElementAudioSourceNode` per audio element.
- Feed analysis nodes in parallel while keeping exactly one audible route to the
  destination. Do not connect multiple analyser branches to the destination and
  accidentally multiply playback output.
- Start transient analysis with FFT size 1024 or 2048 and little or no analyser
  smoothing. Measure responsiveness rather than choosing by appearance.
- Start harmonic analysis at FFT size 8192, evaluated less frequently than drawing.
  A larger FFT improves resolution but does not guarantee accurate bass-note or
  chord recognition.
- Obtain time-domain samples for RMS and the waveform halo.
- Reuse typed arrays and bound history buffers.
- Use actual sample rate for all frequency-to-bin conversion.

### Musical interpretation limits

- Frequency bands are artistic control signals, not separated instruments.
- Chroma is an estimate, not proof of a chord, key, or emotional state.
- A Euclidean wheel is a configured pattern, not a detected polyrhythm.
- Sustained energy changes are not reliable verse/chorus recognition.
- When confidence is insufficient, keep the scene expressive without displaying
  unsupported musical labels or inventing a beat.

## 4. Phased execution

### Phase 0: Establish a reproducible baseline

**Dependencies:** None.

**Status:** Executed on 2026-10-31. See Section 10 for the recorded baseline,
user-identified reference tracks, reproduction procedure, and validation limits.

1. Inspect the current worktree and preserve unrelated local changes.
2. Select representative existing tracks: sparse acoustic, percussion-heavy,
   ambient/sustained, and a track with a clear build and release.
3. Run the local preview and inspect all five visualizers on desktop and mobile
   viewport sizes.
4. Record browser/device, sample rate, frame-time baseline, and observed issues.
   Use session notes or the implementation summary; no additional committed
   planning files are required.
5. Check existing playback and shared-link flows before changing them.

**Exit criteria:** Baseline observations and representative tracks are recorded;
source-level findings are distinguished from listening observations.

### Phase 1: Correct analysis, timing, and lifecycle

**Dependencies:** Phase 0.

**Status:** Implemented on 2026-10-31. See Section 11 for changes, validation,
and the boundaries of the completed work.

**Affected surfaces:** `app.js`; a focused analysis/test module only if justified.

1. Define initial non-overlapping analysis bands:
   - Bass: 30-250 Hz.
   - Mids: 250-4000 Hz.
   - Treble: 4000-16000 Hz, bounded by the Nyquist frequency.
   - Exclude DC and handle unavailable bins explicitly.
   These are starting artistic boundaries to validate, not universal definitions.
2. Compute RMS and a documented silence threshold using time-domain data.
3. Implement positive spectral flux using unsmoothed spectral magnitudes:
   - Compare positive bin changes with the preceding analysis sample.
   - Maintain a bounded rolling baseline and adaptive threshold.
   - Require a minimum event spacing, initially approximately 100-150 ms.
   - Produce an event separately from its visible decay envelope.
   - Reset previous spectra after seeks and track changes to avoid false hits.
4. Normalize energy with a slowly adapting reference:
   - Adapt over seconds rather than individual hits.
   - Bound amplification.
   - Do not normalize silence into visible musical activity.
5. Replace per-frame smoothing with attack/release envelopes based on elapsed time.
   Initial response targets: onset attack at most 30 ms after detection and
   approximately 150-350 ms visual release.
6. Analyze before reading metrics used by scene transforms and renderers.
7. Convert trails to elapsed-time-based fading and terrain sampling to fixed-time
   intervals. Use the current 60 Hz look as the initial reference.
8. Separate playback/analysis availability from decorative idle animation:
   - Paused or ended: settle into a calm idle state; do not emit musical hits.
   - Buffering or suspended context: show a neutral state, not fake measured audio.
   - Missing Web Audio support or initialization failure: retain playback where
     possible and explicitly notify the listener that reactive visuals are unavailable.
9. Reset analysis, transient particles, beat estimates, and terrain history on
   track replacement; reset temporal analysis/history after seeking.
10. Resume from hidden-tab or long-frame gaps without integrating a large jump
    or emitting a catch-up burst. Keep playback running when the tab is hidden.

**Exit criteria:** Frequency mapping, onset detection, elapsed-time behavior, and
playback-state tests in Section 6 pass. Existing audio output remains unchanged.

### Phase 2: Add a coherent shared visual response

**Dependencies:** Phase 1.

**Status:** Implemented on 2026-10-31. See Section 12 for changes, measured
validation, and remaining listening/device checks.

**Affected surfaces:** `app.js`, `styles.css`, `visual-effects.js`, focused tests,
the static build copy list, and related README descriptions.

1. Add a waveform-driven breathing halo around the centre artwork.
   - Use time-domain samples, not frequency-bin values pretending to be a waveform.
   - Reuse suitable ring geometry from the existing helpers.
   - Keep amplitude bounded and preserve the control area.
2. Emit expanding shockwaves on detected onsets.
   - Give each wave a finite lifetime, maximum radius, and smooth fade.
   - Bound concurrent waves and merge or suppress excess events.
   - Prefer localized rings to full-screen flashes.
3. Add sparse, short-lived treble sparks near the outer orbit.
   - Bound emission rate and particle count.
   - Use deterministic seeds for repeatable tests.
4. Assign sustained bass to slow shape deformation and overall energy to
   brightness/density, rather than making every element grow together.
5. Replace fixed artwork pulse with the shared audio envelope.
   - `still` remains still.
   - `rotate` retains its intentional slow rotation.
   - Apply motion to the artwork layer, not transport buttons or text.
6. Keep the selected engine visually dominant. Shared effects should support,
   not obscure, its album identity.
7. Make `visualizerIntensity` consistently affect response amplitude in all five
   engines and shared effects. Do not use intensity to change playback volume,
   detected tempo, or confidence thresholds.

**Exit criteria:** The same audible onset creates an obvious, coherent event;
quiet passages are restrained; controls remain readable and clickable;
intensity 0.5, 1, and 2 produces ordered, bounded responses in every engine.

### Phase 3: Upgrade the existing engines

**Dependencies:** Phases 1 and 2. Harmonic improvements precede harmonic visuals.

**Status:** Implemented on 2026-10-31. See Section 13 for feature tests, browser
measurements, intentional behavior changes, and remaining listening checks.

**Affected surfaces:** `app.js`, `musical-features.js`, focused tests, the static
build copy list, files under `visualizers`, and README.

#### Circle of fifths

- Improve chroma using spectral peaks, noise rejection, and harmonic weighting.
- Smooth pitch-class activation and expose confidence for visual gating.
- Connect strongly active classes and introduce translucent petals or ribbons.
- Let harmonic changes reshape the mandala gradually.
- Preserve optional labels; avoid presenting estimated chords as facts.

#### Lissajous

- Preserve preset-defined ratios and explain that they are artistic geometry.
- Introduce bounded waveform and onset modulation without destroying recognizable curves.
- Keep an actual stereo scope optional and deferred: it requires separate
  left/right time-domain sampling and is not the current renderer.

#### Tonnetz

- Use improved chroma to fill harmonic regions softly and leave fading pathways.
- Make low-confidence activity subtle instead of highlighting alleged chords.
- Verify triangular adjacency before adding filled cells, so shading follows
  actual lattice connections.

#### Polyrhythm

- Introduce a confidence-gated tempo estimate from onset timing.
- Separate wheel decoration from a song-timed playhead.
- Use playback position plus an estimated timing anchor for phase; do not use
  the raw animation timestamp as the music clock.
- Do not assume the first onset identifies the downbeat.
- On low confidence, use onset-driven highlights or a clearly described
  free-running artistic mode.
- Reset/reacquire timing on seek and track change.

#### Spectral terrain

- Use logarithmically spaced frequency groups with fixed-time history sampling.
- Add restrained depth shading and frequency-dependent palette variation.
- Allow detected transients to form recognizable traveling ridges.
- Bound history and use the existing preset ridge limits.

**Preset compatibility:**

- Preserve existing visualizer IDs and preset names.
- Preserve `defaultPreset` and current fallback selection behavior.
- Supply compatible defaults for new fields.
- Validate new numeric values, including explicit zero where meaningful.
- Keep advanced tuning in presets instead of exposing many new UI controls.

**Exit criteria:** Every existing preset loads; each engine has a distinct identity;
pitch and rhythm limitations are documented; renderer-specific tests pass.

### Phase 4: Add immersive listening and comfort controls

**Status:** Implemented and validated; see Section 14 for results and limitations.

**Dependencies:** Phase 2; Phase 3 can be delivered separately.

**Affected surfaces:** `index.html`, `styles.css`, `app.js`, README.

1. Add an explicit immersive-view toggle.
   - Expand the scene toward the viewport without requiring browser fullscreen.
   - De-emphasize album information and song buttons only in this mode.
   - Reveal playback controls on pointer activity, touch, and keyboard focus.
   - Never auto-hide focused controls; provide a visible, keyboard-accessible exit.
   - Escape exits immersive view without trapping focus.
2. Add a visualizer selector and intensity control for listening-session overrides.
   - Album changes restore that album's configured defaults.
   - Do not modify source configuration or persist overrides initially.
   - Update the style badge and current preset selection consistently.
3. Implement a JavaScript low-motion mode that honors system reduced motion.
   - Remove continuous camera rotation, large zooms, shockwaves, and particle bursts.
   - Keep soft, bounded color/opacity response or a static scene.
   - Do not let an intensity setting bypass reduced-motion safety.
4. Cache palette values after theme updates.
5. Adapt quality conservatively when sustained frame times are too high:
   - Reduce decorative particles/trails or harmonic update frequency first.
   - Do not change playback, musical timing, or analysis meaning.
   - Do not add a quality settings panel unless testing demonstrates a need.

**Exit criteria:** Desktop/mobile, keyboard, touch, and reduced-motion checks pass;
default browsing remains available and unchanged in purpose.

### Phase 5: Add song-level visual evolution

**Dependencies:** Phases 1-4.

1. Add a slow scene envelope using sustained normalized energy and hysteresis.
2. Use it to control density, trail persistence, and expansion across quiet,
   building, strong, and settling passages.
3. Require sustained evidence before a state change to avoid oscillation.
4. Preserve album colors; blend palette variations slowly rather than randomly.
5. Reset the envelope on track change and re-establish it after seeking.
6. Validate whether automatic evolution is sufficient before adding authored cues.

**Optional follow-up requiring a scope decision:** Per-track timestamped scene
cues for curated songs.

If approved, define the cue schema and seek behavior before implementation.
Wire it through `album.json` track overrides, manifest generation, browser track
normalization, and documentation. Use playback position as the source of truth;
on seeking, select the scene applicable to the destination time rather than
replaying all skipped transitions. Warn explicitly on malformed cue data.

**Exit criteria:** Builds and releases are visibly different without abrupt
flashing, constant scene switching, or unsupported section-recognition claims.

## 5. First implementation slice

Start with a single bounded change covering Phase 1:

1. Establish representative-track baseline.
2. Add Hz-based bands, waveform RMS, and transient spectral flux.
3. Add time-based envelopes and explicit reset behavior.
4. Update the existing renderers to consume the corrected shared metrics.
5. Add deterministic analysis tests and playback-lifecycle checks.
6. Document the corrected analysis and validate deployment inclusion.

Do not combine this first slice with fullscreen UI, authored cues, stereo analysis,
or a replacement rendering engine. Review listening results before Phase 2.

## 6. Validation and measurable acceptance criteria

The following values are initial engineering targets, not already demonstrated
performance. If a target is missed, record the evidence and tune the implementation;
do not silently weaken the target or substitute subjective screenshots.

### Deterministic analysis and timing checks

Use local synthetic buffers or browser-generated audio; do not add copyrighted
reference recordings or upload the music collection.

| Check | Acceptance target |
|---|---|
| Frequency-to-bin conversion | Correct boundaries at both 44.1 kHz and 48 kHz, bounded by available bins. |
| Band separation | 80 Hz, 1000 Hz, and 8000 Hz tones each produce the strongest response in their intended band. |
| Silence | After at most one second of settling, zero input produces no onsets or emitted musical particles. |
| Onsets | On a synthetic 120 BPM click track, at least 95% of clicks yield one event, with no more than 5% extra events after warm-up. |
| Detector latency | At least 95% of detected synthetic clicks are reported within 80 ms of the reference onset in a controlled real-time harness. Measure visual scheduling separately. |
| Normalization | Lower-level non-silent input remains responsive after adaptation; zero input remains inactive; gain stays within the documented bound. |
| Frame-rate independence | Replaying identical timestamped features at 30, 60, and 144 Hz gives envelopes and terrain history timing within 5% at matched elapsed times. |
| Reset | Seek/track replacement clears prior spectra, timing estimates, and history; the first new sample does not generate a stale-data onset. |
| Pitch estimate | Sustained reference tones across several octaves, including 220 and 440 Hz A, activate the expected dominant class after settling. Evaluate harmonic mixtures separately. |
| Tempo, when added | Clean 90, 120, and 150 BPM click tracks converge within 5 seconds to within 3% of reference tempo; silence does not create a confident tempo. |
| Intensity | Measured response amplitude is monotonic at 0.5, 1, and 2 for all five renderers, with finite coordinates and bounded geometry. |

Tempo tests should also include half/double-tempo ambiguity and irregular onsets.
Synthetic success alone does not establish correctness on real music.

### Listening checks

- Percussion-heavy: visible events follow attacks, not an unrelated animation clock.
- Sparse acoustic: sustained detail remains visible without constant explosions.
- Ambient: flowing shapes remain expressive without inventing a steady beat.
- Build/release: density changes gradually and settles after intensity drops.
- All five album styles remain distinct and attractive.
- Pausing clearly changes the scene from musical response to calm idle behavior.

### Playback and deployment regression matrix

- First play, pause/resume, previous/next, and autoplay at album end.
- Rapid song switching and switching albums during playback/loading.
- Seeking forward/backward and seeking while paused.
- Shared-link selection, blocked autoplay, hash changes, and missing shared tracks.
- Audio load failure, missing Web Audio support, and suspended AudioContext.
- Volume changes including mute: explicitly decide and document whether visuals
  follow audible level or a pre-volume signal; default to current audible-level
  behavior unless a separate product decision changes it.
- Embedded artwork, per-song artwork, album cover, and monogram fallbacks.
- All existing preset files and legacy manifest support.
- Browser-tab hiding/resuming without bursts or musical timing drift.
- Desktop and mobile layouts; portrait/landscape; DPR 1 and 2.
- Keyboard/touch controls, focus visibility, and system reduced motion.
- Project-subpath deployment and inclusion of any new runtime assets.

### Performance targets

- On the recorded desktop test device, aim for 60 FPS with visual update/draw
  time at or below a 16.7 ms frame budget for at least 95% of sampled frames.
- On the recorded mobile test device, retain at least 30 FPS with a 33.3 ms
  budget after any quality reduction.
- No unbounded growth of particles, wave events, spectrum history, or caches.
- No audio interruption introduced by analysis or rendering.
- Measure on representative playback, not only an idle scene.

### Commands and tooling

- Use existing repository tooling first; no test runner is currently declared.
- For new pure analysis helpers, prefer the built-in Node test runner with focused
  tests; browser audio/DOM behavior still needs browser validation.
- Check JavaScript syntax with `node --check app.js` and any added module.
- Use `npm run preview` for generation and interactive playback checks.
- Use `npm run build` for deployment validation after runtime changes. It regenerates
  manifests and replaces `_site`; inspect the diff and run it only when safe for
  the current worktree.
- Inspect browser console errors and confirm the chosen preview port is responsive.
- Stop task-owned temporary servers after validation.

## 7. Documentation and delivery

For each implementation slice:

1. Update README sections directly affected by behavior or controls.
2. Document any new preset fields, defaults, fallback behavior, and motion limits.
3. Document confidence limits for pitch, tempo, and automatic scene evolution.
4. Include focused test results and listening observations in the completion summary.
5. Identify any unverified browser/device behavior explicitly.
6. Keep changes reviewable; do not bundle unrelated code cleanup.

## 8. Deferred work and decision gates

Do not implement these by default:

- WebGL/WebGPU migration or a third-party visualization framework.
- Actual instrument/stem separation.
- Reliable chord/key or verse/chorus recognition claims.
- Stereo oscilloscope mode.
- New public visualizer IDs or a large set of user settings.
- Persistent listening overrides or automatic visualizer switching.
- Timestamped track cues before the schema and authoring scope are approved.

Before making a materially different behavioral choice, confirm it with the user.
Proceed with the defaults in this plan for the core analysis and shared effects.

## 9. Definition of done

The relevant phase is complete only when:

- Its expected behavior is implemented across runtime, presets, and configuration
  generation where applicable.
- Focused measurable tests pass and listening checks support the intended effect.
- Existing playback, artwork, accessibility, and deployment behavior is preserved.
- Performance and motion comfort are checked on recorded desktop/mobile environments.
- User-facing documentation matches the persistent implementation.

Success is not "more things moving." Success is a listener recognizing the music
in the visual response while still enjoying a coherent, comfortable visual world.

## 10. Phase 0 execution record

### Scope and baseline identity

- Date: 2026-10-31.
- Baseline revision: `938241154346712cff90629e60f8191bf52ad218`.
- Initial worktree: tracked files clean; `plans` was already untracked and was
  preserved. No existing application changes were reverted.
- Preview: `npm run preview`, served at `http://127.0.0.1:8000/`.
- Readiness: HTTP 200 and a listening process were verified.
- Manifest generation found 149 MP3 files in 14 folders.
- Generation changed only `generatedAt` in the two manifests. Those task-created
  timestamp changes were removed after testing; no library content changed.
- Cleanup verification: SHA-256 hashes of `app.js`, `styles.css`, `index.html`,
  `songs.js`, and `songs.json` matched their initial values. Final Git status
  contained only the already-untracked `plans` directory. The test page was
  navigated away and the task-owned preview was stopped; port 8000 no longer
  had a listener.
- No application, preset, dependency, or build changes were made for Phase 0.
- This execution record is the persistent baseline; browser instrumentation was
  temporary and was not added to the application.

### Environment

| Property | Recorded value |
|---|---|
| OS/platform | Windows, browser platform `Win32` |
| Browser | VS Code integrated browser, Code 1.143.1 |
| Engine | Chrome 150.0.7871.250 / Electron 43.7.7 |
| Reported logical processors | 32 |
| Desktop viewport | 1440 x 1100 CSS pixels |
| Narrow-screen viewport | 390 x 844 CSS pixels |
| Device pixel ratio | Approximately 1 |
| Web Audio sample rate | 48000 Hz |
| Desktop canvas backing size | 790 x 790 pixels |
| Narrow-screen canvas backing size | 382 x 382 pixels |
| Initial reduced-motion preference | Off; reduction was subsequently emulated |

The narrow-screen test resized the desktop browser. It is not a measurement on
physical mobile hardware and does not establish mobile GPU performance, touch
behavior, Safari compatibility, or performance at DPR 2.

### Reference listening set

The user identified these tracks by musical character. The categories below are
user-provided listening information, not instrumentation/genre inferred from titles.

| Role | Exact existing track | Default engine | Duration | Exercised seek positions |
|---|---|---|---|---|
| Sparse acoustic | [D2_ The seed remains](../music/02%20-%20Awakening/D2_%20The%20seed%20remains.mp3) | Lissajous | 234.04 s | 30, 90, 164 s |
| Percussion-heavy | [10 - Rocks](../music/13%20-%20Sacred%20Heart/10%20-%20Rocks.mp3) | Circle of fifths | 255.60 s | 30, 90, 179 s |
| Ambient/sustained | [D1_ The Door closes](../music/02%20-%20Awakening/D1_%20The%20Door%20closes.mp3) | Lissajous | 249.88 s | 30, 90, 175 s |
| Clear build/release | [Prayer Warriors](../music/11%20-%20Rituals/Prayer%20Warriors.mp3) | Polyrhythm | 303.60 s | 30, 90, 213 s |

The user referred to Rocks as song 13; the current manifest contains the unique
matching title as `10 - Rocks`, tenth of thirteen tracks in Sacred Heart. Selection
used the song title rather than the conflicting ordinal.

All four tracks loaded and played at all listed positions with `readyState` 4,
no media error, and playback time advancing. Seek positions were standardized
to 30 s, 90 s, and approximately 70% of duration; these are not identified
build/release boundaries. Exact musical passage timestamps still need listening.

Browser automation cannot provide personal auditory perception. No claim is made
that drum-to-visual alignment, chord accuracy, emotional impact, or the sound of
these passages was independently heard or judged by the assistant.

### Five-engine performance baseline

For initial engine coverage, the first track in each of the first five albums was
played. Desktop samples covered approximately three seconds of early playback;
narrow-screen samples covered approximately two seconds. Playback warm-up ended
when the media was playing and its time exceeded 0.2 seconds.

| Engine | Coverage track | Desktop frames | Desktop mean FPS | Desktop draw p95, ms | Desktop interval p95, ms | Narrow-screen frames | Narrow-screen mean FPS | Narrow-screen draw p95, ms | Narrow-screen interval p95, ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Circle of fifths | The Veil: 01_Dance with Me | 180 | 60.00 | 0.60 | 16.90 | 120 | 59.50 | 1.30 | 17.10 |
| Lissajous | Awakening: D1_ The Door closes | 180 | 59.66 | 0.70 | 17.10 | 121 | 60.00 | 1.10 | 17.30 |
| Tonnetz | Elements: 00A - First Breath | 179 | 59.33 | 0.40 | 16.90 | 120 | 59.99 | 0.90 | 17.10 |
| Polyrhythm | Limerence: BeforeYouSayYouLoveMe | 181 | 60.00 | 0.60 | 17.00 | 120 | 59.99 | 0.70 | 17.10 |
| Spectral terrain | Journey Back: 01_Spark of Longing | 179 | 59.66 | 0.70 | 17.00 | 120 | 60.00 | 0.70 | 17.10 |

**Measurement meaning:**

- Draw duration is wall-clock time around the `drawVisualizer` JavaScript callback,
  including its synchronous analysis and Canvas command submission.
- Intervals are differences between consecutive callback timestamps. Mean FPS is
  1000 divided by the arithmetic mean interval.
- These are not GPU-completion timings or full browser-frame costs.
- The short samples do not establish long-session memory stability or worst-case
  behavior across a whole song.
- Desktop Canvas pixel readback was performed after each timing sample to verify
  nonempty rendered content. Repeated readback triggered a browser diagnostic and
  can affect subsequent Canvas behavior; this is an instrumented baseline, not
  an uncontaminated production benchmark.
- No uncaught page errors or unhandled rejections were recorded in the five-engine
  timed runs.

### Visual observations

All five styles were exercised at both viewport sizes and inspected in captured
screenshots. Screenshots are exploratory evidence in the session, not fixed
pixel-golden tests: animation time and the audio passage affect their content.

| Style | Observed appearance, distinct from musical interpretation |
|---|---|
| Circle of fifths | Bright nodes and a relatively regular polygon/ring; rotating note labels leave multiple ghosted copies in the trails. |
| Lissajous | Broad orange ribbon-like curves and dense trails occupy much of the outer circle; controls remain in front. |
| Tonnetz | Teal node/line lattice creates a dense, patterned field; the opaque centre masks much of the lattice underneath. |
| Polyrhythm | Concentric purple wheels and repeated node trails are visually distinct; no auditory tempo-alignment judgment was made. |
| Spectral terrain | Teal ridges and their trails create a sweeping texture. Rotation/trail accumulation makes the long-running scene less like a stationary perspective landscape. |

Common observations:

- The opaque centre and song-button rings divide visual attention between browsing
  and the visual scene, supporting the case for an optional immersive mode.
- Narrow-screen titles truncate substantially.
- At 390 px width, document width was 397-402 px depending on the album.
  Element bounds confirmed outer song buttons extend outside the viewport;
  `overflow-x: hidden` clips portions rather than solving the layout overflow.
- Narrow-screen song buttons were 31 px tall. Previous/next buttons were about
  26.4 px tall; the play button was about 35.2 px tall. These are small touch targets,
  not a claim that physical touch interaction was tested.
- Under emulated reduced motion, paused polyrhythm Canvas content still changed:
  39,878 of 145,924 pixels changed over approximately 300 ms. A separate idle run
  recorded 60 drawing callbacks in one second. CSS duration reduction therefore
  does not suppress the Canvas animation.

These are pre-existing baseline findings; Phase 0 intentionally does not fix them.

### Playback and shared-link checks

| Flow | Result and evidence |
|---|---|
| Initial library | 14 album options and 149 songs; no song selected; copy-link button disabled. |
| First playback | All five coverage tracks started, advanced in time, and had finite durations. |
| Pause/resume | Native paused state changed correctly; UI switched between Play and Pause. |
| Previous/next | Journey Back advanced from `01_Spark of Longing` to `02_Projected Shine` and returned. |
| Playing seek | Progress 500/1000 moved to approximately 50.18% after allowing playback to advance. |
| Paused seek | Progress 250/1000 moved to approximately 25% and stayed paused. |
| Volume | Setting the slider to 0.25 set the media element volume to 0.25. |
| Autoplay next | Seeking just before track end advanced to the second track and started playback. |
| Album end | Ending the final Journey Back track with autoplay enabled displayed `Selection finished.` and did not advance to another album. |
| Album switch during playback/loading | Switching to Limerence paused audio, removed its source, reset the selected song, and displayed the new album status. |
| Copy link | Normal clipboard path displayed successful copy status; the page hash itself did not change. Clipboard contents were not independently read. |
| Clipboard denial | A test-only `writeText` rejection exposed the selected manual-copy field and explicit fallback status. |
| Shared link, load | A valid Awakening song hash selected that album and track and played from the beginning in this browser. |
| Shared link, navigation | Changing the hash selected Elements and `00A - First Breath`. |
| Missing link, fresh load | Explicit missing-song message appeared; the library remained usable. |
| Blocked autoplay | A test-only first-call `NotAllowedError` kept the song selected and paused, showed `Tap Play to listen`, and a subsequent button press started playback. This validates the error branch, not native policy on every browser. |
| Keyboard | Space toggled play and pause after focus was moved outside form controls. |

During one rapid valid-hash-to-missing-hash sequence, the final status remained
`Playing ...` rather than the missing-song warning. This is a single exploratory
observation consistent with asynchronous status updates, not a fully isolated
regression result. Fresh-load missing-link behavior passed. Recheck rapid hash
changes and stale status writes during Phase 1 lifecycle work; do not silently
treat the exploratory sequence as a passing warning check.

Observed `net::ERR_ABORTED` media requests occurred during deliberate track
replacement, seeking, or navigation while playback subsequently succeeded.
The Canvas readback warning and simulated clipboard-denial warning were caused
by baseline instrumentation. They are not unexplained application exceptions.

### Source-review findings retained for Phase 1

The following are verified from code, not listening conclusions:

- At the measured 48 kHz sample rate with FFT 512, bin spacing is 93.75 Hz.
  The current "bass" average covers bins 1-19, approximately 93.75-1781.25 Hz;
  this excludes sub-bass detail and includes substantial midrange.
- Pitch-class analysis uses the same coarse spectrum.
- The beat metric is a bass-level increase, not onset/tempo tracking.
- Rhythm playheads use preset speed and animation time.
- Artwork pulse uses a fixed CSS period.
- Canvas smoothing/fading and terrain history sampling depend on frame count.
- Track replacement and seeking do not comprehensively reset analysis/history.
- The intensity setting is not consistently used across active engines.

### Reproduction procedure

1. Confirm the application files match the baseline revision, while preserving
   unrelated worktree changes.
2. Run `npm run preview`, note any alternate port, and verify HTTP readiness.
3. Use the integrated Chromium browser at 1440 x 1100, DPR approximately 1,
   normal motion preference, and volume 0.8.
4. Install this browser-only instrumentation through Playwright
   `page.addInitScript` before reloading, so it runs before the application
   schedules its first frame. Do not commit it to the application:

   ```javascript
   const baseline = { draws: [], intervals: [], last: undefined };
   window.__phase0 = baseline;
   const originalRaf = window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame = (callback) => originalRaf((time) => {
     if (callback.name !== "drawVisualizer") {
       callback(time);
       return;
     }
     if (baseline.last !== undefined) {
       baseline.intervals.push(time - baseline.last);
     }
     baseline.last = time;
     const start = performance.now();
     callback(time);
     baseline.draws.push(performance.now() - start);
   });
   ```

5. For each of the first five albums, start its first song. Once playback time
   exceeds 0.2 s, clear the arrays and `last`, then sample for three seconds.
   Sort durations and take index `floor(count * 0.95)` for p95; derive mean FPS
   from mean callback interval.
6. Repeat at 390 x 844 with two-second samples, noting this is viewport emulation.
7. Exercise the four user-selected reference songs at the recorded seek positions.
8. Repeat the playback matrix, using real end-of-media seeks for autoplay/end
   checks rather than manually dispatching an `ended` event.
9. Inspect screenshots and actual element bounds for all five styles. Emulate
   reduced motion and compare two Canvas snapshots while paused.
10. Remove only task-created generated timestamp changes, stop the task-owned
    preview process, and verify the final worktree.

For sample-rate capture, the execution used a browser-only proxy around the
AudioContext constructor to retain the actual context and read its `sampleRate`.
For error collection, it listened to page `error` and `unhandledrejection` events.
Neither hook changed the audio routing or the renderer implementation.

### Phase 0 outcome and remaining limits

Phase 0 baseline establishment is complete: reference tracks are identified by
the user, all five visualizers were exercised at both viewport sizes, measurements
and playback results are recorded, and source findings are separated from visual
observations and user-provided listening classifications.

Before making perceptual claims in subsequent phases, perform human listening
comparisons on these tracks and identify the build/release passage timestamps.
Also retain physical mobile, DPR 2, non-Chromium browsers, long-session profiling,
actual native autoplay restrictions, audio-load failure, and the complete artwork
fallback matrix as unverified surfaces. Phase 0 results do not substitute for
the broader regression and acceptance criteria in Section 6.

## 11. Phase 1 execution record

### Implemented

- Added a dependency-free [analysis module](../audio-analysis.js), imported by
  the player as an ES module and explicitly included in the static build.
- Replaced percentage-based bands with half-open Hz bands: 30-250, 250-4000,
  and 4000-16000 Hz, excluding DC and respecting the actual sample rate/Nyquist limit.
- Added unsmoothed 2048-point transient analysis and waveform RMS, with silence
  below RMS 0.001. An independent 8192-point analyser supplies visual frequency
  detail approximately every 50 ms.
- Added positive spectral flux with a bounded one-second adaptive history,
  a 120 ms refractory interval, an explicit onset event, and a separate
  visible envelope with immediate attack and 200 ms exponential release.
- Added slow RMS reference adaptation and normalization gain capped at 4.
  Silence does not adapt the reference or create target energy.
- Polls transient analysis every 16 ms, independently of canvas drawing.
  Measured metrics are available before the renderers read them.
- Made shared/display envelopes, canvas fade, and terrain history sampling
  elapsed-time-based. Terrain `sampleEvery` remains compatible at a 60 Hz
  reference rate.
- Reuses waveform, spectrum, display, idle, and flux-history buffers.
- Keeps one media source and exactly one audible destination route, with two
  analyser branches that do not feed the destination.
- Separates decorative paused/initial idle values from measured analysis.
  Paused music decays into a slower idle scene; buffering, seeking, silence,
  and suspended/unavailable analysis do not emit invented onsets.
- Resets temporal analysis, display buffers, canvas trails, and terrain history
  on track changes and seek events. Gaps longer than 100 ms re-prime analysis
  rather than integrating a large jump.
- Stops sampling/drawing while hidden without pausing playback and starts
  fresh on visibility return. Startup is idempotent, including visibility
  changes while preset loading is still in progress.
- Reports initialization failures explicitly while retaining native playback
  where possible. A failure before source creation does not reroute or block
  native audio.
- Prevents pending shared-song startup and late play-status writes from
  overwriting a missing-shared-song warning. Existing playback is not stopped
  simply because a missing hash is selected.
- Preserved existing visualizer IDs, presets, album settings, controls,
  artwork behavior, and manifest format.

### Tests and measured results

- `npm test`: all 9 built-in Node tests passed, with no dependency installation.
  Tests cover sample-rate-aware boundaries, band separation at 44.1/48 kHz,
  RMS/silence, onset events and release, reset/resumption/gaps, normalization,
  malformed inputs, and elapsed-time consistency at 30/60/144 Hz.
- A synthetic spectral-impulse train produced exactly one event per 120 BPM
  click, with no extra events.
- Real Web Audio browser check at 48 kHz: all 20 synthetic clicks detected,
  zero missed/extra events, p95 latency 30.67 ms, and a silent tail.
  Real 80, 1000, and 8000 Hz tones activated the intended band most strongly.
- Initial browser testing revealed missed short clicks when audio was sampled
  only at a 33 ms render cadence. This was corrected by independent 16 ms
  polling, not by weakening the threshold or acceptance target.
- Player-level verification used a locally generated PCM WAV click train through
  the actual media element/source graph, with drawing deliberately scheduled
  about every 33 ms. All 20 clicks were detected, no extras, p95 latency 32 ms,
  and approximately 691 analysis updates over the 11-second fixture.
- JavaScript syntax checks and Git diff whitespace checks passed.
- The static build completed, included the new runtime module, and excluded
  development tests. Built runtime assets were checked against source.
- The built site was exercised under the `/_site/` URL subpath: a shared song
  selected and played, with one context, one audible route, and no uncaught errors.

The independent browser test is reusable at
[tests/web-audio-check.js](../tests/web-audio-check.js). Run it from a local
preview after a user gesture:

```javascript
const { checkWebAudio } = await import("./tests/web-audio-check.js");
await checkWebAudio();
```

It uses muted synthetic audio, closes its temporary context, and throws on
threshold failures. The default 16 ms polling matches the application.
This test does not require or upload any library recording.

### Playback/lifecycle checks

Verified in the integrated Chromium browser:

- First playback and all five active engines.
- All four user-selected reference tracks at the Phase 0 seek positions:
  playback advanced, analysis remained available, RMS/energy were finite,
  and no media error was present.
- Pause/resume and no onsets while paused.
- Seeking while playing and paused; destination progress remained correct.
- Previous/next and album switching/reset.
- Autoplay next and final-album completion.
- Volume and mute: mute produced RMS zero, silence, and no onset events.
- Valid shared-link playback and rapid valid-to-missing hash navigation:
  the missing-song warning remained visible.
- Missing Web Audio and simulated context-construction failure: media playback
  still advanced, an explicit reactive-visuals error was displayed, and no
  uncaught exception/unhandled rejection was recorded.
- Simulated autoplay denial: ready-to-play messaging and gesture retry succeeded.
- Simulated buffering and an actually suspended AudioContext: measured availability
  became false with no onset events; resume was exercised.
- Simulated hidden/visible transitions: audio time advanced while hidden,
  fresh analysis resumed without a stale onset.
- Delayed preset fetch plus repeated visibility events during startup:
  exactly one 16 ms analysis timer remained active.

Visibility and buffering checks used controlled browser property/event simulation;
they are not proof of every browser's native background scheduling or buffering
policy. Error/autoplay injections were browser-only and were not shipped.

### Short-run performance

Same desktop environment as Phase 0, DPR approximately 1. Desktop samples were
about two seconds; narrow-screen samples were about 1.5 seconds.

| Engine | Desktop mean FPS | Desktop draw p95, ms | Narrow-screen mean FPS | Narrow-screen draw p95, ms |
|---|---:|---:|---:|---:|
| Circle of fifths | 59.50 | 0.80 | 60.01 | 0.70 |
| Lissajous | 60.00 | 0.50 | 59.99 | 0.70 |
| Tonnetz | 58.99 | 0.70 | 59.33 | 0.80 |
| Polyrhythm | 59.99 | 0.50 | 60.00 | 0.60 |
| Spectral terrain | 60.00 | 0.50 | 59.99 | 0.60 |

Draw measurements cover synchronous rendering, not the independent sampling
callback or GPU completion. Frame cadence stayed close to 60 FPS in these runs;
this is not long-session profiling or physical mobile validation.

### Scope boundaries and follow-up

- No new shockwaves, sparks, waveform halo, or audio-driven artwork were added:
  these are Phase 2.
- Uniform intensity behavior, refined harmonic estimation/visuals, and
  confidence-gated tempo/wheel timing remain later phases.
- Reduced-motion Canvas support and mobile clipping/touch-target fixes remain
  Phase 4; the source review did not silently convert them into Phase 1 work.
- Chroma still uses nearest-pitch-class bin mapping, now on a finer FFT; it is
  not chord recognition. Larger FFT alone does not guarantee correct bass pitch.
- The onset detector is not a tempo tracker or instrument separator.
- Trail decay age and history cadence are elapsed-time-based; this does not
  promise pixel-identical trail brightness across different rendering rates.
- Human listening, exact build/release boundaries, physical mobile/DPR 2,
  non-Chromium compatibility, and long-session resource profiling remain
  unverified. Synthetic latency measurements are detector timing, not a
  listener's perceived end-to-end audiovisual latency.

Phase 1 supplies the tested shared-analysis foundation for Phase 2 without
changing the library or introducing a rendering framework.

Cleanup: timestamp-only changes from build generation were removed from the
source manifests. The deployable output remains built with the new runtime.
Temporary test pages were returned to blank and the task-owned preview server
was stopped. No dependencies were installed or commits created.

## 12. Phase 2 execution record

### Implemented

- Added a dependency-free [shared effects model](../visual-effects.js), consumed
  by the existing independent audio-sampling callback. Onset events enter the
  effects lifecycle before drawing, so a slower renderer cannot lose events
  between frames. No new audio source, analyser, or audible route was added.
- Added a 128-point, actual time-domain halo. Its seam tapers to zero displacement;
  displacement is bounded to 3.6% of circle size at intensity 2.
- Added onset-triggered expanding rings with 750 ms lifetime, a squared fade,
  120 ms minimum spacing, and four concurrent waves. Excess events are suppressed.
- Added deterministic treble sparks with 300-650 ms lifetime, at most 18
  emissions per second, and a hard 48-particle limit. Spark brightness and
  movement are bounded; overall energy modulates emission density.
- Assigned sustained bass to restrained anisotropic engine deformation, with
  350 ms attack and 600 ms release, rather than rapid uniform growth.
- Kept the selected engine dominant. Shared colors follow the album palette and
  are cached on theme changes. The shared layer is unrotated and clipped to
  an annulus outside the measured centre-control radius and inside the orbit.
- Replaced the fixed CSS artwork pulse with an energy/onset envelope:
  20 ms attack, 200 ms release, and scale bounded to 1.015-1.095.
  Only artwork scales. `still` and the intentional 26-second `rotate` remain.
- Applied intensity to Circle of Fifths and Tonnetz node response, Lissajous
  musical modulation, polyrhythm node response, terrain height, and shared
  effects. Intensity does not change playback volume, onset thresholds,
  event counts, confidence, or wheel timing.
- Intentional Lissajous change: intensity no longer multiplies static curve
  size; it multiplies audio modulation. This keeps idle geometry stable.
- Reset effects with existing seek/song/album/visibility lifecycle resets.
  Unavailable analysis clears transients; silence stops emissions and lets
  existing finite effects expire. Reduced motion suppresses the new waveform
  displacement, rings, sparks, bass deformation, and artwork pulse.
- Included the runtime module in the static build, excluded development tests,
  and updated the [README](../README.md).

### Tests and measurable response

- `npm test`: all 17 tests passed (9 analysis tests and 8 effects tests).
  Effects coverage includes wave spacing/concurrency/expiry, deterministic
  bounded sparks, measured-scale treble response, quiet/silent input,
  unavailable/reduced/reset/gap handling, 30/60/144 Hz envelope consistency,
  intensity amplitude, waveform bounds/seam, and explicit invalid-time errors.
- Re-ran the real Web Audio check at 48 kHz: 20/20 clicks detected, no missed
  or extra events, p95 detector latency 30.67 ms, and a silent tail.
- Used [controlled renderer instrumentation](../tests/visual-response-check.js)
  with fixed audio metrics, spectrum, waveform, preset, and viewport to measure
  actual drawn geometry, not only an intensity helper. Instrumentation restores
  its prototype changes in `finally` and is development-only.

| Measured response at a 790 px circle | Intensity 0.5 | Intensity 1 | Intensity 2 |
|---|---:|---:|---:|
| Circle of Fifths node radius, px | 7.635 | 12.770 | 23.040 |
| Lissajous horizontal span, px | 510.34 | 588.39 | 744.50 |
| Tonnetz node radius, px | 4.9 | 7.4 | 12.4 |
| Polyrhythm maximum node radius, px | 5.800 | 8.406 | 13.612 |
| Terrain newest-ridge displacement, px | 45.47 | 90.94 | 182.26 |

All five responses were strictly ordered and captured geometry was finite.
Playback volume remained 0.8. All five engines also passed the controlled
high-intensity geometry check at a 390 px viewport, with centre transport
buttons unobstructed by hit testing.

### Real-track tuning and playback checks

The initial spark mapping produced no particles in short reference passages.
Measured treble in a four-second Rocks passage at 90 s had mean 0.0218 and
maximum 0.0662, well below the original artistic mapping range. Tuned only
the spark mapping: response starts above 0.01 and reaches its bounded maximum
at 0.07, with overall energy still gating density. Analysis thresholds and
normalization were not weakened to make the effect appear.

After tuning, short samples showed:

- Rocks at 90 s: up to four rings and four sparks, with 13 detected onsets
  and ten emission updates over approximately four seconds.
- D2_ The seed remains at 30 s: up to one ring and three sparks.
- D1_ The Door closes at 30 s: no rings or sparks during the sampled passage.
- Prayer Warriors at 30 s: up to three rings and one spark, with six detected
  onsets during the approximately three-second sample.

These are short passage observations, not claims that every part of an acoustic
track is quiet or that bands identify instruments. Desktop screenshots showed
the selected engine remaining dominant and the centre artwork/text readable.

Integrated Chromium checks passed for pause/resume, mute, timeline seeking,
previous/next, album switching, autoplay next, link copying, and valid shared-song
playback from the built site's `/_site/index.html` subpath. Pause and mute
settled artwork close to scale 1.015 with no remaining rings/sparks after 1.2 s.
Reduced motion cleared new transients and fixed artwork at scale 1.015.
Still artwork had no animation; rotate remained 26 seconds.

Controlled buffering simulation cleared waves and sparks. A simulated
hidden/visible transition allowed audio time to advance and resumed fresh
visual response. These simulations do not validate every native browser policy.
No uncaught exceptions or unhandled rejections were recorded.

### Short-run performance

Normal rendering, without geometry-capture instrumentation; approximately
1.5-second samples at 1440 x 1100 and 390 x 844 on the same desktop Chromium
environment, DPR approximately 1.

| Engine | Desktop mean FPS | Desktop draw p95, ms | Narrow-screen mean FPS | Narrow-screen draw p95, ms |
|---|---:|---:|---:|---:|
| Circle of Fifths | 59.22 | 1.50 | 60.00 | 1.70 |
| Lissajous | 59.34 | 0.70 | 60.00 | 0.90 |
| Tonnetz | 57.33 | 0.70 | 59.98 | 1.00 |
| Polyrhythm | 60.01 | 0.40 | 59.33 | 0.60 |
| Spectral terrain | 59.33 | 0.70 | 59.98 | 0.70 |

Draw p95 measures synchronous rendering, not analysis callback cost or GPU
completion. These short runs are not long-session or physical mobile profiling.

### Build, cleanup, and remaining boundaries

- Syntax checks, Git whitespace checks, and the static build passed.
  Built runtime assets matched source bytes; development tests were absent.
- Removed only verified timestamp-only manifest changes; restored original
  source manifest hashes. No dependencies were installed or commits created.
- Returned task-owned test pages to blank and stopped the preview server.
- Full Canvas low-motion behavior, mobile song-button clipping/touch-target
  fixes, and immersive mode remain Phase 4. Harmonic estimation and genuine
  confidence-gated rhythm-wheel timing remain Phase 3; song evolution is Phase 5.
- Human listening confirmation, exact build/release alignment, physical mobile
  and high-DPR testing, non-Chromium compatibility, and long-session resource
  profiling remain unverified. Detector latency is not perceived audiovisual
  latency. No full-screen flashes or framework migration were introduced.

## 13. Phase 3 execution record

### Musical features and engine changes

- Added [musical-features.js](../musical-features.js) with dependency-free
  harmonic analysis, pulse estimation, lattice geometry, logarithmic terrain
  history, and preset validation. It is explicitly included in the static build.
  The existing media source, audible destination route, and analyser sizes remain.
- Harmonic analysis now reads float dB data from the 8192-point analyser at the
  existing approximately 50 ms cadence. It searches 55-6000 Hz for prominent
  peaks, rejects peaks below -72 dB or more than 30 dB below the maximum,
  requires 8 dB prominence, and interpolates peak position before pitch mapping.
- Downweights plausible harmonics only when a lower spectral fundamental is
  present. Uses a bounded 64-peak set and derives confidence from tonal power
  and pitch-class concentration. Chroma uses 150 ms attack / 650 ms release;
  confidence uses 200 ms attack / 500 ms release. Idle decoration never enters
  harmonic estimates.
- Circle of Fifths keeps its ordered polygon, mirrors, and optional labels.
  Smoothed confidence-weighted activity deforms nodes and translucent petals.
  Curved connections link at most five strong classes, gated by confidence.
  No estimated chord names are presented.
- Lissajous keeps every artistic ratio and layered trail preset. A tapered,
  normalized waveform offset adds bounded local displacement; the shared onset
  envelope adds bounded phase modulation. Both new movements are suppressed
  by reduced motion, and both have explicit-zero tuning controls.
- Tonnetz now uses cached equilateral lattice topology with verified neighbors
  and major/minor-third/fifth adjacency. This corrects the old row-boundary
  neighbor logic and pitch assignment on staggered rows. Filled cells follow
  real triangle edges; confidence-weighted regions remain soft and pathways
  fade with a 1.2-second release. Weak evidence does not light alleged chords.
- Pulse estimation searches 60-180 BPM from a 12-second/48-onset window,
  requiring at least six onsets spanning two seconds. It checks interval
  consistency, tolerates skipped multiples, refines the period, and checks
  anchor-phase alignment. Confidence must reach at least 0.7.
- Polyrhythm wheel rotation and Euclidean patterns remain artistic decoration.
  A separate pulse cursor is drawn outside camera/engine transforms and uses
  media playback position plus the estimated onset anchor. The style badge
  explicitly labels pulse estimation versus artistic cycles. Low-confidence
  mode uses onset accents without pretending the wheels are song-synchronized.
- Short silent gaps between percussive events preserve timing. Two seconds
  without an onset removes confidence; three seconds clears the event window.
  Pause, mute, unavailable analysis, seek/song/album changes, and visibility
  resets require reacquisition. The first onset is not treated as a downbeat.
- Terrain uses true logarithmic 30-16000 Hz groups bounded by actual Nyquist,
  spectral power, and capped normalization. Audio polling owns fixed-time
  history sampling, independently of render rate. Pending onsets survive until
  the next history sample and become traveling ridges. History remains within
  preset ridge limits; long gaps clear it rather than creating catch-up bursts.
- Added frequency-dependent album-accent gradients and restrained depth/fill
  shading. Pausing now holds the landscape rather than adding fake idle spectra.
  This and the corrected Tonnetz topology are intentional behavior changes.
- Preserved all five engine IDs, all 18 existing preset names, `defaultPreset`,
  and fallback selection. Added compatible new-field defaults, finite/range/
  integer validation, explicit-zero support, and repository-standard warnings
  for invalid configurations. No new UI controls or external dependencies.

### Automated and real-audio validation

- `npm test`: all 28 tests passed, including 11 new musical-feature tests.
  Tests cover A bass with overtones and a C/E/G triad at 44.1/48 kHz,
  low-level/flat noise/silence rejection, time-based harmonic smoothing,
  90/120/150 BPM acquisition, missed/sparse/irregular events, reset/drought
  behavior, equilateral edges/cells without wrapping, actual Nyquist-aware
  logarithmic groups, onset retention/expiry, 30/60/144 Hz terrain cadence,
  all shipped presets, numeric rejection, and meaningful zero.
- Real Web Audio harmonic fixtures at 48 kHz identified A bass with overtones
  (confidence 0.840) and the C/E/G triad (0.686). Seeded broadband noise remained
  low-confidence (0.032). Fixtures were muted and their context was closed.
- Re-ran the real Web Audio click check: 20/20 events, no missed/extra clicks,
  p95 detector latency 30.67 ms, and a silent tail. The new pulse estimate was
  119.98 BPM at confidence 0.872.
- Integrated player fixture: 20/20 events through the actual media element
  and source graph, estimated 119.75 BPM, confidence 0.909, and 958 cursor arcs.
  Every captured cursor angle matched media position/anchor phase (maximum
  captured angle error zero) and none inherited decorative rotation.
- The integrated fixture initially revealed that RMS silence between short
  clicks erased timing on every beat. Fixed the availability-versus-silence
  gate, not the onset thresholds or required confidence. This regression is
  retained in [checkPlayerPulse](../tests/musical-features-check.js).
- All 18 presets rendered with finite captured geometry at intensity 2.
  All five default engines also passed high-intensity geometry/control hit
  tests at a 390 px viewport. Browser-only manifest overrides selected presets;
  no query-string override API was shipped.
- Controlled harmonic injection exercised Tonnetz region/pathway drawing and
  continuing pathway strokes after activity ended. Geometry tests separately
  verified that every shaded cell uses actual adjacent edges.
- Rechecked ordered intensity response at 0.5/1/2 in every engine; playback
  volume stayed 0.8. Captured default-preset responses included:

| Response | Intensity 0.5 | Intensity 1 | Intensity 2 |
|---|---:|---:|---:|
| Circle node radius, px | 4.554 | 6.608 | 10.716 |
| Lissajous horizontal span, px | 386.77 | 530.77 | 674.90 |
| Tonnetz node radius, px | 3.8 | 4.8 | 6.8 |
| Polyrhythm node radius, px | 5.502 | 7.505 | 11.514 |
| Newest terrain ridge maximum displacement, px | 9.727 | 19.454 | 38.908 |

Terrain instrumentation now measures the newest ridge's maximum height rather
than its first group: a low-frequency logarithmic group can legitimately have
no FFT bin. Harmonic instrumentation supplies controlled chroma/confidence.
These measurements are not comparable to the old nearest-bin/terrain mappings
and do not constitute perceived musical synchronization.

### Playback and reference passages

- Passed pause/resume, mute, timeline seek, previous/next, autoplay next,
  album switching, and link copying. Pause/mute cleared pulse confidence.
  Seeking to 50% reached approximately 0.50018 of duration while playing.
- Controlled confident timing drew 18 cursor arcs in a short normal-motion
  sample and zero in reduced motion. The low-motion Canvas overhaul remains
  Phase 4; this verifies suppression of the new cursor only.
- All four reference songs played after seeking to 30 s. Six-second samples
  produced varying harmonic confidence (approximately 0.24-0.72 at sample end).
  Sparse/irregular onset sequences did not force timing confidence: Prayer
  Warriors remained explicitly in artistic-cycle mode in that passage.
  This is the intended fallback, not evidence that the song has no tempo.
- Native playback with Web Audio deliberately unavailable still advanced and
  displayed the existing reactive-visuals error, with no uncaught error.
- Built-site shared-link playback passed under `/_site/index.html` and loaded
  the new runtime module from that subpath.

### Short-run performance

Normal drawing without geometry stack capture; approximately 1.5-second samples
at 1440 x 1100 and 390 x 844, same desktop Chromium environment, DPR about 1.

| Engine | Desktop mean FPS | Desktop draw p95, ms | Narrow-screen mean FPS | Narrow-screen draw p95, ms |
|---|---:|---:|---:|---:|
| Circle of Fifths | 60.00 | 1.40 | 59.32 | 1.30 |
| Lissajous | 60.00 | 1.20 | 59.99 | 0.80 |
| Tonnetz | 58.67 | 1.00 | 60.00 | 0.90 |
| Polyrhythm | 59.99 | 0.50 | 60.00 | 0.60 |
| Spectral terrain | 59.98 | 1.00 | 60.01 | 0.90 |

These measure synchronous drawing and frame cadence, not GPU completion or
independent analysis cost. They are not long-session or physical mobile tests.

### Build, cleanup, and limitations

- JavaScript syntax checks, Git whitespace checks, and the static build passed.
  Copied runtime bytes matched source and development tests were excluded.
- Restored only verified generated timestamp changes and confirmed the original
  source manifest hashes. No dependencies were installed or commits created.
- Returned owned test pages to blank and stopped the task-owned preview.
- Pitch confidence is a heuristic, not a chord/instrument classifier. Bass
  resolution, overtones, tuning, dense mixes, and noise can mislead estimates.
  Pulse estimation retains half/double-time, syncopation, and tempo-change
  limitations; it does not identify meter or downbeats.
- Lissajous remains artistic geometry, not a stereo scope. Full low-motion,
  immersive/session controls, and mobile song-button clipping/touch-target
  fixes remain Phase 4; song-level evolution remains Phase 5.
- Human listening/perceived alignment, physical mobile/high-DPR and
  non-Chromium testing, exact build/release transitions, and long-session
  resource profiling remain unverified.

## 14. Phase 4 execution record

### Delivered behavior

- Added opt-in immersive view without the fullscreen API. The scene occupies
  the viewport while album/library/song choices are hidden and inert.
  Exit remains visible; Escape exits even from an input/select, restores
  scroll and toggle focus, and does not interrupt playback.
- The HUD fades after three idle seconds only when nothing is focused and no
  manual link fallback is open. Pointer/touch and keyboard activity reveal it.
  Entry focuses Exit, so it intentionally stays visible until focus moves away.
  Non-error status remains accessible but visually clipped in immersive mode;
  errors stay visible and do not intercept pointer input.
- Added session-only engine and intensity controls (0.5-2, 0.01 steps).
  The selected album is cloned, not mutated in the source manifest. New engines
  use default presets; returning to the album engine restores its preset.
  Album changes/reload restore configured settings; intensity never changes
  playback volume.
- Narrow browsing now places the existing song buttons in a two-column,
  title-wrapping grid below the scene at widths up to 700 px. Transport and
  mobile song choices have at least 44 px targets. Desktop orbit remains.
  Reparenting preserves existing buttons/listeners; resize no longer rebuilds
  them and loses focus.
- System reduced motion draws stationary identities for all five engines.
  Only a restrained bounded global opacity responds to energy. Camera motion,
  zoom, terrain travel, pulse cursor, bursts, waveform displacement, and artwork
  rotation/pulse are absent, including at intensity 2.
- Reused the cached palette. Added bounded adaptive decoration levels
  (100%, 70%, 40%), reducing only drawn sparks and Lissajous trails.
  Three sustained slow seconds (>25 ms frame interval or >12 ms draw cost)
  degrade one level; ten sustained healthy seconds (<=20 ms interval and
  <8 ms draw cost) recover one. Isolated spikes and gaps >100 ms reset counters.
  Detector, harmonic/pulse cadence, event emission, terrain history, and volume
  are unchanged. No new settings panel or dependencies.

### Automated and real-browser validation

- `npm test`: **32/32 passing**, including four new comfort-policy tests.
- Reduced-motion Canvas capture: all five engines produced stationary geometry
  across 13 completed frames each at intensity 2, with no camera scale/rotation
  and no artwork animation. Normal motion is intentionally richer.
- Controlled quality integration reduced actual Lissajous trail paths from
  75 to 30 across comparable 250 ms samples at level 2, retaining volume 0.8.
  This injects slow samples into the actual quality model; it does not claim
  naturally sustained hardware pressure.
- Focused timeline stayed visible beyond three seconds; blurring into the
  scene allowed hiding. Tab and pointer activity revealed the HUD; permanent
  exit remained visible. Space activated the immersive toggle; Escape restored
  browsing/toggle focus and playback. Checked scroll restoration: 12 -> 12 px.
- Actual denied clipboard access showed the manual copy input and a logged
  warning. After scene interaction and 3.2 seconds, the fallback remained
  visible and controls did not hide.
- Source settings were unchanged by overrides; album change and reload restored
  defaults and normal mode.
- Final hit tests passed for exit, all three transport buttons, progress,
  volume, visualizer, and intensity at 320 x 568, 390 x 844, 568 x 320,
  844 x 390, and 1440 x 1100. The 26-song mobile grid stayed horizontally
  contained and every button was at least 44 px tall.
- Corrected two issues discovered through browser testing: misplaced CSS media
  nesting that hid normal immersive rules, and short-viewport control/status
  overlap. Side HUD and accessible status clipping passed the final matrix.
- Pause/resume, previous/next, autoplay advance, and seeking passed; 50% seek
  reached approximately 0.50020 of duration. Playback continued across
  immersive changes. Shared-link and built-subpath checks are recorded below.
- Real Web Audio regression: 20/20 click onsets, no missed/extra events,
  p95 latency 29.33 ms, estimated 119.88 BPM/confidence 0.888, silent tail.

### Short-run rendering measurements

Actual first-album playback at intensity 2, five engines, approximately
one-second samples per engine/mode; desktop Chromium, DPR approximately 1.
Values are ranges across engines, not target-device guarantees.

| Viewport | Mode | Mean FPS range | Synchronous draw p95 range, ms |
|---|---|---:|---:|
| 1440 x 1100 | Browsing | 56.89-60.01 | 0.60-2.20 |
| 1440 x 1100 | Immersive | 59.99-60.01 | 0.60-4.30 |
| 390 x 844 | Browsing | 58.98-60.00 | 0.60-1.30 |
| 390 x 844 | Immersive | 59.98-60.03 | 0.50-1.80 |

No uncaught errors in these runs. Frame/draw wrappers did not capture Canvas
geometry stacks. Measurements exclude GPU completion and independent analysis
cost; they do not cover long sessions or physical mobile hardware.

### Build, cleanup, and remaining scope

- Static build passed; runtime bytes matched source, including the new
  `visual-comfort.js`, and development tests were excluded.
- Built-subpath shared-song playback passed under `/_site/index.html`, continued
  in immersive Lissajous, and loaded the comfort module with HTTP 200.
  No uncaught application errors.
- Restored only verified generated timestamp changes; both source manifest
  hashes matched their pre-build values.
- README documents controls, low-motion behavior, thresholds, and the new
  development-only `tests/visual-comfort-check.js` helpers.
- Returned the owned active test pages to blank, reset motion emulation, and
  stopped the task-owned preview. No dependencies installed or commits created.
- Physical touch devices/high-DPR, non-Chromium browsers, screen-reader
  user testing, long-session profiling, and human perceived alignment remain
  unverified. Browser pointer/keyboard/layout tests are not substitutes for them.
- Phase 5 song-level visual evolution remains unimplemented.
