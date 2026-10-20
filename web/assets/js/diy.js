/* 灯影 · diy.js
   纹样下载 · DIY 皮影换装 · 导出 PNG · 本地寄语
   全程离线，不请求任何外部资源。 */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 通用下载 ---------- */
  function download(blob, filename) {
    if (window.LampAch) {
      if (/\.svg$/i.test(filename)) window.LampAch.unlock("pattern");
      else if (/\.png$/i.test(filename)) window.LampAch.unlock("maker");
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function serializeSvg(svgEl) {
    var clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(clone);
  }

  /* ---------- 纹样下载 ---------- */
  $$(".pattern").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var svg = $("svg", btn);
      if (!svg) return;
      var name = btn.dataset.name || "纹样";
      var text = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeSvg(svg);
      download(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), "灯影纹样-" + name + ".svg");
    });
  });

  /* ---------- DIY ---------- */
  var diySvg = document.getElementById("diySvg");
  if (!diySvg) return;

  var HEADS = [
    "M150 40c20 0 34 15 34 35 0 15-6 25-15 30v16h-38v-16c-9-5-15-15-15-30 0-20 14-35 34-35z",
    "M150 42c22 0 36 16 36 37 0 14-6 24-14 30v14h-44v-14c-8-6-14-16-14-30 0-21 14-37 36-37z",
    "M150 38c23 0 38 17 38 38 0 16-7 27-17 32v15h-42v-15c-10-5-17-16-17-32 0-21 15-38 38-38z"
  ];

  var state = { head: 0, pat: 0, color: "#E8B45A" };

  var headEl = document.getElementById("diyHead");
  var fills = $$(".diy-fill", diySvg);
  var patGroups = $$("#diyPatternLayer > g", diySvg);

  function renderDiy() {
    if (headEl) headEl.setAttribute("d", HEADS[state.head] || HEADS[0]);
    fills.forEach(function (el) { el.setAttribute("fill", state.color); });
    if (headEl) headEl.setAttribute("fill", state.color);
    patGroups.forEach(function (g, i) {
      g.style.display = i === state.pat ? "" : "none";
    });
  }

  $$("#headChoices .choice").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.head = Number(btn.dataset.head);
      $$("#headChoices .choice").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      renderDiy();
    });
  });

  $$("#patChoices .choice").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.pat = Number(btn.dataset.pat);
      $$("#patChoices .choice").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      renderDiy();
    });
  });

  $$("#colorChoices .swatch").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.color = btn.dataset.color;
      $$("#colorChoices .swatch").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      renderDiy();
    });
  });

  var hint = document.getElementById("exportHint");
  var exportBtn = document.getElementById("exportBtn");
  var resetBtn = document.getElementById("resetDiy");

  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      var clone = diySvg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", "600");
      clone.setAttribute("height", "760");
      var source = new XMLSerializer().serializeToString(clone);
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = 600;
          canvas.height = 760;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#14100C";
          ctx.fillRect(0, 0, 600, 760);
          ctx.drawImage(img, 0, 0, 600, 760);
          canvas.toBlob(function (blob) {
            if (blob) download(blob, "灯影-我的皮影.png");
            if (hint) hint.textContent = "已导出：灯影-我的皮影.png";
          }, "image/png");
        } catch (err) {
          if (hint) hint.textContent = "导出失败：请用 Chrome / Edge 打开本页再试。";
        }
      };
      img.onerror = function () {
        if (hint) hint.textContent = "导出失败：请用 Chrome / Edge 打开本页再试。";
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      state = { head: 0, pat: 0, color: "#E8B45A" };
      $$("#headChoices .choice").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === 0)); });
      $$("#patChoices .choice").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === 0)); });
      $$("#colorChoices .swatch").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === 0)); });
      renderDiy();
      if (hint) hint.textContent = "已还原成默认的样子。";
    });
  }

  renderDiy();

  /* ---------- 寄语 ---------- */
  var form = document.getElementById("wishForm");
  var input = document.getElementById("wishInput");
  var list = document.getElementById("wishList");
  var KEY = "lampWishes";

  function readWishes() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 20) : [];
    } catch (e) { return []; }
  }

  function renderWishes() {
    if (!list) return;
    var arr = readWishes();
    list.innerHTML = "";
    if (!arr.length) {
      var empty = document.createElement("p");
      empty.className = "tiny muted";
      empty.textContent = "还没有人点灯。你可以是第一个。";
      list.appendChild(empty);
      return;
    }
    arr.forEach(function (text) {
      var item = document.createElement("p");
      item.className = "wish-item";
      item.textContent = text;
      list.appendChild(item);
    });
  }

  if (form && input) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim().slice(0, 40);
      if (!text) return;
      var arr = readWishes();
      arr.unshift(text);
      try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 20))); } catch (err) { /* 忽略 */ }
      input.value = "";
      renderWishes();
    });
  }

  renderWishes();
})();
