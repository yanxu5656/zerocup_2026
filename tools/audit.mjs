/* 灯影 · 合规审计（开发用）
   目的：给"合规"提供可复现的证据，而不是靠肉眼和自述。
   检查项：
     1) 控制台报错 / 异常 / 资源加载失败
     2) 第三方请求（file:// 之外的任何 http/https）
     3) 元素级横向溢出（不依赖 scrollWidth，body 的 overflow:hidden 无法掩盖）
     4) 每页唯一 h1、favicon、界面规格声明、页脚署名
   用法：
     node tools/audit.mjs [站点目录]
     环境变量 LAMP_BROWSER 可指定浏览器可执行文件（默认自动探测 Chrome / Edge）
*/
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const CANDIDATES = [
  process.env.LAMP_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const BROWSER = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (!BROWSER) {
  console.error("找不到浏览器，请用 LAMP_BROWSER 指定 chrome.exe / msedge.exe 的绝对路径");
  process.exit(1);
}

const PORT = 9600 + Math.floor(Math.random() * 200);
const site = path.resolve(process.argv[2] || "web");
/* 默认用 file:// 审计；设置 LAMP_ORIGIN=http://127.0.0.1:8765 可改为 HTTP 审计（用于验证部署后无 404） */
const ORIGIN = (process.env.LAMP_ORIGIN || "").replace(/\/+$/, "");
const urlFor = (file) => ORIGIN ? ORIGIN + "/" + file : "file:///" + path.join(site, file).replace(/\\/g, "/");
const PAGES = ["index.html", "origin.html", "play.html", "people.html", "future.html"];
const VIEWPORTS = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "720", width: 720, height: 1280 },
  { name: "390", width: 390, height: 844 }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lamp-audit-"));
  const args = [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-sync",
    "--disable-extensions", "--disable-background-networking", "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"
  ];
  return { proc: spawn(BROWSER, args, { stdio: "ignore" }), profile };
}

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 等待启动 */ }
    await sleep(200);
  }
  throw new Error("DevTools 未就绪");
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else {
        this.events.push(m);
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
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "eval error");
    return r.result.value;
  }
}

