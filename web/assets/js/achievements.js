/* 灯影 · achievements.js
   八枚徽章：本地存储、跨页累计、解锁即时提示。
   不依赖任何后端；localStorage 不可用时静默失效。 */
(function () {
  "use strict";

  var ACHS = [
    { id: "light", name: "初上灯", glyph: "灯", desc: "点亮首页那盏灯" },
    { id: "tour", name: "走完五幕", glyph: "幕", desc: "掌灯、溯影、弄影、见人、续灯都看过" },
    { id: "pass", name: "三折之下", glyph: "折", desc: "弄影台通关一次" },
    { id: "perfect", name: "满堂彩", glyph: "甲", desc: "三折全准，拿到甲等" },
    { id: "plays", name: "三出戏", glyph: "戏", desc: "把影窗剧场三出都看完" },
    { id: "crafts", name: "七道工", glyph: "工", desc: "七道工序逐个点开" },
    { id: "pattern", name: "一枚纹样", glyph: "纹", desc: "下载一张纹样 SVG" },
    { id: "maker", name: "做一张", glyph: "偶", desc: "导出自己拼的皮影" }
  ];

  var KEY = "lampAch";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }

  function meta(id) {
    for (var i = 0; i < ACHS.length; i++) if (ACHS[i].id === id) return ACHS[i];
    return null;
  }

  function has(id) { return !!state[id]; }

  /* ---------- 提示 ---------- */
  function toast(id) {
    var m = meta(id);
    if (!m || !document.body) return;
    var el = document.createElement("div");
    el.className = "toast";
    var b = document.createElement("b");
    b.textContent = "解锁";
    var s = document.createElement("span");
    s.textContent = m.name;
    el.appendChild(b);
    el.appendChild(s);
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    window.setTimeout(function () {
      el.classList.remove("is-in");
      window.setTimeout(function () { el.remove(); }, 420);
    }, 2600);
  }

  function unlock(id) {
    if (!meta(id)) return;
    if (!has(id)) {
      state[id] = Date.now();
      persist();
      toast(id);
    }
    paint();
  }

  /* 分组累计：点开第 index 个，满 total 个就解锁 */
  function tick(group, index, total, id) {
    state["@" + group + index] = 1;
    persist();
    for (var i = 0; i < total; i++) {
      if (!state["@" + group + i]) { paint(); return; }
    }
    unlock(id);
  }

  /* ---------- 徽章墙 ---------- */
  function paint() {
    var wall = document.getElementById("achWall");
    var count = document.getElementById("achCount");
    var got = 0;
    ACHS.forEach(function (a) { if (has(a.id)) got += 1; });
    if (count) count.textContent = got + " / " + ACHS.length;
    if (!wall) return;

    wall.innerHTML = "";
    ACHS.forEach(function (a, i) {
      var on = has(a.id);
      var box = document.createElement("div");
      box.className = "ach" + (on ? " is-on" : "");
      box.style.setProperty("--i", String(i));
      if (!on) box.title = a.desc;

      var seal = document.createElement("span");
      seal.className = "ach__seal";
      seal.textContent = a.glyph;

      var name = document.createElement("span");
      name.className = "ach__name";
      name.textContent = a.name;

      var desc = document.createElement("span");
      desc.className = "ach__desc";
      desc.textContent = a.desc;

      box.appendChild(seal);
      box.appendChild(name);
      box.appendChild(desc);
      wall.appendChild(box);
    });
  }

  /* 五幕走遍 */
  function trackPage() {
    var file = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/i, "") || "index";
    state["@" + file] = 1;
    persist();
    var need = ["index", "origin", "play", "people", "future"];
    for (var i = 0; i < need.length; i++) {
      if (!state["@" + need[i]]) { paint(); return; }
    }
    unlock("tour");
  }

  window.LampAch = { unlock: unlock, has: has, tick: tick, paint: paint, list: ACHS };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { trackPage(); paint(); });
  } else {
    trackPage();
    paint();
  }
})();
