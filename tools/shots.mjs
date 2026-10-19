/* 灯影 · 截图与视口检查（开发用）
   用 CDP 模拟真实视口，逐页截整页图，并报告横向溢出。
   用法：node tools/shots.mjs [站点目录]
*/
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9555 + Math.floor(Math.random() * 200);
const site = path.resolve(process.argv[2] || "web");
const outDir = path.resolve("preview");
const PAGES = [
  { file: "index.html", name: "index", q: "?lit=1&static=1" },
  { file: "origin.html", name: "origin", q: "?static=1" },
  { file: "play.html", name: "play", q: "?static=1" },
  { file: "people.html", name: "people", q: "?static=1" },
  { file: "future.html", name: "future", q: "?static=1" }
];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false, scale: 1, save: true },
  { name: "mobile", width: 390, height: 844, mobile: true, scale: 1, save: true },
  { name: "wide", width: 1920, height: 1080, mobile: false, scale: 1, save: false },
  { name: "tablet", width: 1024, height: 768, mobile: false, scale: 1, save: false },
  { name: "small", width: 768, height: 1024, mobile: false, scale: 1, save: false }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lamp-shot-"));
  const args = [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-sync",
    "--disable-extensions", "--disable-background-networking", "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"
  ];
  return { proc: spawn(EDGE, args, { stdio: "ignore" }), profile };
}

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* wait */ }
    await sleep(200);
  }
  throw new Error("DevTools 未就绪");
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result.value;
  }
}

const { proc, profile } = launch();
const rows = [];
try {
  const ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  for (const vp of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: vp.scale, mobile: vp.mobile
    });
    for (const p of PAGES) {
      const url = "file:///" + path.join(site, p.file).replace(/\\/g, "/") + p.q;
      await cdp.send("Page.navigate", { url });
      await sleep(1400);
      const info = await cdp.eval(`(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        sh: document.documentElement.scrollHeight
      }))()`);
      let file = "(not saved)";
      if (vp.save) {
        const shot = await cdp.send("Page.captureScreenshot", {
          format: "jpeg", quality: 88, captureBeyondViewport: true, optimizeForSpeed: false
        });
        file = path.join(outDir, `${p.name}-${vp.name}.jpg`);
        fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      }
      rows.push({ page: p.name, viewport: vp.name, width: vp.width, scrollW: info.sw, scrollH: info.sh, file });
    }
  }
  ws.close();
} catch (e) {
  console.error("FAILED", e);
} finally {
  try { proc.kill(); } catch { /* ignore */ }
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

for (const r of rows) {
  console.log(`${r.page.padEnd(8)} ${r.viewport.padEnd(8)} viewport=${r.width}  scrollW=${r.scrollW}  height=${r.scrollH}  ${r.scrollW > r.width + 1 ? "OVERFLOW" : "ok"}`);
}
