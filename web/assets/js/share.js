/* 灯影 · share.js
   结算分享卡：1080×1440 的 PNG，纯 canvas 绘制，零依赖、零外链。
   对外接口：LampShare.canvas(data) → HTMLCanvasElement
             LampShare.save(data)   → 触发下载 */
(function () {
  "use strict";

  var W = 1080;
  var H = 1440;
  var SERIF = '"Songti SC", "STSong", "SimSun", "Noto Serif SC", serif';

  var C = {
    ink: "#0C0906",
    paper: "#F4EDE0",
    dim: "#C3B6A3",
    faint: "rgba(244,237,224,.52)",
    lamp: "#C9A227",
    hot: "#F4E2B2",
    cinnabar: "#C85C48"
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 场景与影人 ---------- */
  function drawStage(ctx) {
    /* 灯晕 */
    var glow = ctx.createRadialGradient(W / 2, 470, 40, W / 2, 470, 620);
    glow.addColorStop(0, "rgba(240,201,138,.34)");
    glow.addColorStop(0.45, "rgba(176,106,50,.16)");
    glow.addColorStop(1, "rgba(12,9,6,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    /* 月 */
    ctx.save();
    var moon = ctx.createRadialGradient(790, 330, 30, 790, 330, 110);
    moon.addColorStop(0, "rgba(255,246,228,.20)");
    moon.addColorStop(1, "rgba(255,246,228,0)");
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(790, 330, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,251,240,.86)";
    ctx.beginPath();
    ctx.arc(790, 330, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 远山 / 近山 */
    ctx.fillStyle = "rgba(74,42,20,.5)";
    ctx.beginPath();
    ctx.moveTo(0, 880);
    ctx.lineTo(190, 770);
    ctx.lineTo(360, 880);
    ctx.lineTo(560, 760);
    ctx.lineTo(760, 890);
    ctx.lineTo(920, 790);
    ctx.lineTo(1080, 878);
    ctx.lineTo(1080, 1000);
    ctx.lineTo(0, 1000);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(44,23,9,.92)";
    ctx.beginPath();
    ctx.moveTo(0, 960);
    ctx.lineTo(240, 884);
    ctx.lineTo(430, 966);
    ctx.lineTo(640, 880);
    ctx.lineTo(850, 970);
    ctx.lineTo(1080, 900);
    ctx.lineTo(1080, 1010);
    ctx.lineTo(0, 1010);
    ctx.closePath();
    ctx.fill();

    /* 台沿 */
    ctx.fillStyle = "#180C05";
    ctx.fillRect(0, 1000, W, 16);
    ctx.strokeStyle = "rgba(201,162,39,.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 1000);
    ctx.lineTo(W, 1000);
    ctx.stroke();
  }

  /* 影人：四分之三正面，双臂上举的亮相姿势 */
  function drawPuppet(ctx) {
    ctx.save();
    ctx.translate(W / 2 - 235, 466);
    ctx.scale(1.12, 1.12);
    ctx.fillStyle = "#120A05";

    /* 冠：三峰 */
    ctx.beginPath();
    ctx.moveTo(212, 122);
    ctx.lineTo(220, 92);
    ctx.lineTo(232, 108);
    ctx.lineTo(242, 80);
    ctx.lineTo(252, 108);
    ctx.lineTo(264, 92);
    ctx.lineTo(272, 122);
    ctx.closePath();
    ctx.fill();

    /* 头 */
    ctx.beginPath();
    ctx.arc(242, 150, 30, 0, Math.PI * 2);
    ctx.fill();

    /* 靠子 */
    ctx.beginPath();
    ctx.moveTo(204, 190);
    ctx.lineTo(280, 190);
    ctx.lineTo(294, 332);
    ctx.lineTo(284, 388);
    ctx.lineTo(200, 388);
    ctx.lineTo(190, 332);
    ctx.closePath();
    ctx.fill();

    /* 双臂：从上往下长，所以矩形要朝负方向，再微微一开就是 V 字 */
    ctx.save();
    ctx.translate(208, 216);
    ctx.rotate(-0.34);
    roundRect(ctx, -12, -118, 24, 118, 12);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(276, 216);
    ctx.rotate(0.34);
    roundRect(ctx, -12, -118, 24, 118, 12);
    ctx.fill();
    ctx.restore();

    /* 双腿 */
    roundRect(ctx, 208, 384, 26, 96, 12);
    ctx.fill();
    roundRect(ctx, 250, 384, 26, 96, 12);
    ctx.fill();

    /* 镂空：光从刀口里透出来，所以画成暖色而不是挖空 */
    ctx.fillStyle = "rgba(244,226,178,.82)";
    ctx.beginPath();
    ctx.arc(232, 148, 3.6, 0, Math.PI * 2);
    ctx.arc(252, 148, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(238, 232, 8, 104);
    ctx.fillRect(206, 300, 10, 3);
    ctx.fillRect(268, 300, 10, 3);

    ctx.restore();
  }

  /* ---------- 文案 ---------- */
  function centered(ctx, text, y, size, color, letterSpacing, weight) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = (weight || 400) + " " + size + "px " + SERIF;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var chars = String(text).split("");
    var widths = chars.map(function (ch) { return ctx.measureText(ch).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + letterSpacing * (chars.length - 1);
    var x = (W - total) / 2;
    chars.forEach(function (ch, i) {
      ctx.fillText(ch, x, y);
      x += widths[i] + letterSpacing;
    });
    ctx.restore();
  }

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + "." + (m.length < 2 ? "0" + m : m) + "." + (day.length < 2 ? "0" + day : day);
  }

  function canvas(data) {
    var cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext("2d");

    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);

    drawStage(ctx);
    drawPuppet(ctx);

    /* 外框 */
    ctx.strokeStyle = "rgba(201,162,39,.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    /* 顶部标题 */
    centered(ctx, "灯　影", 168, 64, C.paper, 6);
    centered(ctx, "一盏灯照见千年", 214, 24, C.faint, 8);

    /* 评级 */
    var rank = data.rank || "丙";
    var label = { "甲": "满堂彩", "乙": "叫好", "丙": "还行" }[rank] || "";
    centered(ctx, rank, 1128, 132, C.cinnabar, 0, 500);
    centered(ctx, label, 1172, 26, C.dim, 14);

    /* 成绩行 */
    var stats = "准 " + (data.perfect || 0) + " · 良 " + (data.good || 0) + " · 失 " + (data.miss || 0) + "　｜　" + (data.score || 0) + " 分";
    centered(ctx, stats, 1226, 26, C.faint, 5);

    /* 分隔 */
    ctx.strokeStyle = "rgba(201,162,39,.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 150, 1262);
    ctx.lineTo(W / 2 + 150, 1262);
    ctx.stroke();

    /* 戏文 */
    var line = data.quote || "灯亮起来，皮影才活。";
    centered(ctx, line.slice(0, 22), 1312, 28, C.dim, 3);

    /* 页脚 */
    centered(ctx, today() + "　·　零杯 2026 · 非遗主题", 1372, 20, "rgba(244,237,224,.34)", 3);

    return cv;
  }

  function save(data) {
    var cv = canvas(data || {});
    cv.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "灯影-" + (data.rank || "丙") + "等-" + (data.score || 0) + "分.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, "image/png");
  }

  window.LampShare = { canvas: canvas, save: save };
})();
