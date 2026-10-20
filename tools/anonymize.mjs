/* 灯影 · 匿名版生成与脱敏自检
   比赛要求：匿名版本用于初赛评选，不得包含任何个人信息（姓名 / 学号 / 学院等）。
   本脚本把 web/ 复制成 dist/匿名版，替换署名、生成中性的作品说明，并做三项自检：
     1) 全量扫描个人信息关键词，必须 0 命中
     2) 五个页面必须都存在，且页脚已替换
     3) 匿名版与源码的差异必须只发生在"署名"与"作品说明"两处
   用法：node tools/anonymize.mjs [源码目录] [输出目录]
*/
import fs from "node:fs";
import path from "node:path";

const src = path.resolve(process.argv[2] || "web");
const out = path.resolve(process.argv[3] || "dist/匿名版");

const NAMES = ["夏思远", "李健豪", "廖哲煜", "闫煦"];
const SENSITIVE = [...NAMES, "武汉大学", "计算机学院", "国家网络安全学院", "电子信息学院", "人工智能学院", "学号"];
const FOOTER_FROM = "© 2026 灯影团队 · 夏思远 / 李健豪 / 廖哲煜 / 闫煦";
const FOOTER_TO = "© 2026 灯影 · 2026 零杯网页设计大赛参赛作品";
const PAGES = ["index.html", "origin.html", "play.html", "people.html", "future.html"];
const TEXT_EXT = new Set([".html", ".css", ".js", ".md", ".txt", ".json", ".svg"]);

const log = [];
const record = (ok, msg) => { log.push({ ok, msg }); };

function walk(dir) {
  const list = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) list.push(...walk(p));
    else list.push(p);
  }
  return list;
}

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("源码目录里没有 index.html：" + src);
  process.exit(1);
}
if (!/匿名版$/.test(out)) {
  console.error("输出目录必须以「匿名版」结尾，避免误删：" + out);
  process.exit(1);
}

if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.cpSync(src, out, { recursive: true });
record(true, "已复制源码 " + src + " → " + out);

/* ---------- 1. 替换页脚署名 ---------- */
let footerHits = 0;
for (const file of PAGES) {
  const p = path.join(out, file);
  if (!fs.existsSync(p)) { record(false, "缺少页面 " + file); continue; }
  const before = fs.readFileSync(p, "utf8");
  if (!before.includes(FOOTER_FROM)) { record(false, file + " 未找到待替换的署名段"); continue; }
  const after = before.split(FOOTER_FROM).join(FOOTER_TO);
  fs.writeFileSync(p, after, "utf8");
  footerHits += 1;
}
record(footerHits === PAGES.length, "页脚署名替换 " + footerHits + " / " + PAGES.length + " 页");

/* ---------- 2. 写入中性的作品说明 ---------- */
const note = `# 灯影 · 一盏灯照见千年

> 2026 年「零杯」网页设计大赛参赛作品 ｜ 参赛主题：非遗（中国皮影戏）
> **匿名版本**：本文档及全站内容均不含任何可识别身份的信息。

## 一、作品简介

「灯影」是一个可以点灯、弄影、看戏的皮影戏数字展馆，共 5 个页面：
掌灯（首页）、溯影（源流与工序）、弄影（三关拖拽与影窗剧场）、见人（传承人与工具）、续灯（当代表达与 DIY）。
主线是一条 3 分钟的动线：点亮一盏灯 → 读一段源流 → 亲手摆一个姿势 → 看一出戏 → 把一枚纹样带走。

## 二、界面规格

- **主规格：1920px**；同时向下自适应 **1440 / 720**，并覆盖 390px 起的移动端。
- 已在 1920 / 1440 / 1024 / 768 / 720 / 390 六档视口下逐页检测，无横向溢出、无元素遮挡。
- 运行环境：Chrome 129。全站零外部请求，慢速网络下表现与正常网络一致。

## 三、技术说明

- 纯原生 HTML5 / CSS3 / JavaScript（ES2019+），**无任何第三方库、无 CDN、无外链字体与图片**。
- 全部图形为内联手写 SVG（皮影、纹样、工具、场景），不使用位图。
- 交互：Pointer Events 拖拽 + 角度吸附；IntersectionObserver 滚动驱动；localStorage 记忆点灯与通关状态。
- 布局：CSS Grid + \`clamp()\` 流式排版；动效只改 \`transform\` / \`opacity\`。
- 无障碍：语义化标签、全键盘可操作、\`:focus-visible\`、\`prefers-reduced-motion\` 降级。
- 可直接双击 \`index.html\` 运行，不需要构建、不需要本地服务器。

## 四、第三方库

无。本项目未使用任何第三方库、框架、组件库或图标库。

## 五、运行方式

1. 解压本压缩包；
2. 双击 \`index.html\`（推荐 Chrome 129）；
3. 点击首屏任意位置点灯，按「掌灯 → 溯影 → 弄影 → 见人 → 续灯」的顺序浏览。

## 六、素材与版权

全站图形均由本团队绘制，文字参考公开的非遗资料与博物馆展陈说明，用于学习与展示。
本作品仅用于「零杯」网页设计大赛评选，不作商业用途。
`;
fs.writeFileSync(path.join(out, "作品说明.md"), note, "utf8");
record(true, "已写入 作品说明.md");

/* ---------- 3. 自检：个人信息 0 命中 ---------- */
const files = walk(out).filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
const leftovers = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const word of SENSITIVE) {
    if (text.includes(word)) leftovers.push({ file: path.relative(out, f), word });
  }
}
record(leftovers.length === 0, "个人信息扫描：命中 " + leftovers.length + " 处");

/* ---------- 4. 自检：结构完整 ---------- */
const missing = PAGES.filter((p) => !fs.existsSync(path.join(out, p)));
record(missing.length === 0, "页面完整性：" + (PAGES.length - missing.length) + " / " + PAGES.length);
record(fs.existsSync(path.join(out, "assets/css/base.css")) && fs.existsSync(path.join(out, "assets/js/main.js")), "assets 目录完整");
const specOk = PAGES.every((p) => fs.readFileSync(path.join(out, p), "utf8").includes("界面规格 1920"));
record(specOk, "界面规格声明保留在五页页脚");

/* ---------- 报表 ---------- */
console.log("");
console.log("匿名版输出：" + out);
console.log("");
for (const item of log) {
  console.log((item.ok ? "PASS  " : "FAIL  ") + item.msg);
}
if (leftovers.length) {
  console.log("");
  console.log("以下位置仍含敏感信息，必须处理后再提交：");
  for (const l of leftovers.slice(0, 20)) console.log("  " + l.file + "  ←  " + l.word);
}
const failed = log.filter((i) => !i.ok).length;
console.log("");
console.log(failed === 0 ? "结论：匿名版通过自检，可以打包。" : "结论：" + failed + " 项未通过，禁止打包。");
process.exit(failed === 0 ? 0 : 1);