/* 元素级溢出检测：body 的 overflow:hidden 不算"合法裁剪" */
const OVERFLOW_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const pathOf = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 4) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = (n.className && typeof n.className === 'string') ? n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      if (cls) s += '.' + cls;
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const clippedByAncestor = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible') {
        const r = p.getBoundingClientRect();
        if (r.left >= -1 && r.right <= vw + 1) return true;
      }
      p = p.parentElement;
    }
    return false;
  };
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.classList.contains('skip-link')) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.left >= -1 && r.right <= vw + 1) continue;
    if (clippedByAncestor(el)) continue;
    bad.push({ sel: pathOf(el), left: Math.round(r.left), right: Math.round(r.right) });
  }
  return {
    vw,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body ? document.body.scrollWidth : null,
    overflows: bad.slice(0, 12),
    overflowCount: bad.length
  };
})()`;

const META_PROBE = `(() => ({
  title: document.title,
  h1: document.querySelectorAll('h1').length,
  h1Text: (document.querySelector('h1') || {}).textContent ? document.querySelector('h1').textContent.replace(/\\s+/g, ' ').trim() : '',
  favicon: !!document.querySelector('link[rel~="icon"]'),
  specText: /界面规格\\s*1920/.test(document.body.textContent || ''),
  specNode: !!document.querySelector('.footer__spec'),
  imgs: document.images.length,
  brokenImgs: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
  thirdParty: [...document.querySelectorAll('[src],[href]')]
    .map(e => e.getAttribute('src') || e.getAttribute('href'))
    .filter(u => u && /^(https?:)?\\/\\//i.test(u)),
  links: [...document.querySelectorAll('a[href$=".html"]')].map(a => a.getAttribute('href'))
}))()`;

const result = {
  generatedAt: new Date().toISOString(),
  browser: { path: BROWSER, version: null },
  site,
  viewports: VIEWPORTS.map((v) => v.name),
  pages: [],
  summary: {}
};

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

  const ver = await cdp.send("Browser.getVersion");
  result.browser.version = ver.product;

  for (const vp of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: 1,
      mobile: vp.width < 600
    });
    for (const file of PAGES) {
      cdp.events.length = 0;
      await cdp.send("Page.navigate", { url: urlFor(file) });
      await sleep(1100);

      const errors = [];
      const requests = [];
      const badStatus = [];
      for (const ev of cdp.events) {
        if (ev.method === "Runtime.exceptionThrown") {
          errors.push("exception: " + (ev.params.exceptionDetails?.exception?.description || ev.params.exceptionDetails?.text));
        }
        if (ev.method === "Runtime.consoleAPICalled" && ev.params.type === "error") {
          errors.push("console.error: " + ev.params.args.map((a) => a.value ?? a.description).join(" "));
        }
        if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") {
          errors.push("log: " + ev.params.entry.text + " " + (ev.params.entry.url || ""));
        }
        if (ev.method === "Network.requestWillBeSent") requests.push(ev.params.request.url);
        if (ev.method === "Network.responseReceived" && ev.params.response.status >= 400) {
          badStatus.push(ev.params.response.status + " " + ev.params.response.url);
        }
        if (ev.method === "Network.loadingFailed") errors.push("request failed: " + ev.params.errorText + " " + (ev.params.requestId || ""));
      }

      const overflow = await cdp.eval(OVERFLOW_PROBE);
      const meta = vp.name === "1440" ? await cdp.eval(META_PROBE) : null;
      const external = requests.filter((u) => {
        if (!/^(https?:)?\/\//i.test(u)) return false;
        if (!ORIGIN) return true;              /* file:// 下任何 http(s) 请求都算外链 */
        return !u.startsWith(ORIGIN);          /* HTTP 下排除本站请求 */
      });

      result.pages.push({
        file, viewport: vp.name, width: vp.width,
        errors, externalRequests: external, badStatus,
        ...overflow,
        ...(meta ? { meta } : {})
      });
    }
  }
} catch (e) {
  result.fatal = String(e && e.stack ? e.stack : e);
} finally {
  try { ws && ws.close(); } catch { /* ignore */ }
  try { proc.kill(); } catch { /* ignore */ }
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

/* ---------- 汇总 ---------- */
const byPage = {};
for (const p of result.pages) {
  const k = p.file;
  byPage[k] = byPage[k] || { file: k, errorPages: 0, overflowPages: 0, maxOverflow: 0, samples: [] };
  if (p.errors.length) byPage[k].errorPages += 1;
  if (p.overflowCount) {
    byPage[k].overflowPages += 1;
    byPage[k].maxOverflow = Math.max(byPage[k].maxOverflow, p.overflowCount);
    if (byPage[k].samples.length < 3) byPage[k].samples.push({ viewport: p.viewport, overflows: p.overflows.slice(0, 3) });
  }
}
result.summary = {
  pages: Object.values(byPage),
  totalErrors: result.pages.reduce((n, p) => n + p.errors.length, 0),
  totalExternal: result.pages.reduce((n, p) => n + p.externalRequests.length, 0),
  totalBadStatus: result.pages.reduce((n, p) => n + p.badStatus.length, 0),
  overflowViewports: result.pages.filter((p) => p.overflowCount).length,
  runs: result.pages.length
};

const outJson = path.resolve(process.env.LAMP_OUT
  || (ORIGIN ? "preview/audit-http.json" : "preview/audit.json"));
fs.writeFileSync(outJson, JSON.stringify(result, null, 2), "utf8");

/* ---------- 控制台报表 ---------- */
const pad = (s, n) => String(s).padEnd(n);
console.log("");
console.log(`浏览器  ${result.browser.version || "?"}`);
console.log(`站点    ${site}`);
console.log(`页数×档位  ${result.pages.length}`);
console.log("");
console.log(pad("页面", 14) + pad("报错档位", 10) + pad("溢出档位", 10) + "最大溢出元素");
for (const s of result.summary.pages) {
  console.log(pad(s.file, 14) + pad(s.errorPages, 10) + pad(s.overflowPages, 10) + s.maxOverflow);
}
console.log("");
console.log(`合计报错 ${result.summary.totalErrors} ｜ 第三方请求 ${result.summary.totalExternal} ｜ 4xx/5xx ${result.summary.totalBadStatus} ｜ 有溢出的档位-页面组合 ${result.summary.overflowViewports}`);
if (result.fatal) console.log("FATAL " + result.fatal);
console.log("报告 " + outJson);
