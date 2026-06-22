/**
 * Minimal zero-dependency static file server for local preview.
 * Run: npm run serve   →   http://localhost:4173
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    // Prevent path traversal: confine to the landing root.
    const path = normalize(join(root, rel));
    if (!path.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
  }
}).listen(port, () => console.log(`landing → http://localhost:${port}`));
