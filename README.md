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
- three visualizer patterns: radial bars, wave ring, and constellation;
- unchanged play, pause, previous, next, progress, volume, and autoplay controls;
- automatic generation and GitHub Pages deployment.

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
  "visualizer": "wave-ring",
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
| `visualizer` | Audio-reactive pattern | `radial-bars`, `wave-ring`, `constellation` |
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

- `radial-bars`: a glowing, mirrored spectrum with grouped frequency bands, beat pulses, and trails;
- `wave-ring`: layered harmonic rings that ripple, rotate, and expand with the music;
- `constellation`: reactive particles, orbiting points, and cross-linked geometry that respond to the spectrum.

All patterns share bass, midrange, treble, energy, and beat analysis. The canvas also keeps a fading previous frame, creating the evolving trails and motion associated with classic Winamp visualizations.

Before playback begins, each pattern has a subtle idle animation. When playback starts, the visualization switches to measured audio frequencies.

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
├── songs.js                 # generated
├── songs.json               # generated
├── package.json
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

- MP3 is the supported audio format in this version.
- Keep all configured artwork paths inside their album folder.
- Do not manually edit `songs.js` or `songs.json`; they are generated files.
- Relative paths are used throughout so the player works at a project Pages URL such as `username.github.io/repository-name/`.
- Audio analysis remains local in the listener's browser. No audio or usage data is uploaded anywhere.
