import { cp, mkdir, rm, writeFile } from "node:fs/promises";
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
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

await cp(path.join(projectRoot, "music"), path.join(outputDirectory, "music"), {
  recursive: true
});

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
console.log(`Built GitHub Pages site in ${outputDirectory}`);
