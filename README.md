# Music Orbit — Circular GitHub Pages Music Player

A static HTML, CSS, and JavaScript music player that turns folders of MP3 files into individualized album experiences.

It now supports:

- an alphabetically sorted folder/album dropdown;
- circular song buttons generated from MP3 filenames;
- album cover artwork in the centre of the player;
- album-specific background images, accent colors, descriptions, and animation settings;
- song-specific artwork stored beside an MP3 or inside an `artwork` subfolder;
- embedded ID3/APIC artwork read directly from an MP3 in the browser;
- an audio-reactive Web Audio visualizer;
- five music-theory visualizers with editable JSON tuning presets;
- unchanged play, pause, previous, next, progress, volume, and autoplay controls;
- shareable song links with a copy-link button on the player;
- automatic generation and GitHub Pages deployment.

## Run locally

Install [Node.js](https://nodejs.org/), open a terminal in the project folder, and run:

```bash
npm run preview
```

Then open the URL printed in the terminal, normally [http://localhost:8000](http://localhost:8000). If that port is already occupied, the server automatically selects the next available port. Press `Ctrl+C` in the terminal to stop the local server.

## 1. Basic folder structure

Each folder that directly contains MP3 files becomes one album option:

```text
music/
├── Acoustic Journey/
│   ├── album.json
│   ├── cover.jpg
│   ├── background.jpg
│   ├── 01 - Opening.mp3
│   ├── 02 - River.mp3
│   └── 02 - River.jpg
└── Night Signals/
    ├── album.json
    ├── cover.png
    ├── 01 - Orbit.mp3
    └── 02 - Signal.mp3
```

The dropdown remains sorted alphabetically by folder path. Songs remain naturally sorted by filename.

## 2. Album artwork and backgrounds

The generator automatically recognizes these conventional filenames:

### Album cover

```text
cover.jpg
cover.png
album.jpg
folder.jpg
```

### Album background

```text
background.jpg
backdrop.jpg
hero.jpg
```

Supported image formats are:

```text
.jpg .jpeg .png .webp .gif .avif .svg
```

The centre artwork follows this fallback order when a song is selected:

1. Artwork embedded in the MP3's ID3/APIC metadata.
2. A song-specific image.
3. The album cover.
4. An automatically generated monogram.

### Song-specific artwork

Place an image with exactly the same base filename beside the MP3:

```text
02 - River.mp3
02 - River.jpg
```

Alternatively, place matching images in an `artwork` subfolder:

```text
Acoustic Journey/
├── artwork/
│   └── 02 - River.png
└── 02 - River.mp3
```

You can also specify a different filename in `album.json`.

## 3. Configure an album with `album.json`

Every album folder may include an optional `album.json` file:

```json
{
  "title": "Acoustic Journey",
  "artist": "Example Artist",
  "description": "A quiet passage from departure to homecoming.",
  "cover": "cover.jpg",
  "background": "background.jpg",
  "accent": "#e6ae68",
  "accentSecondary": "#75b8d3",
  "visualizer": "circle-of-fifths",
  "visualizerPreset": "mandala",
  "visualizerIntensity": 1.15,
  "artworkMotion": "pulse",
  "preferEmbeddedArtwork": true,
  "tracks": {
    "01 - Opening.mp3": {
      "title": "Opening",
      "artist": "Example Artist"
    },
    "02 - River.mp3": {
      "title": "The River",
      "artwork": "special-river-art.jpg"
    }
  }
}
```

### Available album settings

| Setting | Purpose | Accepted values |
|---|---|---|
| `title` | Album title shown above the player | Text |
| `artist` | Default artist for the album and songs | Text |
| `description` | Short album description | Text |
| `cover` | Album cover path relative to the album folder | Image filename/path |
| `background` | Full-page background path | Image filename/path |
| `accent` | Main interface and visualizer color | CSS color |
| `accentSecondary` | Secondary generated-artwork color | CSS color |
| `visualizer` | Audio-reactive pattern | `circle-of-fifths`, `lissajous`, `tonnetz`, `polyrhythm`, `spectral-terrain` |
| `visualizerPreset` | Named variation from the visualizer's tuning file | Preset name, or `default` |
| `visualizerIntensity` | Visual response size | Number from `0.5` to `2` |
| `artworkMotion` | Centre artwork movement while playing | `still`, `pulse`, `rotate` |
| `preferEmbeddedArtwork` | Read artwork embedded inside MP3 files | `true` or `false` |
| `tracks` | Per-song title, artist, and artwork overrides | Object keyed by filename or filename without `.mp3` |

All settings are optional. The player uses sensible defaults when `album.json` is absent.

## 4. Embedded MP3 artwork

The browser contains a lightweight ID3v2 artwork reader. It supports the common:

- ID3v2.2 `PIC` frame;
- ID3v2.3 `APIC` frame;
- ID3v2.4 `APIC` frame.

The player initially requests only the beginning of the MP3, where ID3 metadata is normally stored. Embedded artwork is cached for the current album session and released when the user changes albums.

Unusual ID3 encodings or tags larger than 8 MB fall back safely to song artwork or the album cover.

## 5. Audio-reactive visualization

The visualizer uses the browser's Web Audio API and responds to the real frequency content of the song.

Available patterns:

- `circle-of-fifths`: smoothed pitch classes reshape a harmonic polygon,
  translucent petals, and curved connections between strong classes;
- `lissajous`: artistic ratios such as 3:2 and 5:4 form layered curves with
  bounded waveform displacement and onset-phase modulation;
- `tonnetz`: soft harmonic regions and fading pathways follow a verified
  triangular lattice, with confidence-gated node activity;
- `polyrhythm`: decorative Euclidean meter wheels support a separate,
  confidence-gated, song-timed pulse cursor;
- `spectral-terrain`: logarithmic frequency groups form a depth-shaded,
  two-accent landscape with traveling onset ridges.

Each engine reads named presets from its matching file in `visualizers/`. Edit those JSON values to tune geometry, density, motion, and response, or add another object under `presets` and select it with `visualizerPreset` in an album's `album.json`. The `defaultPreset` field controls the fallback variation for that engine.

All existing preset names and fallback selection are retained. Missing new fields
use compatible defaults. Invalid numeric fields produce a console warning and
the engine uses its built-in fallback; explicit zero is supported where meaningful.
New tuning fields are:

| Engine | Fields (supported range) |
|---|---|
| Circle of fifths | `petalAlpha` (0-0.4), `connectionThreshold` (0-1) |
| Lissajous | `waveformAmount` (0-0.025 of circle size), `onsetAmount` (0-0.12 radians) |
| Tonnetz | `regionAlpha` (0-0.4), `pathwayAlpha` (0-0.6) |
| Polyrhythm | `tempoConfidence` (0.7-1; cannot lower the safety gate) |
| Spectral terrain | `transientHeight` (0-0.1 of circle size), `paletteMix` (0-1) |

All patterns share one browser-local analysis pipeline:

- bass (30-250 Hz), midrange (250-4000 Hz), and treble (4000-16000 Hz,
  capped by the browser's Nyquist frequency);
- waveform RMS, with a silence threshold of `0.001` (approximately -60 dBFS);
- transient detection using positive spectral flux, an adaptive one-second
  baseline, and at least 120 ms between detected events;
- a separate onset event and a visible response that decays with a 200 ms
  time constant;
- slow level adaptation with normalization gain capped at 4, so quiet non-silent
  passages remain responsive without amplifying silence.

Transient and waveform analysis uses an unsmoothed 2048-point FFT, polled every
16 ms independently of drawing. A separate 8192-point FFT supplies the visual
frequency detail approximately every 50 ms. Attack/release smoothing, trail
fading, and terrain sampling use elapsed time rather than frame counts.
`sampleEvery` in terrain presets retains its existing meaning at a 60 Hz
reference rate: `2` is a sampling interval of about 33 ms.

Terrain frequency groups span 30 Hz to 16 kHz (or Nyquist). Group levels use
linear spectral power and bounded normalization, not linearly spaced byte bins.
History sampling runs with audio polling independently of drawing; onsets between
history samples are retained for the next ridge. History stays within each
preset's ridge limit. Pausing holds the landscape rather than inserting fake
spectral history.

Idle animation is decorative and never feeds the measured bands or onset
detector. Pausing settles back into a slower idle scene; buffering, seeking, and
unavailable audio analysis do not invent musical activity. Track changes and
seeks clear prior analysis and terrain history. Hidden tabs stop visual work,
not playback, and resume with fresh analysis instead of a catch-up burst.

Visual activity follows the audible level, including the volume control and
mute. If Web Audio is unavailable or cannot initialize, the player reports the
problem and retains native playback where possible.

### Shared musical effects

The selected engine remains the main scene. A restrained shared layer adds:

- a 128-point halo driven by actual time-domain samples, with a tapered seam
  and bounded displacement outside the centre controls;
- expanding onset rings: at most four concurrent waves, a 750 ms lifetime,
  a smooth fade, and suppression of excess events rather than flashes;
- seeded, short-lived treble sparks near the outer orbit, capped at 18 emissions
  per second and 48 particles, with lifetimes of 300-650 ms;
- slow bass deformation (350 ms attack / 600 ms release), while overall energy
  controls shared brightness and treble-driven particle density;
- an audio-driven artwork `pulse` using energy and the onset envelope.
  `still` stays still and `rotate` retains its intentional 26-second rotation.
  Only the artwork layer moves; text and transport buttons do not scale.

`visualizerIntensity` scales response amplitude consistently across all five
engines and the shared layer. The supported range remains 0.5-2. It does not
change playback volume, analysis thresholds, particle emission counts, or
event timing. Lissajous intensity now scales musical modulation rather than
enlarging the entire idle curve.

Shared effects are cleared on track changes, seeks, unavailable analysis, and
visibility resets. Silence stops new emissions and lets finite effects expire.
The reduced-motion preference uses a stationary, simplified version of each
engine with only restrained energy-driven opacity. It disables continuous
camera/wheel motion, zoom, waveform displacement, rings, sparks, traveling
terrain, the pulse cursor, and artwork animation. Intensity cannot bypass it.

### Immersive listening and session controls

Use **Enter immersive view** in the Visual experience panel to expand the scene
toward the viewport without browser fullscreen. Album information and song
choices are hidden only while immersive; playback continues.

- **Exit immersive view** remains visible and keyboard-accessible.
  Escape exits from any control, restores the browsing scroll position, and
  returns focus to the toggle without trapping focus.
- Playback and visual controls fade after three seconds without interaction
  only when no control is focused. Pointer/touch activity and keyboard focus
  reveal them. A manual song-link fallback also keeps controls visible.
- Ordinary status messages remain available to screen readers in immersive
  mode; errors remain visible.
- The visualizer selector and 0.5-2 intensity slider are session-only overrides.
  Switching engines uses that engine's default preset; switching back to the
  album engine restores its configured preset. Album changes restore both
  configured engine and intensity. Reloading also discards overrides.
  They never modify album files, persist settings, or change volume.
- At widths up to 700 px, song choices use a wrapping two-column grid below
  the circle rather than clipped orbit buttons. Transport buttons and mobile
  song choices have at least 44 px targets. Short landscape immersive layouts
  keep the side controls clear of transport buttons.

Rendering quality adapts only after sustained pressure: three seconds of frame
intervals over 25 ms or synchronous drawing over 12 ms reduces decorative
Lissajous trails and the number of drawn sparks. There are two reduced levels
(70% and 40% decoration); ten healthy seconds per level restores detail.
Isolated spikes and gaps over 100 ms do not trigger a quality change.
Analysis cadence, pulse timing, event detection/counts, volume, presets, and
terrain history are unchanged. Palette values are cached after theme updates.
There is no quality settings panel.

### Song-level visual evolution

Automatic scene evolution follows sustained normalized energy, not authored
timestamps or recognized song sections. Quiet, building, strong, and settling
are artistic energy states, not claims about verses, choruses, or instrumentation.

- Energy is smoothed with 1.5-second attack and 2.5-second release. A candidate
  state needs two continuous seconds of evidence, with separate entry/exit
  thresholds to avoid chatter.
- Quiet enters building above 0.24; building enters strong above 0.36 or
  settling below 0.16. Strong settles below 0.28. Settling returns to quiet
  below 0.18 or building above 0.28. These are normalized-energy heuristics;
  not every passage or song must reach strong.
- Scene strength blends over 3-second attack / 4-second release rather than
  jumping when the state changes. It controls decorative density (0.65-1.35),
  trail persistence (0.75-1.35), and at most 3.5% additional expansion.
  Lissajous trail count, circle petals, Tonnetz region opacity, and visible
  shared sparks vary while detector events and harmonic meaning stay unchanged.
- All engines slowly vary blending between the existing album accent colors.
  No random palette selection, new flashes, or new playback settings are added.
- Track changes, seeking, engine/view changes, and visibility/long-gap resets
  clear scene memory. The destination passage is learned from fresh samples;
  no skipped transitions are replayed. Unavailable/silent input cannot build.
- Reduced motion bypasses all evolving geometry and palette effects, retaining
  the stationary scene. Session intensity does not alter scene thresholds.

Circle of Fifths now uses only its configured constant-direction rotation.
Audio-driven camera angle offsets and asymmetric bass deformation no longer
pull the wheel backward; its radial and brightness response remains. Other
engines retain steady camera drift without multiplying elapsed time by treble.

Automatic evolution is the completed baseline. Curated per-track cues remain
an optional, separately scoped follow-up, not a requirement for deployment.

### Harmonic and pulse estimates

Harmonic analysis uses interpolated spectral peaks from the 8192-point FFT,
rejects low-level/unprominent peaks, and downweights plausible overtones only
when a lower fundamental is present. Chroma smooths with 150 ms attack and
650 ms release. Confidence combines tonal spectral power and pitch-class
concentration; weak evidence produces subtle activity, not alleged chords.
Tonnetz cells use actual equilateral neighbors, with fifth/third adjacency;
pathways fade with a 1.2-second release.

Pulse estimation uses a bounded 12-second/48-onset window, searches 60-180 BPM,
requires at least six events spanning two seconds, and checks interval and
phase consistency. A confident cursor uses media playback position and an
estimated onset anchor, independently of decorative wheel/camera rotation.
The badge explicitly distinguishes a **pulse estimate** from **artistic cycles**.
Short silent gaps between beats retain timing; two seconds without an onset
removes confidence and three seconds clears the event window.
Pause, mute, buffering, seeking, track changes, and visibility resets require
reacquisition. Low confidence leaves free-running artistic wheels with
onset-driven accents, rather than forcing synchronization.

These are estimates, not instrument separation, chord recognition, or reliable
meter/downbeat detection. The first onset is only a timing anchor, not a known
downbeat. Syncopation, missed events, tempo changes, and half/double-time ambiguity
can prevent or mislead pulse estimation. Lissajous ratios and Euclidean meters
remain preset-defined artistic geometry; this is not a stereo oscilloscope.

### Validate audio analysis and effects

Run the dependency-free analysis, effects, geometry, comfort, and preset tests with:

```bash
npm test
```

For a real Web Audio check, start the local preview and run this in the browser
developer console (after interacting with the page to permit audio):

```javascript
const { checkWebAudio } = await import("./tests/web-audio-check.js");
await checkWebAudio();
```

The browser check uses muted synthetic tones and a 120 BPM click train, checks
band separation, missed/extra onsets, silence, and a p95 detection-latency target
of 80 ms, and validates the pulse estimate. It closes its temporary AudioContext afterward. It is a local
development test and is not included in the deployed site.

For real FFT harmonic checks with muted bass/triad/noise fixtures:

```javascript
const { checkHarmonics } = await import("./tests/musical-features-check.js");
await checkHarmonics();
```

For an integrated pulse-cursor regression check, start a song using the
`polyrhythm` engine with its `default` preset and nonzero volume:

```javascript
const { checkPlayerPulse } = await import("./tests/musical-features-check.js");
await checkPlayerPulse();
```

This approximately eleven-second check briefly replaces playback with an audible,
locally generated click fixture. It verifies tempo, cursor phase, and separation
from decorative rotation, then restores the original source/position and removes
its instrumentation. No library recording is uploaded.

For a controlled geometry check while a song is playing:

```javascript
const { captureVisualResponse } = await import("./tests/visual-response-check.js");
await captureVisualResponse();
```

This development-only helper temporarily supplies fixed audio/chroma metrics and spectra, measures
the active renderer's response, and restores its instrumentation afterward.
It throws on invalid captured geometry. Compare results for the same engine,
preset, and viewport using the session intensity slider at 0.5, 1, and 2.
Do not use this instrumented check for performance measurements.

For a stationary-geometry check with the browser's reduced-motion emulation
enabled, or a controlled decoration-reduction check using normal-motion
Lissajous while playing:

```javascript
const { checkLowMotion, checkAdaptiveRendering } = await import("./tests/visual-comfort-check.js");
await checkLowMotion(); // Reduced motion must be enabled.
// Alternatively, disable reduced motion and select Lissajous:
await checkAdaptiveRendering();
```

The quality check injects slow-frame samples and restores full detail afterward;
it does not prove naturally occurring pressure on a physical device. Both checks
restore their instrumentation and are excluded from deployment.

To check controlled quiet/strong/released scenes in the active normal-motion
engine while playing:

```javascript
const { checkSceneRendering } = await import("./tests/scene-evolution-check.js");
await checkSceneRendering();
```

This advances the integrated scene model with synthetic sustained energy,
captures actual Canvas expansion/trails/fading, and verifies a 50% seek clears
scene memory. It intentionally seeks the current track and restores all
instrumentation afterward. It is not a perceptual listening or performance test.

## 6. Preview locally

Node.js is required to regenerate the music manifest.

### Windows

Double-click:

```text
start-local.bat
```

### macOS or Linux

Run:

```bash
./start-local.sh
```

Or run manually:

```bash
npm run preview
```

Then open:

```text
http://localhost:8000
```

Whenever you add, remove, or rename MP3s, images, or `album.json` files, restart the preview command or run:

```bash
npm run songs
```

## 7. Build the deployable site

Run:

```bash
npm run build
```

The finished static site is created in:

```text
_site/
```

## 8. Publish to GitHub Pages

1. Create a GitHub repository.
2. Upload all project files and folders.
3. Open **Settings → Pages**.
4. Set **Source** to **GitHub Actions**.
5. Push a commit to the `main` branch.
6. Open the **Actions** tab and wait for the deployment workflow to finish.

Every later push automatically:

1. scans the `music` folder;
2. reads album configurations and image files;
3. regenerates `songs.js` and `songs.json`;
4. builds the `_site` folder;
5. deploys the updated site.

## 9. Project structure

```text
circular-music-player/
├── index.html
├── styles.css
├── app.js
├── audio-analysis.js        # shared analysis and elapsed-time helpers
├── visual-effects.js        # shared musical effects and response bounds
├── musical-features.js      # harmonic/pulse estimates, lattice and terrain helpers
├── visual-comfort.js        # control visibility and sustained quality thresholds
├── scene-evolution.js       # slow energy states and bounded artistic scene controls
├── songs.js                 # generated
├── songs.json               # generated
├── package.json
├── tests/
│   ├── audio-analysis.test.js
│   ├── visual-effects.test.js
│   ├── musical-features.test.js
│   ├── musical-features-check.js
│   ├── visual-comfort.test.js
│   ├── visual-comfort-check.js
│   ├── scene-evolution.test.js
│   ├── scene-evolution-check.js
│   ├── web-audio-check.js
│   └── visual-response-check.js
├── music/
│   ├── 01 - Dawn Collection/
│   │   ├── album.json
│   │   ├── cover.jpg
│   │   ├── background.jpg
│   │   ├── Sample 01 - First Light.mp3
│   │   └── Sample 03 - Blue Horizon.jpg
│   └── 02 - Night Collection/
│       ├── album.json
│       ├── cover.jpg
│       ├── background.jpg
│       └── Sample 02 - Quiet Orbit.mp3
├── scripts/
│   ├── generate-song-list.mjs
│   ├── build-site.mjs
│   └── preview-server.mjs
└── .github/
    └── workflows/
        └── deploy.yml
```

## Notes

- Select a song, then use Copy song link beside the volume and autoplay controls to copy its
  shareable URL. If clipboard access is unavailable or denied, the player displays
  a selected link you can copy manually.
- Shared links use `#song=` with the URL-encoded MP3 path. Opening a link selects
  the matching album and song and attempts playback from the beginning. If the
  browser blocks autoplay, tap Play to listen. Links also work when navigating
  between song hashes in an already-open player.
- Song links survive additions and reordering, but renaming or moving an MP3
  breaks its existing links. Missing songs show a message and leave the library
  available. Opening the site without a song link keeps the normal album browser.
- MP3 is the supported audio format in this version.
- Keep all configured artwork paths inside their album folder.
- Do not manually edit `songs.js` or `songs.json`; they are generated files.
- Relative paths are used throughout so the player works at a project Pages URL such as `username.github.io/repository-name/`.
- Audio analysis remains local in the listener's browser. No audio or usage data is uploaded anywhere.
