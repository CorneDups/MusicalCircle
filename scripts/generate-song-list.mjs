import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const musicDirectory = path.join(projectRoot, "music");
const jsonOutput = path.join(projectRoot, "songs.json");
const jsOutput = path.join(projectRoot, "songs.js");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"];
const VISUALIZER_STYLES = new Set(["radial-bars", "wave-ring", "constellation"]);
const ARTWORK_MOTIONS = new Set(["still", "pulse", "rotate"]);

function titleFromFilename(filename) {
  return path.parse(filename).name;
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function toWebPath(value) {
  return value.split(path.sep).join("/");
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, minimum), maximum) : fallback;
}

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function readAlbumConfig(absoluteDirectory) {
  const filename = path.join(absoluteDirectory, "album.json");
  if (!(await exists(filename))) return {};

  try {
    const parsed = JSON.parse(await readFile(filename, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn(`Ignoring invalid album.json in ${absoluteDirectory}: ${error.message}`);
    return {};
  }
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

async function resolveConfiguredAsset(value, absoluteDirectory, relativeDirectory) {
  if (!isSafeRelativePath(value)) return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const absoluteAsset = path.resolve(absoluteDirectory, ...normalized.split("/"));
  const folderPrefix = `${path.resolve(absoluteDirectory)}${path.sep}`;

  if (!absoluteAsset.startsWith(folderPrefix) || !(await exists(absoluteAsset))) return null;
  if (!IMAGE_EXTENSIONS.includes(path.extname(absoluteAsset).toLowerCase())) return null;
  return toWebPath(path.join(relativeDirectory, normalized));
}

function createFileMap(entries) {
  return new Map(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name.toLowerCase(), entry.name])
  );
}

function findImageByBasenames(fileMap, basenames) {
  for (const basename of basenames) {
    for (const extension of IMAGE_EXTENSIONS) {
      const match = fileMap.get(`${basename}${extension}`.toLowerCase());
      if (match) return match;
    }
  }
  return null;
}

async function findSongArtwork({
  filename,
  trackConfig,
  absoluteDirectory,
  relativeDirectory,
  fileMap,
  artworkFileMap
}) {
  const configured = await resolveConfiguredAsset(
    trackConfig?.artwork,
    absoluteDirectory,
    relativeDirectory
  );
  if (configured) return configured;

  const basename = path.parse(filename).name;
  const directMatch = findImageByBasenames(fileMap, [basename]);
  if (directMatch) return toWebPath(path.join(relativeDirectory, directMatch));

  const artworkMatch = findImageByBasenames(artworkFileMap, [basename]);
  if (artworkMatch) {
    return toWebPath(path.join(relativeDirectory, "artwork", artworkMatch));
  }

  return null;
}

function resolveTrackConfig(config, filename) {
  const tracks = config?.tracks;
  if (!tracks || typeof tracks !== "object" || Array.isArray(tracks)) return {};
  const basename = path.parse(filename).name;
  const value = tracks[filename] ?? tracks[basename];
  if (typeof value === "string") return { title: value };
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function scanFolder(absoluteDirectory, relativeDirectory = "") {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const visibleEntries = entries.filter((entry) => !entry.name.startsWith("."));
  const fileMap = createFileMap(visibleEntries);

  const artworkDirectory = path.join(absoluteDirectory, "artwork");
  let artworkFileMap = new Map();
  if (await exists(artworkDirectory)) {
    const artworkEntries = await readdir(artworkDirectory, { withFileTypes: true });
    artworkFileMap = createFileMap(artworkEntries);
  }

  const mp3Files = visibleEntries
    .filter((entry) => entry.isFile() && /\.mp3$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(naturalSort);

  const folders = [];

  if (mp3Files.length > 0) {
    const config = await readAlbumConfig(absoluteDirectory);
    const webFolderPath = toWebPath(relativeDirectory);
    const folderName = webFolderPath || "Music (root)";

    const configuredCover = await resolveConfiguredAsset(config.cover, absoluteDirectory, relativeDirectory);
    const configuredBackground = await resolveConfiguredAsset(config.background, absoluteDirectory, relativeDirectory);
    const automaticCover = findImageByBasenames(fileMap, ["cover", "album", "folder"]);
    const automaticBackground = findImageByBasenames(fileMap, ["background", "backdrop", "hero"]);

    const cover = configuredCover
      ?? (automaticCover ? toWebPath(path.join(relativeDirectory, automaticCover)) : null);
    const background = configuredBackground
      ?? (automaticBackground ? toWebPath(path.join(relativeDirectory, automaticBackground)) : null);

    const albumArtist = cleanString(config.artist);
    const songs = [];

    for (const filename of mp3Files) {
      const trackConfig = resolveTrackConfig(config, filename);
      const artwork = await findSongArtwork({
        filename,
        trackConfig,
        absoluteDirectory,
        relativeDirectory,
        fileMap,
        artworkFileMap
      });

      songs.push({
        file: toWebPath(path.join(relativeDirectory, filename)),
        title: cleanString(trackConfig.title, titleFromFilename(filename)),
        artist: cleanString(trackConfig.artist, albumArtist),
        artwork
      });
    }

    folders.push({
      path: webFolderPath,
      name: folderName,
      album: {
        title: cleanString(config.title, path.basename(relativeDirectory) || "Music"),
        artist: albumArtist,
        description: cleanString(config.description),
        cover,
        background,
        accent: cleanString(config.accent),
        accentSecondary: cleanString(config.accentSecondary),
        visualizer: VISUALIZER_STYLES.has(config.visualizer)
          ? config.visualizer
          : "radial-bars",
        visualizerIntensity: clamp(config.visualizerIntensity, 0.5, 2, 1),
        artworkMotion: ARTWORK_MOTIONS.has(config.artworkMotion)
          ? config.artworkMotion
          : "pulse",
        preferEmbeddedArtwork: config.preferEmbeddedArtwork !== false
      },
      songs
    });
  }

  const childDirectories = visibleEntries
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() !== "artwork")
    .sort((a, b) => naturalSort(a.name, b.name));

  for (const directory of childDirectories) {
    const childRelativeDirectory = path.join(relativeDirectory, directory.name);
    const childFolders = await scanFolder(
      path.join(absoluteDirectory, directory.name),
      childRelativeDirectory
    );
    folders.push(...childFolders);
  }

  return folders;
}

async function generateSongList() {
  const scannedFolders = await scanFolder(musicDirectory);
  const folders = scannedFolders
    .sort((a, b) => naturalSort(a.name, b.name))
    .map((folder, folderIndex) => ({
      id: folderIndex + 1,
      ...folder,
      songCount: folder.songs.length,
      songs: folder.songs.map((song, songIndex) => ({ id: songIndex + 1, ...song }))
    }));

  const totalSongs = folders.reduce((sum, folder) => sum + folder.songs.length, 0);
  const manifest = {
    version: 3,
    generatedAt: new Date().toISOString(),
    folderCount: folders.length,
    totalSongs,
    folders
  };

  await writeFile(jsonOutput, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    jsOutput,
    `// Automatically generated. Do not edit by hand.\nwindow.SONGS = ${JSON.stringify(manifest, null, 2)};\n`,
    "utf8"
  );

  console.log(
    `Generated manifests for ${totalSongs} MP3 file${totalSongs === 1 ? "" : "s"} ` +
    `across ${folders.length} folder${folders.length === 1 ? "" : "s"}.`
  );
}

generateSongList().catch((error) => {
  console.error("Could not generate the song list:", error);
  process.exitCode = 1;
});
