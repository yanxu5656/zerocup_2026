/* 灯影 · theater.js
   影窗剧场：三出戏、逐句字幕、灯光明暗。
   未通关时只放第一出第一句；通关后全开。 */
(function () {
  "use strict";

  var root = document.getElementById("theater");
  if (!root) return;

  var PLAYS = [
    {
      name: "三打白骨精",
      lines: [
        "师父，山那边来了个送饭的姑娘。",
        "悟空睁眼一看：是妖气。",
        "一棒下去，饭篮化成一堆白骨。",
        "师父念起紧箍咒，猴王疼得翻了个跟头。"
      ]
    },
    {
      name: "劈山救母",
      lines: [
        "华山底下，压着一个人。",
        "沉香把那把斧头磨了三年。",
        "斧落，山开，一道光冲上天。",
        "母亲走出来，头发已经白了。"
      ]
    },
    {
      name: "白蛇传 · 断桥",
      lines: [
        "断桥不断，雨还在下。",
        "许仙撑伞，伞偏向她那边。",
        "小青说：姐姐，他是人。",
        "白素贞只回了一句：我知道。"
      ]
    }
  ];

  var subtitle = document.getElementById("subtitle");
  var scene = document.getElementById("scene");
  var screen = scene ? scene.closest(".screen") : null;
  var playBtn = document.getElementById("playBtn");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var brightness = document.getElementById("brightness");
  var brightnessVal = document.getElementById("brightnessVal");
  var lockEl = document.getElementById("theaterLock");
  var plays = Array.prototype.slice.call(document.querySelectorAll(".play"));

  var state = { play: 0, line: 0, playing: false, unlocked: false };
  var typeTimer = null;
  var holdTimer = null;

  function storedPass() {
    try { return localStorage.getItem("playPassed") === "1"; } catch (e) { return false; }
  }

  function stopTimers() {
    window.clearInterval(typeTimer);
    window.clearTimeout(holdTimer);
    typeTimer = null;
    holdTimer = null;
  }

  function typeLine(text, done) {
    window.clearInterval(typeTimer);
    subtitle.textContent = "";
    var i = 0;
    typeTimer = window.setInterval(function () {
      i += 1;
      subtitle.textContent = text.slice(0, i);
      if (i >= text.length) {
        window.clearInterval(typeTimer);
        typeTimer = null;
        if (done) done();
      }
    }, 52);
  }

  function render(animate) {
    var p = PLAYS[state.play];
    var line = p.lines[state.line] || "";
    if (scene) scene.dataset.scene = String(state.play);
    plays.forEach(function (b, i) { b.setAttribute("aria-current", String(i === state.play)); });
    if (animate !== false) {
      typeLine(line);
    } else {
      subtitle.textContent = line;
    }
  }

  function advance(auto) {
    var p = PLAYS[state.play];
    if (state.line < p.lines.length - 1) {
      state.line += 1;
      render();
      if (auto) holdAdvance();
    } else {
      state.playing = false;
      if (playBtn) playBtn.textContent = "重播";
    }
  }

  function holdAdvance() {
    window.clearTimeout(holdTimer);
    if (!state.playing) return;
    holdTimer = window.setTimeout(function () { advance(true); }, 2600);
  }

  function play() {
    if (!state.unlocked && state.play > 0) return;
    var p = PLAYS[state.play];
    if (state.line >= p.lines.length - 1) state.line = 0;
    state.playing = true;
    if (playBtn) playBtn.textContent = "暂停";
    render();
    holdAdvance();
  }

  function pause() {
    state.playing = false;
    window.clearTimeout(holdTimer);
    if (playBtn) playBtn.textContent = "播放";
  }

  function unlock() {
    state.unlocked = true;
    plays.forEach(function (b) { b.removeAttribute("disabled"); b.setAttribute("aria-disabled", "false"); });
    if (lockEl) { lockEl.innerHTML = "<b>已解锁</b>：三出戏都能放了。灯也可以调暗，字幕会自己提亮。"; }
  }

  /* ---------- 事件 ---------- */
  if (playBtn) {
    playBtn.addEventListener("click", function () {
      if (state.playing) { pause(); } else { play(); }
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (state.line > 0) { state.line -= 1; render(); }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      if (!state.unlocked && state.play === 0 && state.line >= 0 && state.line === 0) {
        /* 未通关时只允许看第一句 */
        if (lockEl) lockEl.innerHTML = "<b>剧场还锁着</b>：先在弄影台通关，这里才会放开三出戏。";
        return;
      }
      advance(false);
    });
  }

  plays.forEach(function (btn, i) {
    btn.addEventListener("click", function () {
      if (!state.unlocked && i > 0) {
        if (lockEl) lockEl.innerHTML = "<b>剧场还锁着</b>：先去弄影台通关。";
        return;
      }
      state.play = i;
      state.line = 0;
      pause();
      render();
    });
  });

  if (brightness) {
    brightness.addEventListener("input", function () {
      var v = Number(brightness.value);
      if (brightnessVal) brightnessVal.textContent = v + "%";
      if (scene) scene.style.filter = "brightness(" + (0.35 + v / 100 * 0.65).toFixed(2) + ")";
      if (screen) screen.setAttribute("data-dim", v < 60 ? "1" : "0");
    });
  }

  /* ---------- 初始化 ---------- */
  state.unlocked = storedPass();
  if (state.unlocked) unlock();
  else {
    plays.forEach(function (b, i) {
      if (i > 0) { b.setAttribute("disabled", "disabled"); b.setAttribute("aria-disabled", "true"); }
    });
    if (lockEl) lockEl.innerHTML = "<b>剧场还锁着</b>：先在弄影台通关，再回来看整出戏。";
  }

  render(false);
  if (subtitle) subtitle.textContent = PLAYS[0].lines[0];

  window.LampTheater = { unlock: unlock };
})();
