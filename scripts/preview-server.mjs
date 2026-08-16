import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const preferredPort = Number(process.env.PORT || 8000);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".txt", "text/plain; charset=utf-8"]
]);

function safePathFromUrl(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(projectRoot, `.${requested}`);
  return resolved.startsWith(projectRoot) ? resolved : null;
}

function parseByteRange(header, fileSize) {
  const match = typeof header === "string" ? /^bytes=(\d*)-(\d*)$/.exec(header) : null;
  if (!match) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= fileSize || end < start) {
    return { invalid: true };
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

const server = http.createServer(async (request, response) => {
  try {
    const filePath = safePathFromUrl(request.url || "/");
    if (!filePath) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("Not a file");

    const body = await readFile(filePath);
    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    const range = parseByteRange(request.headers.range, body.length);
    if (range?.invalid) {
      response.writeHead(416, { "Content-Range": `bytes */${body.length}` });
      response.end();
      return;
    }

    const responseBody = range ? body.subarray(range.start, range.end + 1) : body;
    response.writeHead(range ? 206 : 200, {
      "Content-Type": contentType,
      "Content-Length": responseBody.length,
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${body.length}` } : {}),
      "Cache-Control": "no-store"
    });
    response.end(responseBody);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function listen(port, remainingAttempts = 10) {
  const onError = (error) => {
    server.off("listening", onListening);
    if (error.code === "EADDRINUSE" && remainingAttempts > 0) {
      console.warn(`Port ${port} is already in use; trying ${port + 1}.`);
      listen(port + 1, remainingAttempts - 1);
      return;
    }

    throw error;
  };

  const onListening = () => {
    server.off("error", onError);
    console.log(`Circular Music Player is available at http://localhost:${port}`);
    console.log("Press Ctrl+C to stop the server.");
  };

  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(port, "127.0.0.1");
}

listen(preferredPort);
