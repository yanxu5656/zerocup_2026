/* 灯影 · stage.js
   弄影台：拖拽关节、角度吸附、三关判定、拉幕、键盘操作
   坐标为 SVG 用户单位（viewBox 0 0 420 560），与 CSS 缩放无关。 */
(function () {
  "use strict";

  var stage = document.getElementById("stageEl");
  if (!stage) return;

  var svg = document.getElementById("puppet");
  var viewport = document.getElementById("viewport");
  var hintEl = document.getElementById("stageHint");
  var levelName = document.getElementById("levelName");
  var tipText = document.getElementById("tipText");
  var dots = Array.prototype.slice.call(document.querySelectorAll("#dots i"));
  var stamp = document.getElementById("stamp");
  var stepItems = Array.prototype.slice.call(document.querySelectorAll(".step-item"));
  var toTheater = document.getElementById("toTheater");
  var lockNote = document.getElementById("lockNote");
  var resetBtn = document.getElementById("resetBtn");
  var hintBtn = document.getElementById("hintBtn");
  var grips = [document.getElementById("gripL"), document.getElementById("gripR")];
  var joints = Array.prototype.slice.call(svg.querySelectorAll(".joint"));

  var SNAP = 8;            /* 吸附阈值（度） */
  var CURTAIN_TARGET = 88; /* 第三关：幕布拉开到 88% */
  var CURTAIN_START = 64;  /* 初始两侧各留 18% 作为台口 */
  var state = { level: 0, rot: {}, open: CURTAIN_START, passed: false, busy: false };

  var LEVELS = [
    {
      name: "第一关 · 亮相",
      hint: '第一关 · 把右臂抬到 <b>60°</b>',
      tip: "拖动发光的关节",
      targets: { armR: -150 },
      joints: ["armR"]
    },
    {
      name: "第二关 · 开弓",
      hint: '第二关 · 再拉左臂 <b>30°</b>',
      tip: "两个关节都要到位",
      targets: { armR: -150, armL: 120 },
      joints: ["armR", "armL"]
    },
    {
      name: "第三关 · 跨马",
      hint: '第三关 · 抬右腿 <b>40°</b>，把幕拉到 <b>九成</b>',
      tip: "拖关节，再拖两侧的“幕”",
      targets: { armR: -150, armL: 120, legR: -50 },
      joints: ["armR", "armL", "legR"]
    }
  ];

  /* ---------- 工具 ---------- */
  function pivotOf(el) {
    var p = (el.dataset.pivot || "0,0").split(",");
    return { x: parseFloat(p[0]), y: parseFloat(p[1]) };
  }

  function setRot(name, deg) {
    var el = svg.querySelector('.joint[data-joint="' + name + '"]');
    if (!el) return;
    state.rot[name] = deg;
    var p = pivotOf(el);
    el.setAttribute("transform", "rotate(" + deg.toFixed(1) + " " + p.x + " " + p.y + ")");
    el.setAttribute("aria-label", el.getAttribute("aria-label").split("，")[0] + "，当前 " + Math.round(deg) + " 度");
  }

  function svgPoint(evt) {
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var m = svg.getScreenCTM();
    if (!m) return null;
    return pt.matrixTransform(m.inverse());
  }

  function spring(el) {
    var ring = el.querySelector(".joint__ring");
    if (!ring) return;
    ring.classList.remove("is-fire");
    void ring.getBoundingClientRect();
    ring.classList.add("is-fire");
  }

  function currentLevel() { return LEVELS[state.level]; }

  function isTargetMet(name) {
    var lv = currentLevel();
    return typeof lv.targets[name] === "number" && Math.abs(state.rot[name] - lv.targets[name]) <= SNAP;
  }

  /* ---------- 关卡状态 ---------- */
  function syncJoints() {
    var lv = currentLevel();
    joints.forEach(function (el) {
      var name = el.dataset.joint;
      var active = lv.joints.indexOf(name) !== -1;
      el.setAttribute("aria-disabled", active ? "false" : "true");
      el.setAttribute("tabindex", active ? "0" : "-1");
      el.classList.toggle("is-snapped", isTargetMet(name));
    });
    stage.classList.toggle("is-level3", state.level === 2);
    dots.forEach(function (d, i) { d.classList.toggle("is-on", i <= state.level); });
    levelName.textContent = lv.name;
    tipText.textContent = lv.tip;
    hintEl.innerHTML = lv.hint;
    stepItems.forEach(function (it, i) {
      it.classList.toggle("is-done", i < state.level || (state.passed && i === 2));
    });
  }

  function checkWin() {
    if (state.busy) return;
    var lv = currentLevel();
    var ok = Object.keys(lv.targets).every(function (k) { return isTargetMet(k); });
    if (state.level === 2) ok = ok && state.open >= CURTAIN_TARGET - 4;
    if (!ok) return;

    state.busy = true;
    stamp.classList.remove("is-fire");
    void stamp.offsetWidth;
    stamp.classList.add("is-fire");

    window.setTimeout(function () {
      stamp.classList.remove("is-fire");
      if (state.level < 2) {
        state.level += 1;
        state.busy = false;
        syncJoints();
        hintEl.innerHTML = currentLevel().hint;
      } else {
        finish();
      }
    }, 1500);
  }

  function finish() {
    state.passed = true;
    state.busy = false;
    stepItems.forEach(function (it) { it.classList.add("is-done"); });
    lockNote.innerHTML = "<b>通关</b>：影窗剧场已解锁。三出戏都可以看了，灯也能自己调。";
    toTheater.setAttribute("aria-disabled", "false");
    toTheater.textContent = "去剧场 →";
    try { localStorage.setItem("playPassed", "1"); } catch (e) { /* 忽略 */ }
    if (window.LampTheater && window.LampTheater.unlock) window.LampTheater.unlock();
  }

  /* ---------- 拖拽关节 ---------- */
  joints.forEach(function (el) {
    var name = el.dataset.joint;
    var pivot = pivotOf(el);
    var drag = null;

    el.addEventListener("pointerdown", function (e) {
      if (el.getAttribute("aria-disabled") === "true" || state.busy) return;
      var p = svgPoint(e);
      if (!p) return;
      e.preventDefault();
      el.classList.add("is-active");
      el.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        startAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180 / Math.PI,
        startRot: state.rot[name] || 0
      };
    });

    el.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var p = svgPoint(e);
      if (!p) return;
      var angle = Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180 / Math.PI;
      var delta = angle - drag.startAngle;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;

      var lv = currentLevel();
      var target = lv.targets[name];
      var raw = drag.startRot + delta;

      /* 接近目标时加一点阻尼，制造“到位了”的手感 */
      if (typeof target === "number" && Math.abs(raw - target) < 26) {
        raw = target + (raw - target) * 0.55;
      }
      raw = Math.max(-175, Math.min(175, raw));

      if (typeof target === "number" && Math.abs(raw - target) <= SNAP) {
        setRot(name, target);
        if (!el.classList.contains("is-snapped")) {
          el.classList.add("is-snapped");
          spring(el);
        }
        checkWin();
      } else {
        el.classList.remove("is-snapped");
        setRot(name, raw);
      }
    });

    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      el.classList.remove("is-active");
      checkWin();
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);

    /* 键盘：方向键微调，Enter 确认吸附 */
    el.addEventListener("keydown", function (e) {
      if (el.getAttribute("aria-disabled") === "true" || state.busy) return;
      var step = e.shiftKey ? 5 : 1;
      var cur = state.rot[name] || 0;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setRot(name, Math.min(175, cur + step));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setRot(name, Math.max(-175, cur - step));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        var target = currentLevel().targets[name];
        if (typeof target === "number" && Math.abs(cur - target) <= 14) {
          setRot(name, target);
          el.classList.add("is-snapped");
          spring(el);
        }
      } else {
        return;
      }
      checkWin();
    });
  });

  /* ---------- 拉幕 ---------- */
  grips.forEach(function (grip) {
    if (!grip) return;
    var drag = null;
    grip.addEventListener("pointerdown", function (e) {
      if (state.busy || state.level !== 2) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, open: state.open };
      grip.classList.add("is-active");
    });
    grip.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var w = viewport.getBoundingClientRect().width || 1;
      var dx = (e.clientX - drag.x) / w * 100 * 2;
      if (grip.id === "gripL") dx = -dx;
      var next = Math.max(CURTAIN_START, Math.min(95, drag.open + dx));
      state.open = next;
      stage.style.setProperty("--open", next.toFixed(1) + "%");
      checkWin();
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      grip.classList.remove("is-active");
      checkWin();
    }
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  });

  /* ---------- 重置与提示 ---------- */
  function reset() {
    state.level = 0;
    state.open = CURTAIN_START;
    state.busy = false;
    state.passed = false;
    ["armL", "armR", "legL", "legR"].forEach(function (n) { setRot(n, 0); });
    joints.forEach(function (el) { el.classList.remove("is-snapped", "is-active", "is-hint"); });
    stage.style.setProperty("--open", CURTAIN_START + "%");
    syncJoints();
    hintEl.innerHTML = currentLevel().hint;
  }

  function hintTargets() {
    var lv = currentLevel();
    joints.forEach(function (el) {
      if (lv.joints.indexOf(el.dataset.joint) !== -1 && !isTargetMet(el.dataset.joint)) {
        el.classList.add("is-hint");
        window.setTimeout(function () { el.classList.remove("is-hint"); }, 2400);
      }
    });
  }

  if (resetBtn) resetBtn.addEventListener("click", reset);
  if (hintBtn) hintBtn.addEventListener("click", hintTargets);

  /* 静止 3 秒后，目标关节呼吸提示 */
  var idleTimer = null;
  function armIdle() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(hintTargets, 3000);
  }
  viewport.addEventListener("pointerdown", function () {
    window.clearTimeout(idleTimer);
  });
  viewport.addEventListener("pointerup", armIdle);
  armIdle();

  /* ---------- 初始化 ---------- */
  ["armL", "armR", "legL", "legR"].forEach(function (n) { setRot(n, 0); });
  syncJoints();

  try {
    if (localStorage.getItem("playPassed") === "1") {
      state.passed = true;
      stepItems.forEach(function (it) { it.classList.add("is-done"); });
      lockNote.innerHTML = "<b>你上次已经通关</b>：剧场是开着的。想再玩一遍，点“重置”。";
      toTheater.setAttribute("aria-disabled", "false");
      toTheater.textContent = "去剧场 →";
    }
  } catch (e) { /* 忽略 */ }

  if (toTheater.getAttribute("aria-disabled") === "true") {
    toTheater.addEventListener("click", function (e) {
      if (state.passed) return;
      e.preventDefault();
      hintTargets();
      lockNote.innerHTML = "<b>还差一点</b>：先把当前这一关摆到位，剧场就会打开。";
    });
  }
})();
