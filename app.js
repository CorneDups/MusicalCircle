(() => {
  "use strict";

  const audio = document.querySelector("#audioPlayer");
  const musicCircle = document.querySelector("#musicCircle");
  const songButtonsContainer = document.querySelector("#songButtons");
  const folderSelect = document.querySelector("#folderSelect");
  const folderSummary = document.querySelector("#folderSummary");
  const albumTitle = document.querySelector("#albumTitle");
  const albumArtist = document.querySelector("#albumArtist");
  const albumDescription = document.querySelector("#albumDescription");
  const albumCoverImage = document.querySelector("#albumCoverImage");
  const albumCoverFallback = document.querySelector("#albumCoverFallback");
  const visualStyleBadge = document.querySelector("#visualStyleBadge");
  const albumBackdrop = document.querySelector("#albumBackdrop");
  const centrePlayer = document.querySelector("#centrePlayer");
  const artworkImage = document.querySelector("#artworkImage");
  const artworkFallback = document.querySelector("#artworkFallback");
  const nowPlaying = document.querySelector("#nowPlaying");
  const trackArtist = document.querySelector("#trackArtist");
  const songPosition = document.querySelector("#songPosition");
  const playButton = document.querySelector("#playButton");
  const previousButton = document.querySelector("#previousButton");
  const nextButton = document.querySelector("#nextButton");
  const progress = document.querySelector("#progress");
  const currentTime = document.querySelector("#currentTime");
  const duration = document.querySelector("#duration");
  const volume = document.querySelector("#volume");
  const autoplay = document.querySelector("#autoplay");
  const statusMessage = document.querySelector("#statusMessage");
  const visualizerCanvas = document.querySelector("#visualizerCanvas");
  const visualizerContext = visualizerCanvas.getContext("2d");
  const VISUALIZER_IDS = [
    "circle-of-fifths",
    "lissajous",
    "tonnetz",
    "polyrhythm",
    "spectral-terrain"
  ];

  const DEFAULT_ALBUM = {
    title: "Music",
    artist: "",
    description: "",
    cover: null,
    background: null,
    accent: "",
    accentSecondary: "",
    visualizer: "circle-of-fifths",
    visualizerPreset: "default",
    visualizerIntensity: 1,
    artworkMotion: "pulse",
    preferEmbeddedArtwork: true
  };

  const state = {
    folders: [],
    selectedFolderIndex: -1,
    songs: [],
    currentIndex: -1,
    played: new Set(),
    seeking: false,
    album: { ...DEFAULT_ALBUM },
    artworkRequest: 0,
    embeddedArtworkCache: new Map(),
    visualizerWidth: 0,
    visualizerHeight: 0,
    visualizerDpr: 1,
    audioContext: null,
    analyser: null,
    sourceNode: null,
    frequencyData: null,
    visualizerConfigs: {},
    terrainHistory: [],
    terrainFrame: 0,
    visualizerMetrics: {
      bass: 0,
      mids: 0,
      treble: 0,
      energy: 0,
      beat: 0
    }
  };

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function cleanAlbum(album, folderName) {
    const input = album && typeof album === "object" ? album : {};
    return {
      ...DEFAULT_ALBUM,
      title: typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : folderName,
      artist: typeof input.artist === "string" ? input.artist.trim() : "",
      description: typeof input.description === "string" ? input.description.trim() : "",
      cover: typeof input.cover === "string" ? input.cover.replaceAll("\\", "/") : null,
      background: typeof input.background === "string" ? input.background.replaceAll("\\", "/") : null,
      accent: typeof input.accent === "string" ? input.accent.trim() : "",
      accentSecondary: typeof input.accentSecondary === "string" ? input.accentSecondary.trim() : "",
      visualizer: VISUALIZER_IDS.includes(input.visualizer)
        ? input.visualizer
        : "circle-of-fifths",
      visualizerPreset: typeof input.visualizerPreset === "string" && input.visualizerPreset.trim()
        ? input.visualizerPreset.trim()
        : "default",
      visualizerIntensity: Number.isFinite(Number(input.visualizerIntensity))
        ? Math.min(Math.max(Number(input.visualizerIntensity), 0.5), 2)
        : 1,
      artworkMotion: ["still", "pulse", "rotate"].includes(input.artworkMotion)
        ? input.artworkMotion
        : "pulse",
      preferEmbeddedArtwork: input.preferEmbeddedArtwork !== false
    };
  }

  function normalizeSongs(input) {
    if (!Array.isArray(input)) return [];

    return input
      .filter((song) => song && typeof song.file === "string" && /\.mp3$/i.test(song.file))
      .map((song) => ({
        file: song.file.replaceAll("\\", "/"),
        title: typeof song.title === "string" && song.title.trim()
          ? song.title.trim()
          : song.file.split(/[\\/]/).pop().replace(/\.mp3$/i, ""),
        artist: typeof song.artist === "string" ? song.artist.trim() : "",
        artwork: typeof song.artwork === "string" ? song.artwork.replaceAll("\\", "/") : null
      }))
      .sort((a, b) => naturalCompare(a.file, b.file));
  }

  function normalizeManifest(input) {
    if (Array.isArray(input?.folders)) {
      return input.folders
        .filter((folder) => folder && typeof folder === "object")
        .map((folder) => {
          const folderPath = typeof folder.path === "string"
            ? folder.path.replaceAll("\\", "/")
            : "";
          const name = typeof folder.name === "string" && folder.name.trim()
            ? folder.name.trim()
            : folderPath || "Music (root)";

          return {
            path: folderPath,
            name,
            album: cleanAlbum(folder.album, folderPath.split("/").pop() || "Music"),
            songs: normalizeSongs(folder.songs)
          };
        })
        .filter((folder) => folder.songs.length > 0)
        .sort((a, b) => naturalCompare(a.name, b.name));
    }

    const legacySongs = normalizeSongs(Array.isArray(input) ? input : input?.songs);
    return legacySongs.length > 0
      ? [{ path: "", name: "Music (root)", album: { ...DEFAULT_ALBUM }, songs: legacySongs }]
      : [];
  }

  function encodePath(pathValue) {
    return pathValue
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  function musicAssetUrl(pathValue) {
    return pathValue ? `./music/${encodePath(pathValue)}` : "";
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function titleInitials(value) {
    const words = String(value || "Music")
      .replace(/^\d+\s*[-_.]?\s*/, "")
      .split(/\s+/)
      .filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "♪";
  }

  function setStatus(message = "", isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", isError);
  }

  function updateMediaSession(song = null) {
    if (!("mediaSession" in navigator)) return;

    if (song && "MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist || state.album.artist || "",
        album: state.album.title
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }

  function setMediaSessionPlaybackState(value) {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = value;
  }

  function validCssColor(value) {
    return typeof value === "string" && value.trim() && CSS.supports("color", value.trim());
  }

  function applyAlbumTheme(album) {
    const root = document.documentElement;
    root.style.setProperty("--accent", validCssColor(album.accent) ? album.accent : "#8ebcff");
    root.style.setProperty(
      "--accent-secondary",
      validCssColor(album.accentSecondary) ? album.accentSecondary : "#c18cff"
    );

    centrePlayer.classList.remove("motion-still", "motion-pulse", "motion-rotate");
    centrePlayer.classList.add(`motion-${album.artworkMotion}`);
  }

  function setBackdrop(pathValue) {
    if (!pathValue) {
      albumBackdrop.style.backgroundImage = "";
      albumBackdrop.classList.remove("has-image");
      return;
    }

    const url = musicAssetUrl(pathValue);
    albumBackdrop.style.backgroundImage = `url(${JSON.stringify(url)})`;
    albumBackdrop.classList.add("has-image");
  }

  function setAlbumCover(pathValue, title) {
    albumCoverFallback.textContent = titleInitials(title);
    if (!pathValue) {
      albumCoverImage.hidden = true;
      albumCoverImage.removeAttribute("src");
      albumCoverImage.alt = "";
      albumCoverFallback.hidden = false;
      return;
    }

    albumCoverFallback.hidden = true;
    albumCoverImage.hidden = false;
    albumCoverImage.alt = `${title} album cover`;
    albumCoverImage.src = musicAssetUrl(pathValue);
    albumCoverImage.onerror = () => {
      albumCoverImage.hidden = true;
      albumCoverFallback.hidden = false;
    };
  }

  function setArtwork(url, altText) {
    if (!url) {
      artworkImage.hidden = true;
      artworkImage.removeAttribute("src");
      artworkImage.alt = "";
      artworkFallback.hidden = false;
      artworkFallback.textContent = titleInitials(altText);
      return;
    }

    artworkFallback.hidden = true;
    artworkImage.hidden = false;
    artworkImage.alt = altText;
    artworkImage.src = url;
    artworkImage.onerror = () => {
      if (artworkImage.src === url || artworkImage.getAttribute("src") === url) {
        setArtwork("", altText);
      }
    };
  }

  function setKnownArtwork(song = null) {
    const fallbackPath = song?.artwork || state.album.cover;
    const label = song?.title || state.album.title;
    setArtwork(fallbackPath ? musicAssetUrl(fallbackPath) : "", label);
  }

  function clearEmbeddedArtworkCache() {
    state.embeddedArtworkCache.forEach((url) => {
      if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    state.embeddedArtworkCache.clear();
  }

  function syncSafeInteger(bytes, offset) {
    return ((bytes[offset] & 0x7f) << 21)
      | ((bytes[offset + 1] & 0x7f) << 14)
      | ((bytes[offset + 2] & 0x7f) << 7)
      | (bytes[offset + 3] & 0x7f);
  }

  function bigEndianInteger(bytes, offset) {
    return (bytes[offset] * 0x1000000)
      + (bytes[offset + 1] << 16)
      + (bytes[offset + 2] << 8)
      + bytes[offset + 3];
  }

  function findByteSequence(bytes, sequence, start, end) {
    outer: for (let index = start; index <= end - sequence.length; index += 1) {
      for (let part = 0; part < sequence.length; part += 1) {
        if (bytes[index + part] !== sequence[part]) continue outer;
      }
      return index;
    }
    return -1;
  }

  function findDescriptionEnd(bytes, start, end, encoding) {
    if (encoding === 1 || encoding === 2) {
      for (let index = start; index + 1 < end; index += 2) {
        if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
      }
      return end;
    }

    for (let index = start; index < end; index += 1) {
      if (bytes[index] === 0) return index + 1;
    }
    return end;
  }

  function parseApicFrame(bytes, frameStart, frameSize, version) {
    const frameEnd = Math.min(frameStart + frameSize, bytes.length);
    if (frameStart >= frameEnd) return null;

    let cursor = frameStart;
    const encoding = bytes[cursor];
    cursor += 1;
    let mime = "image/jpeg";

    if (version === 2) {
      const format = String.fromCharCode(...bytes.slice(cursor, cursor + 3)).toLowerCase();
      cursor += 3;
      mime = format.includes("png") ? "image/png" : "image/jpeg";
    } else {
      const mimeEnd = bytes.indexOf(0, cursor);
      if (mimeEnd < 0 || mimeEnd >= frameEnd) return null;
      mime = new TextDecoder("latin1").decode(bytes.slice(cursor, mimeEnd)) || mime;
      cursor = mimeEnd + 1;
    }

    cursor += 1; // Picture type.
    cursor = findDescriptionEnd(bytes, cursor, frameEnd, encoding);
    if (cursor >= frameEnd) return null;

    const imageBytes = bytes.slice(cursor, frameEnd);
    if (imageBytes.length < 16) return null;
    return URL.createObjectURL(new Blob([imageBytes], { type: mime }));
  }

  function extractEmbeddedArtwork(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
      return null;
    }

    const version = bytes[3];
    const tagEnd = Math.min(bytes.length, 10 + syncSafeInteger(bytes, 6));

    if (version === 2) {
      const marker = [0x50, 0x49, 0x43];
      const frameOffset = findByteSequence(bytes, marker, 10, tagEnd);
      if (frameOffset < 0 || frameOffset + 6 >= tagEnd) return null;
      const frameSize = (bytes[frameOffset + 3] << 16)
        | (bytes[frameOffset + 4] << 8)
        | bytes[frameOffset + 5];
      return parseApicFrame(bytes, frameOffset + 6, frameSize, 2);
    }

    const marker = [0x41, 0x50, 0x49, 0x43];
    const frameOffset = findByteSequence(bytes, marker, 10, tagEnd);
    if (frameOffset < 0 || frameOffset + 10 >= tagEnd) return null;
    const frameSize = version === 4
      ? syncSafeInteger(bytes, frameOffset + 4)
      : bigEndianInteger(bytes, frameOffset + 4);
    return parseApicFrame(bytes, frameOffset + 10, frameSize, version);
  }

  async function fetchEmbeddedArtwork(song) {
    if (!state.album.preferEmbeddedArtwork) return null;
    if (state.embeddedArtworkCache.has(song.file)) {
      return state.embeddedArtworkCache.get(song.file);
    }

    const url = musicAssetUrl(song.file);
    try {
      const initialLimit = 512 * 1024;
      let response = await fetch(url, {
        headers: { Range: `bytes=0-${initialLimit - 1}` },
        cache: "force-cache"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let buffer = await response.arrayBuffer();
      const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 10));

      if (header.length >= 10 && header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
        const totalTagBytes = 10 + syncSafeInteger(header, 6);
        if (totalTagBytes > buffer.byteLength && totalTagBytes <= 8 * 1024 * 1024) {
          response = await fetch(url, {
            headers: { Range: `bytes=0-${totalTagBytes - 1}` },
            cache: "force-cache"
          });
          if (response.ok) buffer = await response.arrayBuffer();
        }
      }

      const artworkUrl = extractEmbeddedArtwork(buffer);
      state.embeddedArtworkCache.set(song.file, artworkUrl);
      return artworkUrl;
    } catch (error) {
      console.warn(`Embedded artwork could not be read from ${song.file}:`, error);
      state.embeddedArtworkCache.set(song.file, null);
      return null;
    }
  }

  async function updateSongArtwork(song) {
    const request = ++state.artworkRequest;
    setKnownArtwork(song);
    const embedded = await fetchEmbeddedArtwork(song);
    if (request === state.artworkRequest && embedded) {
      setArtwork(embedded, `${song.title} embedded artwork`);
    }
  }

  function distributeAcrossRings(songCount) {
    if (songCount <= 0) return [];

    const maxPerRing = songCount <= 10 ? 10 : 12;
    const ringCount = Math.ceil(songCount / maxPerRing);
    const baseSize = Math.floor(songCount / ringCount);
    const extra = songCount % ringCount;
    const ringSizes = Array.from(
      { length: ringCount },
      (_, index) => baseSize + (index < extra ? 1 : 0)
    );

    const minRadius = ringCount === 1 ? 42 : 29;
    const maxRadius = 44;
    const radii = Array.from({ length: ringCount }, (_, index) => {
      if (ringCount === 1) return maxRadius;
      return minRadius + ((maxRadius - minRadius) * index) / (ringCount - 1);
    });

    const placements = [];
    let globalIndex = 0;

    ringSizes.forEach((ringSize, ringIndex) => {
      const angleOffset = ringIndex % 2 === 0
        ? -Math.PI / 2
        : -Math.PI / 2 + Math.PI / ringSize;

      for (let indexInRing = 0; indexInRing < ringSize; indexInRing += 1) {
        const angle = angleOffset + (Math.PI * 2 * indexInRing) / ringSize;
        const radius = radii[ringIndex];
        placements[globalIndex] = {
          left: 50 + radius * Math.cos(angle),
          top: 50 + radius * Math.sin(angle)
        };
        globalIndex += 1;
      }
    });

    return placements;
  }

  function resetPlayer() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    state.currentIndex = -1;
    state.played = new Set();
    state.seeking = false;
    state.artworkRequest += 1;
    progress.value = "0";
    currentTime.textContent = "0:00";
    duration.textContent = "0:00";
    nowPlaying.textContent = "Select a song";
    nowPlaying.removeAttribute("title");
    trackArtist.textContent = state.album.artist;
    playButton.textContent = "▶";
    playButton.setAttribute("aria-label", "Play");
    centrePlayer.classList.remove("is-playing");
    updateMediaSession();
    setMediaSessionPlaybackState("none");
    setKnownArtwork();
  }

  function renderFolderOptions() {
    folderSelect.replaceChildren();

    if (state.folders.length === 0) {
      const option = document.createElement("option");
      option.textContent = "No folders with MP3 files";
      option.value = "";
      folderSelect.append(option);
      folderSelect.disabled = true;
      folderSummary.textContent = "No music is available.";
      return;
    }

    folderSelect.disabled = false;
    state.folders.forEach((folder, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${folder.name} (${folder.songs.length})`;
      option.selected = index === state.selectedFolderIndex;
      folderSelect.append(option);
    });
  }

  function renderSongs() {
    songButtonsContainer.replaceChildren();

    if (state.songs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<strong>No MP3 files found.</strong><br>Add MP3 files to a folder inside <code>music</code>, run the generator, and reload the page.";
      songButtonsContainer.append(empty);
      nowPlaying.textContent = "No songs found";
      songPosition.textContent = "0 of 0";
      playButton.disabled = true;
      previousButton.disabled = true;
      nextButton.disabled = true;
      return;
    }

    playButton.disabled = false;
    previousButton.disabled = false;
    nextButton.disabled = false;

    const placements = distributeAcrossRings(state.songs.length);

    state.songs.forEach((song, index) => {
      const button = document.createElement("button");
      const placement = placements[index];

      button.type = "button";
      button.className = "song-button";
      button.dataset.index = String(index);
      button.textContent = song.title;
      button.title = song.title;
      button.setAttribute("aria-label", `Play ${song.title}`);
      button.style.left = `${placement.left}%`;
      button.style.top = `${placement.top}%`;

      if (state.currentIndex === index) button.classList.add("active");
      if (state.played.has(index)) button.classList.add("played");

      button.addEventListener("click", () => selectSong(index, true));
      songButtonsContainer.append(button);
    });

    songPosition.textContent = state.currentIndex >= 0
      ? `${state.currentIndex + 1} of ${state.songs.length}`
      : `0 of ${state.songs.length}`;
  }

  function updateActiveButton() {
    const buttons = songButtonsContainer.querySelectorAll(".song-button");
    buttons.forEach((button, index) => {
      button.classList.toggle("active", index === state.currentIndex);
      button.classList.toggle("played", state.played.has(index));
      if (index === state.currentIndex) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  function visualizerName(style) {
    return {
      "circle-of-fifths": "Circle of Fifths",
      lissajous: "Harmonic Lissajous",
      tonnetz: "Tonnetz lattice",
      polyrhythm: "Polyrhythm wheels",
      "spectral-terrain": "Spectral terrain"
    }[style] || "Circle of Fifths";
  }

  function updateAlbumPresentation(folder) {
    state.album = folder.album;
    state.terrainHistory = [];
    applyAlbumTheme(state.album);
    albumTitle.textContent = state.album.title;
    albumArtist.textContent = state.album.artist || "Independent collection";
    albumDescription.textContent = state.album.description || "Select a song to begin the visual experience.";
    visualStyleBadge.textContent = visualizerName(state.album.visualizer);
    setAlbumCover(state.album.cover, state.album.title);
    setBackdrop(state.album.background || state.album.cover);
  }

  function chooseFolder(index, announce = true) {
    if (state.folders.length === 0) return;

    const safeIndex = Math.min(Math.max(index, 0), state.folders.length - 1);
    const folder = state.folders[safeIndex];

    clearEmbeddedArtworkCache();
    state.selectedFolderIndex = safeIndex;
    state.songs = folder.songs;
    updateAlbumPresentation(folder);
    resetPlayer();
    renderFolderOptions();
    renderSongs();

    folderSummary.textContent = `${folder.songs.length} song${folder.songs.length === 1 ? "" : "s"} in ${folder.name}`;
    if (announce) setStatus(`Loaded “${state.album.title}”.`);
  }

  async function ensureAudioGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!state.audioContext) {
      state.audioContext = new AudioContextClass();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 512;
      state.analyser.smoothingTimeConstant = 0.82;
      state.sourceNode = state.audioContext.createMediaElementSource(audio);
      state.sourceNode.connect(state.analyser);
      state.analyser.connect(state.audioContext.destination);
      state.frequencyData = new Uint8Array(state.analyser.frequencyBinCount);
    }

    if (state.audioContext.state === "suspended") await state.audioContext.resume();
  }

  function waitForAudioReady(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      if (audio.readyState >= 2) {
        resolve();
        return;
      }

      let settled = false;
      const cleanup = () => {
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("error", onError);
        window.clearTimeout(timeoutId);
      };
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onReady = () => finish(resolve);
      const onError = () => finish(() => reject(new Error("Audio could not be loaded")));
      const timeoutId = window.setTimeout(() => {
        finish(() => reject(new Error("Audio took too long to load")));
      }, timeoutMs);

      audio.addEventListener("canplay", onReady, { once: true });
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("loadedmetadata", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
    });
  }

  async function selectSong(index, shouldPlay) {
    if (state.songs.length === 0) return;

    const safeIndex = (index + state.songs.length) % state.songs.length;
    const song = state.songs[safeIndex];
    const changed = safeIndex !== state.currentIndex;

    state.currentIndex = safeIndex;
    state.played.add(safeIndex);

    if (changed) {
      audio.src = musicAssetUrl(song.file);
      audio.load();
      progress.value = "0";
      currentTime.textContent = "0:00";
      duration.textContent = "0:00";
    }

    nowPlaying.textContent = song.title;
    nowPlaying.title = song.title;
    trackArtist.textContent = song.artist || state.album.artist;
    songPosition.textContent = `${safeIndex + 1} of ${state.songs.length}`;
    updateMediaSession(song);
    updateActiveButton();
    updateSongArtwork(song);
    setStatus(shouldPlay ? `Loading “${song.title}”…` : `Selected “${song.title}”.`);

    if (shouldPlay) {
      try {
        await ensureAudioGraph();
        await waitForAudioReady();
        await audio.play();
      } catch (error) {
        const message = error?.message === "Audio took too long to load"
          ? "The MP3 is taking too long to load. Please try again in a moment."
          : "Playback was blocked or the MP3 could not be loaded. Try again, or open the app from a local web server.";
        setStatus(message, true);
        console.error(error);
      }
    }
  }

  async function togglePlayback() {
    if (state.songs.length === 0) return;

    if (state.currentIndex < 0) {
      await selectSong(0, true);
      return;
    }

    if (audio.paused) {
      try {
        await ensureAudioGraph();
        await waitForAudioReady();
        await audio.play();
      } catch (error) {
        const message = error?.message === "Audio took too long to load"
          ? "The current track is taking too long to load. Please try again shortly."
          : "The browser could not start playback. Try again or reload the page.";
        setStatus(message, true);
        console.error(error);
      }
    } else {
      audio.pause();
    }
  }

  function goToRelativeSong(offset, shouldPlay = true) {
    if (state.songs.length === 0) return;
    const startingIndex = state.currentIndex < 0 ? 0 : state.currentIndex;
    selectSong(startingIndex + offset, shouldPlay);
  }

  function updateProgress() {
    if (state.seeking || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    progress.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    currentTime.textContent = formatTime(audio.currentTime);
    duration.textContent = formatTime(audio.duration);
  }

  function resizeVisualizer() {
    const rectangle = musicCircle.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.visualizerWidth = rectangle.width;
    state.visualizerHeight = rectangle.height;
    state.visualizerDpr = dpr;
    visualizerCanvas.width = Math.max(1, Math.round(rectangle.width * dpr));
    visualizerCanvas.height = Math.max(1, Math.round(rectangle.height * dpr));
    visualizerContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function analyserValues(time) {
    const length = state.frequencyData?.length || 256;
    let values;
    if (state.analyser && state.frequencyData && !audio.paused) {
      state.analyser.getByteFrequencyData(state.frequencyData);
      values = state.frequencyData;
    } else {
      values = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        values[index] = 18 + Math.round(10 * (1 + Math.sin(time * 0.0012 + index * 0.19)));
      }
    }

    const averageRange = (start, end) => {
      let total = 0;
      const limit = Math.min(end, values.length);
      for (let index = start; index < limit; index += 1) total += values[index];
      return limit > start ? total / ((limit - start) * 255) : 0;
    };
    const previous = state.visualizerMetrics;
    const bass = averageRange(1, Math.floor(values.length * 0.08));
    const mids = averageRange(Math.floor(values.length * 0.08), Math.floor(values.length * 0.38));
    const treble = averageRange(Math.floor(values.length * 0.38), Math.floor(values.length * 0.8));
    const energy = Math.min(1, bass * 0.48 + mids * 0.34 + treble * 0.18);
    const beat = Math.max(0, Math.min(1, bass - previous.bass * 1.035));
    state.visualizerMetrics = {
      bass: previous.bass * 0.72 + bass * 0.28,
      mids: previous.mids * 0.78 + mids * 0.22,
      treble: previous.treble * 0.8 + treble * 0.2,
      energy: previous.energy * 0.7 + energy * 0.3,
      beat: previous.beat * 0.62 + beat * 0.38
    };
    return values;
  }

  function drawVisualizerAtmosphere(ctx, cx, cy, size, time) {
    const { bass, mids, treble, beat } = state.visualizerMetrics;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const secondary = getComputedStyle(document.documentElement).getPropertyValue("--accent-secondary").trim();
    const pulse = 1 + beat * 0.16 + bass * 0.04;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.08 + bass * 0.16;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, size * 0.003);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.3 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.06 + treble * 0.12;
    ctx.strokeStyle = secondary;
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.36 + mids * 0.05) * (2 - pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    return time;
  }

  function drawRadialBars(ctx, values, cx, cy, size, time) {
    const { bass, mids, treble, beat } = state.visualizerMetrics;
    const bars = 72;
    const baseRadius = size * (0.18 + bass * 0.025);
    const maximumLength = size * (0.2 + mids * 0.08) * state.album.visualizerIntensity;
    const phase = time * (0.00018 + treble * 0.00015);
    const outerRadius = baseRadius + maximumLength;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const secondary = getComputedStyle(document.documentElement).getPropertyValue("--accent-secondary").trim();
    const gradient = ctx.createLinearGradient(cx - outerRadius, cy - outerRadius, cx + outerRadius, cy + outerRadius);
    gradient.addColorStop(0, secondary);
    gradient.addColorStop(0.5, accent);
    gradient.addColorStop(1, secondary);

    ctx.strokeStyle = gradient;
    ctx.lineCap = "round";
    ctx.shadowBlur = size * 0.018;
    ctx.shadowColor = accent;

    for (let index = 0; index < bars; index += 1) {
      const normalized = index / (bars - 1);
      const startBin = Math.max(2, Math.floor(Math.pow(normalized, 1.65) * values.length * 0.78));
      const endBin = Math.max(startBin + 1, Math.floor(Math.pow((index + 1) / bars, 1.65) * values.length * 0.78));
      let total = 0;
      let samples = 0;

      for (let bin = startBin; bin <= endBin && bin < values.length; bin += 1) {
        total += values[bin];
        samples += 1;
      }

      const average = samples > 0 ? total / samples / 255 : 0;
      const idleMovement = audio.paused ? 0.06 * (1 + Math.sin(time * 0.0014 + index * 0.3)) : 0;
      const value = Math.min(1, Math.pow(average, 0.72) + idleMovement + beat * 0.16);
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / bars + phase;
      const mirroredAngle = -Math.PI / 2 - (Math.PI * 2 * index) / bars - phase;
      const length = size * 0.025 + value * maximumLength;

      [angle, mirroredAngle].forEach((barAngle) => {
        const startX = cx + Math.cos(barAngle) * baseRadius;
        const startY = cy + Math.sin(barAngle) * baseRadius;
        const endX = cx + Math.cos(barAngle) * (baseRadius + length);
        const endY = cy + Math.sin(barAngle) * (baseRadius + length);
        ctx.globalAlpha = 0.2 + value * 0.8;
        ctx.lineWidth = Math.max(1.2, size * (0.002 + value * 0.003));
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      });
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1, size * 0.002);
    ctx.beginPath();
    for (let index = 0; index <= bars; index += 1) {
      const normalized = index / bars;
      const bin = Math.min(values.length - 1, Math.floor(Math.pow(normalized, 1.65) * values.length * 0.78));
      const value = Math.pow(values[bin] / 255, 0.72);
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / bars + phase;
      const radius = baseRadius + size * 0.012 + value * size * 0.055;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawWaveRing(ctx, values, cx, cy, size, time) {
    const { bass, mids, treble, beat } = state.visualizerMetrics;
    const points = 128;
    const baseRadius = size * (0.2 + bass * 0.04);
    const amplitude = size * (0.08 + mids * 0.08) * state.album.visualizerIntensity;
    const rings = 3;
    for (let ring = 0; ring < rings; ring += 1) {
      const ringPhase = time * (0.0002 + treble * 0.00018) * (ring % 2 ? -1 : 1);
      const ringRadius = baseRadius + ring * size * 0.055 + beat * size * 0.025;
      ctx.lineWidth = Math.max(1.2, size * (0.002 + (rings - ring) * 0.001));
      ctx.globalAlpha = 0.28 + (rings - ring) * 0.16 + beat * 0.22;
      ctx.beginPath();

      for (let index = 0; index <= points; index += 1) {
        const wrapped = index % points;
        const angle = -Math.PI / 2 + (Math.PI * 2 * wrapped) / points + ringPhase;
        const bin = Math.floor((wrapped / points) * values.length * 0.72);
        const value = values[bin] / 255;
        const harmonic = values[Math.min(values.length - 1, bin * 2 + 2)] / 255;
        const idleMovement = audio.paused ? 0.035 * Math.sin(time * 0.0018 + wrapped * 0.12) : 0;
        const radius = ringRadius + (value * 0.8 + harmonic * 0.2 + idleMovement) * amplitude;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawConstellation(ctx, values, cx, cy, size, time) {
    const { bass, mids, treble, beat } = state.visualizerMetrics;
    const points = 42;
    const baseRadius = size * (0.23 + bass * 0.035);
    const spread = size * (0.085 + mids * 0.07) * state.album.visualizerIntensity;
    const positions = [];

    for (let index = 0; index < points; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / points;
      const value = values[Math.floor((index / points) * values.length * 0.76)] / 255;
      const drift = Math.sin(time * (0.0007 + treble * 0.0008) + index * 1.7) * size * 0.008;
      const radius = baseRadius + value * spread + drift + beat * size * 0.04;
      positions.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        value
      });
    }

    ctx.lineWidth = Math.max(1, size * 0.0018);
    for (let index = 0; index < positions.length; index += 1) {
      const current = positions[index];
      const next = positions[(index + 1) % positions.length];
      ctx.globalAlpha = 0.12 + Math.max(current.value, next.value) * 0.3 + beat * 0.18;
      ctx.beginPath();
      ctx.moveTo(current.x, current.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();

      if (index % 3 === 0) {
        const opposite = positions[(index + Math.floor(points / 2)) % positions.length];
        ctx.globalAlpha = 0.05 + treble * 0.18;
        ctx.beginPath();
        ctx.moveTo(current.x, current.y);
        ctx.lineTo(opposite.x, opposite.y);
        ctx.stroke();
      }
    }

    positions.forEach((point) => {
      ctx.globalAlpha = 0.45 + point.value * 0.55;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.4 + point.value * 3.2 + beat * 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function currentVisualizerPreset() {
    const config = state.visualizerConfigs[state.album.visualizer] || {};
    const presets = config.presets || {};
    return presets[state.album.visualizerPreset]
      || presets[config.defaultPreset]
      || presets.default
      || {};
  }

  function pitchClassEnergy(values) {
    const chroma = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    const sampleRate = state.audioContext?.sampleRate || 44100;
    const fftSize = state.analyser?.fftSize || values.length * 2;

    for (let bin = 1; bin < values.length * 0.75; bin += 1) {
      const frequency = (bin * sampleRate) / fftSize;
      if (frequency < 55) continue;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      const pitchClass = ((midi % 12) + 12) % 12;
      chroma[pitchClass] += Math.pow(values[bin] / 255, 1.35);
      counts[pitchClass] += 1;
    }

    return chroma.map((value, index) => counts[index] ? Math.min(1, value / counts[index] * 3.2) : 0);
  }

  function drawCircleOfFifths(ctx, values, cx, cy, size, time, preset) {
    const labels = ["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"];
    const fifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    const chroma = pitchClassEnergy(values);
    const radius = size * (preset.radius || 0.34);
    const rotation = time * (preset.rotationSpeed || 0) - Math.PI / 2;
    const positions = fifths.map((pitchClass, index) => {
      const angle = rotation + index * Math.PI * 2 / 12;
      const energy = chroma[pitchClass];
      return {
        x: cx + Math.cos(angle) * radius * (1 + energy * 0.08),
        y: cy + Math.sin(angle) * radius * (1 + energy * 0.08),
        energy,
        angle
      };
    });

    ctx.globalAlpha = preset.polygonAlpha || 0.45;
    ctx.lineWidth = Math.max(1, size * 0.0025);
    ctx.beginPath();
    positions.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.stroke();

    if (preset.mirror) {
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      [...positions].reverse().forEach((point, index) => {
        const x = cx + (point.x - cx) * (0.58 + point.energy * 0.3);
        const y = cy + (point.y - cy) * (0.58 + point.energy * 0.3);
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }

    positions.forEach((point, index) => {
      ctx.globalAlpha = 0.35 + point.energy * 0.65;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.5 + point.energy * size * 0.013, 0, Math.PI * 2);
      ctx.fill();
      if (preset.labels) {
        ctx.globalAlpha = 0.55 + point.energy * 0.45;
        ctx.font = `${Math.max(10, size * 0.018)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labels[index], point.x + Math.cos(point.angle) * size * 0.028, point.y + Math.sin(point.angle) * size * 0.028);
      }
    });
  }

  function drawLissajous(ctx, values, cx, cy, size, time, preset) {
    const ratioX = Math.max(1, preset.ratioX || 3);
    const ratioY = Math.max(1, preset.ratioY || 2);
    const trails = Math.max(1, preset.trailCount || 3);
    const scale = size * (preset.scale || 0.34) * state.album.visualizerIntensity;
    const modulation = 0.72 + state.visualizerMetrics.energy * 0.65;

    for (let trail = trails - 1; trail >= 0; trail -= 1) {
      const phase = time * (preset.phaseSpeed || 0.0004) + trail * 0.12;
      ctx.globalAlpha = (0.12 + state.visualizerMetrics.energy * 0.5) * (1 - trail / (trails + 1));
      ctx.lineWidth = Math.max(0.8, (preset.lineWidth || 1.5) + (trails - trail) * 0.16);
      ctx.beginPath();
      for (let index = 0; index <= 240; index += 1) {
        const angle = index / 240 * Math.PI * 2;
        const binValue = values[Math.floor(index / 241 * values.length * 0.7)] / 255;
        const x = cx + Math.sin(angle * ratioX + phase) * scale * modulation;
        const y = cy + Math.sin(angle * ratioY) * scale * (0.82 + binValue * 0.32);
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawTonnetz(ctx, values, cx, cy, size, time, preset) {
    const chroma = pitchClassEnergy(values);
    const columns = Math.max(3, preset.columns || 9);
    const rows = Math.max(3, preset.rows || 9);
    const spacing = size * (preset.spacing || 0.09);
    const rotation = time * (preset.driftSpeed || 0);
    const nodes = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const pitchClass = ((column * 7 + row * 4) % 12 + 12) % 12;
        const localX = (column - (columns - 1) / 2 + (row % 2) * 0.5) * spacing;
        const localY = (row - (rows - 1) / 2) * spacing * 0.866;
        nodes.push({
          x: cx + localX * Math.cos(rotation) - localY * Math.sin(rotation),
          y: cy + localX * Math.sin(rotation) + localY * Math.cos(rotation),
          pitchClass,
          energy: chroma[pitchClass]
        });
      }
    }

    ctx.lineWidth = Math.max(0.7, size * 0.0012);
    for (let index = 0; index < nodes.length; index += 1) {
      const column = index % columns;
      const neighbors = [index + 1, index + columns, index + columns + (Math.floor(index / columns) % 2 ? 1 : -1)];
      neighbors.forEach((neighborIndex) => {
        if (column === columns - 1 || !nodes[neighborIndex]) return;
        const neighbor = nodes[neighborIndex];
        ctx.globalAlpha = 0.06 + Math.max(nodes[index].energy, neighbor.energy) * 0.42;
        ctx.beginPath();
        ctx.moveTo(nodes[index].x, nodes[index].y);
        ctx.lineTo(neighbor.x, neighbor.y);
        ctx.stroke();
      });
    }

    nodes.forEach((node) => {
      const active = node.energy >= (preset.activeThreshold || 0.25);
      ctx.globalAlpha = active ? 0.45 + node.energy * 0.55 : 0.12;
      ctx.beginPath();
      ctx.arc(node.x, node.y, (preset.nodeSize || 2.8) + node.energy * 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function euclideanPulse(index, steps, pulses) {
    return Math.floor((index + 1) * pulses / steps) !== Math.floor(index * pulses / steps);
  }

  function drawPolyrhythm(ctx, values, cx, cy, size, time, preset) {
    const meters = Array.isArray(preset.meters) ? preset.meters : [3, 4];
    const pulses = Array.isArray(preset.pulses) ? preset.pulses : [2, 3];
    const speed = preset.speed || 0.00035;
    meters.forEach((meterValue, ring) => {
      const meter = Math.max(2, Math.round(meterValue));
      const radius = size * (0.2 + ring * (preset.radiusStep || 0.07));
      const playhead = Math.floor((time * Math.abs(speed) * meter) % meter);
      const rotation = time * speed * (ring % 2 ? -1 : 1) - Math.PI / 2;
      ctx.globalAlpha = 0.16 + state.visualizerMetrics.mids * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      for (let step = 0; step < meter; step += 1) {
        const angle = rotation + step * Math.PI * 2 / meter;
        const active = euclideanPulse(step, meter, Math.min(meter, pulses[ring] || 1));
        const hit = step === playhead;
        const binValue = values[Math.floor((step / meter) * values.length * 0.65)] / 255;
        ctx.globalAlpha = hit ? 1 : active ? 0.58 : 0.18;
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
          (preset.nodeSize || 3.2) + binValue * 4 + (hit ? state.visualizerMetrics.beat * 8 : 0),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    });
  }

  function drawSpectralTerrain(ctx, values, cx, cy, size, time, preset) {
    const ridges = Math.max(4, preset.ridges || 24);
    const bins = Math.max(12, preset.bins || 42);
    state.terrainFrame += 1;
    if (state.terrainFrame % Math.max(1, preset.sampleEvery || 3) === 0) {
      const ridge = [];
      for (let index = 0; index < bins; index += 1) {
        const sourceIndex = Math.floor(Math.pow(index / (bins - 1), 1.5) * values.length * 0.72);
        ridge.push(values[sourceIndex] / 255);
      }
      state.terrainHistory.unshift(ridge);
      state.terrainHistory.length = Math.min(ridges, state.terrainHistory.length);
    }

    const halfWidth = size * 0.38;
    [...state.terrainHistory].reverse().forEach((ridge, reverseIndex) => {
      const depthIndex = state.terrainHistory.length - 1 - reverseIndex;
      const perspective = 0.42 + (1 - depthIndex / ridges) * 0.58;
      const baseline = cy + size * 0.27 - depthIndex * size * (preset.depth || 0.015);
      ctx.globalAlpha = 0.12 + perspective * 0.5;
      ctx.beginPath();
      ridge.forEach((value, index) => {
        const x = cx + ((index / (bins - 1)) * 2 - 1) * halfWidth * perspective;
        const y = baseline - value * size * (preset.height || 0.2) * perspective;
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.lineTo(cx + halfWidth * perspective, baseline);
      ctx.lineTo(cx - halfWidth * perspective, baseline);
      ctx.closePath();
      ctx.globalAlpha = preset.fillAlpha || 0.05;
      ctx.fill();
    });
    return time;
  }

  function drawVisualizer(time = 0) {
    const width = state.visualizerWidth;
    const height = state.visualizerHeight;
    if (width > 0 && height > 0) {
      const cx = width / 2;
      const cy = height / 2;
      const size = Math.min(width, height);
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const { beat, energy, treble } = state.visualizerMetrics;
      visualizerContext.save();
      visualizerContext.globalCompositeOperation = "source-over";
      visualizerContext.fillStyle = `rgba(7, 10, 18, ${audio.paused ? 0.2 : 0.105})`;
      visualizerContext.fillRect(0, 0, width, height);
      visualizerContext.translate(cx, cy);
      visualizerContext.rotate((time * 0.000025 * (0.6 + treble)) + beat * 0.012);
      visualizerContext.scale(1 + beat * 0.025 + energy * 0.006, 1 + beat * 0.025 + energy * 0.006);
      visualizerContext.translate(-cx, -cy);
      visualizerContext.strokeStyle = accent;
      visualizerContext.fillStyle = accent;
      const values = analyserValues(time);
      const preset = currentVisualizerPreset();
      drawVisualizerAtmosphere(visualizerContext, cx, cy, size, time);

      const renderers = {
        "circle-of-fifths": drawCircleOfFifths,
        lissajous: drawLissajous,
        tonnetz: drawTonnetz,
        polyrhythm: drawPolyrhythm,
        "spectral-terrain": drawSpectralTerrain
      };
      (renderers[state.album.visualizer] || drawCircleOfFifths)(
        visualizerContext,
        values,
        cx,
        cy,
        size,
        time,
        preset
      );
      visualizerContext.globalAlpha = 1;
      visualizerContext.restore();
    }

    requestAnimationFrame(drawVisualizer);
  }

  folderSelect.addEventListener("change", () => chooseFolder(Number(folderSelect.value)));
  playButton.addEventListener("click", togglePlayback);
  previousButton.addEventListener("click", () => goToRelativeSong(-1));
  nextButton.addEventListener("click", () => goToRelativeSong(1));

  if ("mediaSession" in navigator) {
    const mediaSessionActions = {
      play: () => togglePlayback(),
      pause: () => audio.pause(),
      previoustrack: () => goToRelativeSong(-1),
      nexttrack: () => goToRelativeSong(1)
    };

    Object.entries(mediaSessionActions).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        console.debug(`Media Session action “${action}” is unavailable.`, error);
      }
    });
  }

  progress.addEventListener("input", () => {
    state.seeking = true;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      currentTime.textContent = formatTime((Number(progress.value) / 1000) * audio.duration);
    }
  });

  progress.addEventListener("change", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
    }
    state.seeking = false;
  });

  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
  });

  audio.addEventListener("play", () => {
    playButton.textContent = "❚❚";
    playButton.setAttribute("aria-label", "Pause");
    centrePlayer.classList.add("is-playing");
    const song = state.songs[state.currentIndex];
    setMediaSessionPlaybackState("playing");
    setStatus(song ? `Playing “${song.title}”.` : "Playing.");
  });

  audio.addEventListener("pause", () => {
    playButton.textContent = "▶";
    playButton.setAttribute("aria-label", "Play");
    centrePlayer.classList.remove("is-playing");
    setMediaSessionPlaybackState("paused");
  });

  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("durationchange", updateProgress);
  audio.addEventListener("timeupdate", updateProgress);

  audio.addEventListener("ended", () => {
    if (autoplay.checked && state.currentIndex < state.songs.length - 1) {
      selectSong(state.currentIndex + 1, true);
    }
    else {
      progress.value = "1000";
      playButton.textContent = "▶";
      centrePlayer.classList.remove("is-playing");
      setMediaSessionPlaybackState("paused");
      setStatus(autoplay.checked ? "Selection finished." : "Song finished.");
    }
  });

  audio.addEventListener("error", () => {
    const song = state.songs[state.currentIndex];
    const errorName = audio.error?.message || audio.error?.code;
    const detail = errorName ? ` (${errorName})` : "";
    setStatus(
      song
        ? `Could not load “${song.title}”.${detail} Check that the MP3 file exists and is being served correctly.`
        : `Could not load the selected song.${detail}`,
      true
    );
  });

  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "SELECT") return;

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    } else if (event.code === "ArrowLeft") {
      goToRelativeSong(-1);
    } else if (event.code === "ArrowRight") {
      goToRelativeSong(1);
    }
  });

  window.addEventListener("resize", () => {
    renderSongs();
    updateActiveButton();
    resizeVisualizer();
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeVisualizer).observe(musicCircle);
  }

  async function loadSongs() {
    await Promise.all(VISUALIZER_IDS.map(async (visualizerId) => {
      try {
        const response = await fetch(`./visualizers/${visualizerId}.json`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.visualizerConfigs[visualizerId] = await response.json();
      } catch (error) {
        console.warn(`Could not load ${visualizerId} presets:`, error);
      }
    }));

    let source = window.SONGS;

    if (!source) {
      try {
        const response = await fetch("./songs.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source = await response.json();
      } catch (error) {
        console.error(error);
      }
    }

    state.folders = normalizeManifest(source);
    audio.volume = Number(volume.value);
    renderFolderOptions();

    if (state.folders.length > 0) {
      chooseFolder(0, false);
      const totalSongs = state.folders.reduce((sum, folder) => sum + folder.songs.length, 0);
      setStatus(
        `${totalSongs} song${totalSongs === 1 ? "" : "s"} ready in ` +
        `${state.folders.length} folder${state.folders.length === 1 ? "" : "s"}.`
      );
    } else {
      state.songs = [];
      renderSongs();
      setStatus("The music manifest is empty. Run: node scripts/generate-song-list.mjs", true);
    }

    resizeVisualizer();
    requestAnimationFrame(drawVisualizer);
  }

  loadSongs();
})();
