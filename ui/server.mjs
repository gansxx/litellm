import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve } from "node:path";

const root = resolve("/app/out");
const runtimeConfigScript = `<script>window.__LITELLM_UI_GATEWAY_HOST__=${JSON.stringify(process.env.GATEWAY_HOST ?? "").replace(/</g, "\\u003c")};</script>`;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

const candidatesForPath = (pathname) => {
  const uiPath = pathname
    .replace(/^\/litellm-asset-prefix/, "")
    .replace(/^\/ui(?:\/|$)/, "/");
  const relativePath = normalize(decodeURIComponent(uiPath)).replace(/^[/\\]+/, "");
  if (relativePath.startsWith("..") || relativePath.includes("\0")) return [];
  if (relativePath === "") return ["index.html"];
  if (extname(relativePath)) return [relativePath];
  return [`${relativePath}.html`, `${relativePath}/index.html`, "index.html"];
};

const findFile = async (candidates) => {
  for (const candidate of candidates) {
    const filePath = resolve(root, candidate);
    if (!filePath.startsWith(`${root}/`)) continue;
    try {
      if ((await stat(filePath)).isFile()) return filePath;
    } catch {}
  }
  return null;
};

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://ui").pathname;
  if (pathname === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok\n");
    return;
  }
  const filePath = await findFile(candidatesForPath(pathname));
  if (filePath === null) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream" });
  if (extname(filePath) === ".html") {
    response.end((await readFile(filePath, "utf8")).replace("</head>", `${runtimeConfigScript}</head>`));
    return;
  }
  createReadStream(filePath).pipe(response);
}).listen(3000, "0.0.0.0");
