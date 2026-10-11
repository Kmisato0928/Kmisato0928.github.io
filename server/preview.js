import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = new Set([
  "index.html", "favicon.svg", "styles.css", "workspace.css", "script.js",
  "workspace.js", "site.config.js", "resume.data.js", "chat-client.js", "markdown.js",
  "assets/kamisato-wordmark.svg",
]);
const types = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" };
export function createPreview() {
  return createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path === "/" ? "index.html" : path.slice(1);
      if (!files.has(file) || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(404);
        return response.end("Not found");
      }
      const content = await readFile(resolve(root, file));
      response.writeHead(200, { "Content-Type": (types[file.split(".").pop()] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PREVIEW_PORT || 8088);
  createPreview().listen(port, process.env.PREVIEW_HOST || "127.0.0.1", () => console.log("网站本机预览：http://localhost:" + port));
}
