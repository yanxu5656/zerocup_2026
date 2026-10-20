/* 灯影 · server/app.mjs
   零依赖本地服务：静态站点 + 成绩榜。
   只用 Node 标准库（node:http / node:fs / node:path），不装任何包。
   启动：node server/app.mjs   →  http://127.0.0.1:8765 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* 仓库布局是 server/ 与 web/ 同级；打包后的工程版把 web/ 的内容提到了根目录 */
const CANDIDATES = [
  path.resolve(__dirname, "..", "web"),
  path.resolve(__dirname, "..")
];
const ROOT = CANDIDATES.find((p) => fs.existsSync(path.join(p, "index.html"))) || CANDIDATES[0];
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "scores.json");
const PORT = Number(process.env.PORT || 8765);
const HOST = "127.0.0.1";
const MAX_ITEMS = 200;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

/* ---------- 存储 ---------- */
function readScores() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

let writeTimer = 0;
function writeScores(list) {
  /* 合并短时间内的多次写入，避免频繁落盘 */
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error("[store]", err.message);
    }
  }, 120);
}

/* ---------- 校验 ---------- */
const RANKS = new Set(["甲", "乙", "丙"]);
function cleanName(v) {
  const s = String(v == null ? "" : v).replace(/[<>&"\r\n\t]/g, "").trim();
  return s.slice(0, 12) || "无名";
}
function intIn(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  return i < min ? min : i > max ? max : i;
}

function handleScore(body) {
  const rank = RANKS.has(body.rank) ? body.rank : "丙";
  const item = {
    name: cleanName(body.name),
    rank,
    score: intIn(body.score, 0, 9999, 0),
    perfect: intIn(body.perfect, 0, 9, 0),
    good: intIn(body.good, 0, 9, 0),
    miss: intIn(body.miss, 0, 9, 0),
    ending: body.ending === "curl" ? "curl" : body.ending === "bow" ? "bow" : "",
    ts: Date.now()
  };
  const list = readScores();
  list.push(item);
  list.sort((a, b) => b.score - a.score || a.ts - b.ts);
  const kept = list.slice(0, MAX_ITEMS);
  writeScores(kept);
  const rankIndex = kept.findIndex((x) => x.ts === item.ts);
  return { ok: true, item, place: rankIndex >= 0 ? rankIndex + 1 : null, total: kept.length };
}

function handleBoard(limit) {
  const list = readScores().slice(0, limit);
  return {
    ok: true,
    total: readScores().length,
    items: list.map((x) => ({
      name: x.name, rank: x.rank, score: x.score,
      perfect: x.perfect, good: x.good, miss: x.miss, ts: x.ts
    }))
  };
}

/* ---------- 响应 ---------- */
function json(res, code, data) {
  const buf = Buffer.from(JSON.stringify(data), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store"
  });
  res.end(buf);
}

function sendFile(res, file, method) {
  let stat;
  try { stat = fs.statSync(file); } catch { return json(res, 404, { ok: false, error: "not found" }); }
  if (stat.isDirectory()) return sendFile(res, path.join(file, "index.html"), method);

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": "no-cache"
  });
  if (method === "HEAD") { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

/* ---------- 路由 ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || "GET";

  if (pathname === "/api/health") {
    return json(res, 200, { ok: true, mode: "cloud", service: "lamp", version: 1 });
  }

  if (pathname === "/api/leaderboard" && (method === "GET" || method === "HEAD")) {
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 8));
    return json(res, 200, handleBoard(limit));
  }

  if (pathname === "/api/score" && method === "POST") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8192) { req.destroy(); }
    });
    req.on("end", () => {
      let body;
      try { body = JSON.parse(raw || "{}"); } catch { return json(res, 400, { ok: false, error: "bad json" }); }
      try {
        return json(res, 200, handleScore(body));
      } catch (err) {
        return json(res, 500, { ok: false, error: "server error" });
      }
    });
    return;
  }

  if (pathname.startsWith("/api/")) return json(res, 404, { ok: false, error: "no such api" });

  /* 静态文件；根路径回 index.html */
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT)) return json(res, 403, { ok: false, error: "forbidden" });
  sendFile(res, file, method);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log("");
  console.log("  灯影 · 本地服务已启动");
  console.log("  " + url);
  console.log("  关闭这个窗口即停止服务。");
  console.log("");
  if (process.argv.includes("--open") && process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});
