import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectRoot, "_site");

const generator = spawnSync(
  process.execPath,
  [path.join(scriptDirectory, "generate-song-list.mjs")],
  { cwd: projectRoot, stdio: "inherit" }
);

if (generator.status !== 0) {
  process.exit(generator.status ?? 1);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const filesToCopy = ["index.html", "styles.css", "app.js", "songs.js", "songs.json"];
for (const file of filesToCopy) {
  await copyFile(path.join(projectRoot, file), path.join(outputDirectory, file));
}

await mkdir(path.join(outputDirectory, "music"), { recursive: true });
const sourceMusic = path.join(projectRoot, "music");
const destinationMusic = path.join(outputDirectory, "music");
const entries = await readdir(sourceMusic, { withFileTypes: true });
for (const entry of entries) {
  const sourcePath = path.join(sourceMusic, entry.name);
  const destinationPath = path.join(destinationMusic, entry.name);
  const entryStats = await stat(sourcePath);
  if (entryStats.isDirectory()) {
    await mkdir(destinationPath, { recursive: true });
    const childEntries = await readdir(sourcePath, { withFileTypes: true });
    for (const childEntry of childEntries) {
      const childSourcePath = path.join(sourcePath, childEntry.name);
      const childDestinationPath = path.join(destinationPath, childEntry.name);
      const childStats = await stat(childSourcePath);
      if (childStats.isDirectory()) {
        await mkdir(childDestinationPath, { recursive: true });
      } else {
        await copyFile(childSourcePath, childDestinationPath);
      }
    }
  } else {
    await copyFile(sourcePath, destinationPath);
  }
}

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
console.log(`Built GitHub Pages site in ${outputDirectory}`);
