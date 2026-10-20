/* 灯影 · 验收脚本（开发用）
   用 Chrome DevTools Protocol 真机式验收：
   1) 五个页面逐页检查控制台报错 / 请求失败
   2) 弄影台：键盘通关三关，验证吸附、关卡推进、剧场解锁
   3) 输出 JSON 报告

   用法：node tools/check.mjs [站点目录]
   依赖：本机 Edge（Chromium），Node 20+（内置 WebSocket / fetch）
*/
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const EDGE = process.env.LAMP_BROWSER
  || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333 + Math.floor(Math.random() * 200);
const site = path.resolve(process.argv[2] || "web");
const PAGES = ["index.html", "origin.html", "play.html", "people.html", "future.html"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lamp-cdp-"));
  const args = [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-sync",
    "--disable-extensions", "--disable-background-networking", "--no-first-run",
    "--no-default-browser-check", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, "about:blank"
  ];
  const proc = spawn(EDGE, args, { stdio: "ignore", detached: false });
  return { proc, profile };
}

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(200);
  }
  throw new Error("无法连接 DevTools");
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "eval error");
    return r.result.value;
  }
}

async function key(cdp, keyName, code, vk, shift) {
  const base = { key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

const report = { generatedAt: new Date().toISOString(), site, pages: [], stage: {}, errors: [] };

const { proc, profile } = launch();
let ws;
try {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  /* 固定视口，避免不同机器默认窗口大小不同导致 scrollW 不可比 */
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  for (const file of PAGES) {
    cdp.events.length = 0;
    const url = "file:///" + path.join(site, file).replace(/\\/g, "/");
    await cdp.send("Page.navigate", { url });
    await sleep(1200);

    const pageErrors = [];
    for (const ev of cdp.events) {
      if (ev.method === "Runtime.exceptionThrown") {
        pageErrors.push("exception: " + (ev.params.exceptionDetails?.exception?.description || ev.params.exceptionDetails?.text));
      }
      if (ev.method === "Runtime.consoleAPICalled" && ev.params.type === "error") {
        pageErrors.push("console.error: " + ev.params.args.map((a) => a.value ?? a.description).join(" "));
      }
      if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") {
        pageErrors.push("log: " + ev.params.entry.text + " " + (ev.params.entry.url || ""));
      }
      if (ev.method === "Network.loadingFailed") {
        pageErrors.push("request failed: " + ev.params.errorText);
      }
    }

    const info = await cdp.eval(`(() => ({
      title: document.title,
      h1: (document.querySelector('h1')||{}).textContent.trim(),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      imgs: document.images.length,
      brokenImgs: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
      links: [...document.querySelectorAll('a[href$=".html"]')].map(a => a.getAttribute('href'))
    }))()`);

    report.pages.push({ file, ...info, errors: pageErrors });
    if (pageErrors.length) report.errors.push({ file, errors: pageErrors });
  }

  /* ---------- 弄影台：键盘通关 ---------- */
  await cdp.send("Page.navigate", { url: "file:///" + path.join(site, "play.html").replace(/\\/g, "/") });
  await sleep(1200);
  await cdp.eval("localStorage.removeItem('playPassed'); location.reload();");
  await sleep(1200);

  const stageSteps = [];
  const readState = () => cdp.eval(`(() => ({
    level: document.getElementById('levelName').textContent.trim(),
    armR: (document.querySelector('.joint[data-joint="armR"]')||{}).getAttribute?.('transform'),
    armL: (document.querySelector('.joint[data-joint="armL"]')||{}).getAttribute?.('transform'),
    legR: (document.querySelector('.joint[data-joint="legR"]')||{}).getAttribute?.('transform'),
    snapped: document.querySelectorAll('.joint.is-snapped').length,
    dotsOn: document.querySelectorAll('#dots i.is-on').length,
    theater: document.getElementById('toTheater').getAttribute('aria-disabled'),
    passed: localStorage.getItem('playPassed')
  }))()`);

  stageSteps.push({ step: "initial", ...(await readState()) });

  // 第一关：右臂 -150（Shift + ← 每次 5°）
  await cdp.eval(`document.querySelector('.joint[data-joint="armR"]').focus()`);
  for (let i = 0; i < 30; i++) await key(cdp, "ArrowLeft", "ArrowLeft", 37, true);
  await sleep(1800);
  stageSteps.push({ step: "level1-armR--150", ...(await readState()) });

  // 第二关：左臂 +120（Shift + → 每次 5°）
  await cdp.eval(`document.querySelector('.joint[data-joint="armL"]').focus()`);
  for (let i = 0; i < 24; i++) await key(cdp, "ArrowRight", "ArrowRight", 39, true);
  await sleep(1800);
  stageSteps.push({ step: "level2-armL-120", ...(await readState()) });

  // 第三关：右腿 -50
  await cdp.eval(`document.querySelector('.joint[data-joint="legR"]').focus()`);
  for (let i = 0; i < 10; i++) await key(cdp, "ArrowLeft", "ArrowLeft", 37, true);
  await sleep(300);
  stageSteps.push({ step: "level3-legR--50", ...(await readState()) });

  // 第三关：拉幕到 88%（真实鼠标拖动右侧幕布）
  const grip = await cdp.eval(`(() => {
    const g = document.getElementById('gripR');
    const r = g.getBoundingClientRect();
    const vw = document.getElementById('viewport').getBoundingClientRect().width;
    return { x: r.x + r.width/2, y: r.y + r.height/2, vw };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: grip.x, y: grip.y, button: "left", clickCount: 1, buttons: 1 });
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: grip.x + (grip.vw * 0.13) * (i / steps),
      y: grip.y, button: "left", buttons: 1
    });
    await sleep(16);
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: grip.x + grip.vw * 0.13, y: grip.y, button: "left", buttons: 0 });
  await sleep(2000);
  stageSteps.push({ step: "level3-curtain", ...(await readState()) });

  report.stage = {
    steps: stageSteps,
    passed: stageSteps.at(-1).passed === "1",
    theaterUnlocked: stageSteps.at(-1).theater === "false"
  };
} catch (e) {
  report.fatal = String(e && e.stack ? e.stack : e);
} finally {
  try { ws && ws.close(); } catch { /* ignore */ }
  try { proc.kill(); } catch { /* ignore */ }
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

const out = path.resolve("preview/report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({
  pages: report.pages.map((p) => ({ file: p.file, errors: p.errors.length, scrollW: p.scrollW, clientW: p.clientW, broken: p.brokenImgs })),
  stage: report.stage,
  fatal: report.fatal || null,
  report: out
}, null, 2));
