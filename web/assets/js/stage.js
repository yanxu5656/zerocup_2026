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
  var stickArmL = document.getElementById("stickArmL");
  var stickArmR = document.getElementById("stickArmR");
  var beatPips = document.getElementById("beatPips");
  var soundBtn = document.getElementById("soundBtn");
  var judgeEl = document.getElementById("judge");
  var crowdEl = document.getElementById("crowd");
  var finalBox = document.getElementById("stageFinal");
  var finalRank = document.getElementById("finalRank");
  var finalNote = document.getElementById("finalNote");
  var finalBranch = document.getElementById("finalBranch");
  var shareBtn = document.getElementById("shareBtn");
  var board = document.getElementById("board");
  var boardList = document.getElementById("boardList");
  var boardEmpty = document.getElementById("boardEmpty");
  var boardMode = document.getElementById("boardMode");

  var SNAP = 8;            /* 吸附阈值（度） */
  var CURTAIN_TARGET = 88; /* 第三关：幕布拉开到 88% */
  var CURTAIN_START = 64;  /* 初始两侧各留 18% 作为台口 */
  var BEAT_MS = 667;       /* 90 BPM，一拍 667ms */
  var state = {
    level: 0, rot: {}, open: CURTAIN_START, passed: false, busy: false,
    sound: false, grades: [], combo: 0, score: 0,
    result: null, endingText: ""
  };

  var LEVELS = [
    {
      name: "一折 · 抬",
      hint: '一折 · <b>抬</b>：把右臂抬到 <b>60°</b>，影子先立住',
      tip: "拖动发光的关节",
      targets: { armR: -150 },
      joints: ["armR"]
    },
    {
      name: "二折 · 拉",
      hint: '二折 · <b>拉</b>：左臂向后拉到 <b>30°</b>，右臂别落',
      tip: "两个关节都要到位",
      targets: { armR: -150, armL: 120 },
      joints: ["armR", "armL"]
    },
    {
      name: "三折 · 跨",
      hint: '三折 · <b>跨</b>：抬右腿 <b>40°</b>，把大幕拉到 <b>九成</b>',
      tip: "拖关节，再拖两侧的“幕”",
      targets: { armR: -150, armL: 120, legR: -50 },
      joints: ["armR", "armL", "legR"]
    }
  ];

  /* 末折之后的两种收场：不改变成绩，只改变落幕那一刻 */
  var ENDINGS = {
    curl: "多亮了一手，台下又叫了一声好。灯再亮三秒，影子才慢慢落回幕里。",
    bow: "收势，抬手一揖。灯灭，幕合，掌声从幕布后面透过来。"
  };

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
    syncSticks();
  }

  /* 竹签跟着手走：签头随手心转，签尾固定在台口握杆上 */
  function rotPoint(px, py, cx, cy, deg) {
    var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    var dx = px - cx, dy = py - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function syncSticks() {
    if (!stickArmL || !stickArmR) return;
    var l = rotPoint(163, 314, 164, 192, state.rot.armL || 0);
    var r = rotPoint(257, 314, 256, 192, state.rot.armR || 0);
    stickArmL.setAttribute("x1", l.x.toFixed(1));
    stickArmL.setAttribute("y1", l.y.toFixed(1));
    stickArmR.setAttribute("x1", r.x.toFixed(1));
    stickArmR.setAttribute("y1", r.y.toFixed(1));
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

  function playerName() {
    try { return localStorage.getItem("lampName") || "灯下客"; } catch (e) { return "灯下客"; }
  }

  function boardRow(i, it) {
    var li = document.createElement("li");
    li.className = "board__row";
    var no = document.createElement("span");
    no.className = "board__no";
    no.textContent = String(i + 1);
    var name = document.createElement("span");
    name.className = "board__name";
    name.textContent = it.name || "灯下客";
    var rank = document.createElement("span");
    rank.className = "board__rank";
    rank.textContent = it.rank || "";
    var score = document.createElement("span");
    score.className = "board__score";
    score.textContent = String(it.score == null ? "" : it.score);
    li.appendChild(no);
    li.appendChild(name);
    li.appendChild(rank);
    li.appendChild(score);
    return li;
  }

  function paintBoard(items, mode) {
    if (!board || !boardList) return;
    board.hidden = false;
    boardList.innerHTML = "";
    (items || []).slice(0, 6).forEach(function (it, i) {
      boardList.appendChild(boardRow(i, it));
    });
    if (boardEmpty) boardEmpty.hidden = !!(items && items.length);
    if (boardMode) boardMode.textContent = mode === "cloud" ? "云端" : "本地";
  }

  function refreshBoard() {
    if (!window.LampAPI) return;
    if (window.LampAPI.mode !== "cloud") {
      var local = [];
      try {
        var saved = JSON.parse(localStorage.getItem("playResult") || "null");
        if (saved) local = [{ name: playerName(), rank: saved.rank, score: saved.score }];
      } catch (e) { /* 忽略 */ }
      /* 本地模式且没成绩时，不摆一个空榜单占位置 */
      if (local.length) { paintBoard(local, "local"); }
      else if (board) { board.hidden = true; }
      return;
    }
    window.LampAPI.leaderboard().then(function (data) {
      paintBoard(data && data.items ? data.items : [], "cloud");
    });
  }

  /* ---------- 鼓点与判定 ---------- */
  var beatStart = 0, beatTimer = null, beatCount = 0, audioCtx = null;

  function paintBeat(n) {
    if (!beatPips) return;
    var pips = beatPips.children;
    for (var i = 0; i < pips.length; i++) {
      pips[i].classList.toggle("is-on", i === (n % 4));
    }
  }

  function startBeat() {
    if (beatStart) return;
    beatStart = performance.now();
    paintBeat(0);
    beatTimer = window.setInterval(function () {
      beatCount += 1;
      paintBeat(beatCount);
      clickTick(beatCount % 4 === 0);
    }, BEAT_MS);
  }

  /* 距离最近一拍的时间差（毫秒） */
  function beatPhase() {
    if (!beatStart) return 999;
    var t = (performance.now() - beatStart) % BEAT_MS;
    return Math.min(t, BEAT_MS - t);
  }

  function clickTick(strong) {
    if (!state.sound || !audioCtx) return;
    var t = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(strong ? 880 : 640, t);
    osc.frequency.exponentialRampToValueAtTime(strong ? 520 : 420, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.09 : 0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function showJudge(grade) {
    if (!judgeEl) return;
    judgeEl.className = "judge" + (grade === "准" ? " is-perfect" : grade === "失" ? " is-miss" : "");
    judgeEl.innerHTML = "<b>" + grade + "</b>" + (state.combo > 1 ? "<span>连 " + state.combo + "</span>" : "");
    void judgeEl.offsetWidth;
    judgeEl.classList.add("is-show");
  }

  /* 掌声：白噪声过带通，短促衰减，不用任何音频文件 */
  function cheerNoise(strong) {
    if (!state.sound || !audioCtx) return;
    var sr = audioCtx.sampleRate;
    var dur = 0.85;
    var buf = audioCtx.createBuffer(1, Math.floor(sr * dur), sr);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) {
      var k = 1 - i / d.length;
      d[i] = (Math.random() * 2 - 1) * k * k;
    }
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    var bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = strong ? 1400 : 900;
    bp.Q.value = 0.8;
    var g = audioCtx.createGain();
    g.gain.value = strong ? 0.09 : 0.045;
    src.connect(bp);
    bp.connect(g);
    g.connect(audioCtx.destination);
    src.start();
  }

  var crowdTimer = 0;
  function crowdMood(kind) {
    if (!crowdEl) return;
    window.clearTimeout(crowdTimer);
    crowdEl.classList.remove("is-cheer", "is-hush");
    viewport.classList.remove("is-cheer");
    void crowdEl.offsetWidth;
    if (kind === "hush") {
      crowdEl.classList.add("is-hush");
      crowdTimer = window.setTimeout(function () { crowdEl.classList.remove("is-hush"); }, 1200);
    } else {
      crowdEl.classList.add("is-cheer");
      viewport.classList.add("is-cheer");
      crowdTimer = window.setTimeout(function () {
        crowdEl.classList.remove("is-cheer");
        viewport.classList.remove("is-cheer");
      }, 1500);
      cheerNoise(kind === "cheer");
    }
  }

  /* 每吸附一个关节判定一次：离鼓点越近分越高 */
  function judgeSnap(name) {
    startBeat();
    var d = beatPhase();
    var grade = d <= 120 ? "准" : d <= 280 ? "良" : "失";
    state.grades.push({ name: name, grade: grade });
    if (grade === "失") {
      state.combo = 0;
    } else {
      state.combo += 1;
    }
    state.score += grade === "准" ? 100 : grade === "良" ? 60 : 20;
    if (state.combo > 1) state.score += (state.combo - 1) * 10;
    showJudge(grade);
    crowdMood(grade === "失" ? "hush" : grade === "准" ? "cheer" : "applause");
  }

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
    judgeSnap(lv.name);          /* 每过一关判定一次：是否踩在鼓点上 */
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

    var perfect = 0, good = 0, miss = 0;
    state.grades.forEach(function (g) {
      if (g.grade === "准") perfect += 1;
      else if (g.grade === "良") good += 1;
      else miss += 1;
    });
    var rank = "丙";
    if (perfect >= 3) rank = "甲";
    else if (miss === 0) rank = "乙";
    var label = { "甲": "满堂彩", "乙": "叫好", "丙": "还行" }[rank];
    state.result = { rank: rank, perfect: perfect, good: good, miss: miss };

    lockNote.innerHTML = "<b>通关 · " + rank + " 等</b>：" + label + "。" +
      "准 " + perfect + " · 良 " + good + " · 失 " + miss + "（" + state.score + " 分）。影窗剧场已解锁。";
    if (finalRank && finalNote && finalBox) {
      finalRank.textContent = rank;
      finalNote.textContent = label + " ｜ " + state.score + " 分";
      var oldEnd = finalBox.querySelector(".stage__final-end");
      if (oldEnd) oldEnd.remove();
      if (finalBranch) finalBranch.hidden = false;
      finalBox.hidden = false;
    }
    toTheater.setAttribute("aria-disabled", "false");
    toTheater.textContent = "去剧场 →";
    try {
      localStorage.setItem("playPassed", "1");
      localStorage.setItem("playResult", JSON.stringify({ rank: rank, score: state.score, perfect: perfect, good: good, miss: miss }));
    } catch (e) { /* 忽略 */ }

    if (window.LampAPI && window.LampAPI.mode === "cloud") {
      window.LampAPI.submit({
        name: playerName(),
        rank: rank,
        score: state.score,
        perfect: perfect,
        good: good,
        miss: miss,
        ending: ""
      }).then(function () { refreshBoard(); });
    }
    if (window.LampTheater && window.LampTheater.unlock) window.LampTheater.unlock();
  }

  /* ---------- 拖拽关节 ---------- */
  var spinRaf = 0;
  function cancelSpin() {
    if (spinRaf) { cancelAnimationFrame(spinRaf); spinRaf = 0; }
  }

  /* 松手后带一点惯性：越接近目标，阻尼越强，最终自己停住 */
  function spinOut(name, el, velocity) {
    var v = velocity;
    var last = performance.now();
    cancelSpin();
    function step(now) {
      spinRaf = 0;
      if (state.busy) return;
      var dt = Math.min(40, now - last);
      last = now;
      var cur = state.rot[name] || 0;
      cur += v * dt;
      v *= Math.pow(0.9, dt / 16);
      if (Math.abs(v) < 0.006) return;

      var target = currentLevel().targets[name];
      if (typeof target === "number" && Math.abs(cur - target) <= SNAP) {
        setRot(name, target);
        el.classList.add("is-snapped");
        spring(el);
        checkWin();
        return;
      }
      cur = Math.max(-175, Math.min(175, cur));
      setRot(name, cur);
      spinRaf = requestAnimationFrame(step);
    }
    spinRaf = requestAnimationFrame(step);
  }

  joints.forEach(function (el) {
    var name = el.dataset.joint;
    var pivot = pivotOf(el);
    var drag = null;

    el.addEventListener("pointerdown", function (e) {
      if (el.getAttribute("aria-disabled") === "true" || state.busy) return;
      var p = svgPoint(e);
      if (!p) return;
      e.preventDefault();
      startBeat();
      cancelSpin();
      el.classList.add("is-active");
      el.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        startAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180 / Math.PI,
        startRot: state.rot[name] || 0,
        prevRaw: state.rot[name] || 0,
        prevT: performance.now(),
        vel: 0
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

      /* 记录角速度，松手时用它做惯性 */
      var now = performance.now();
      if (now - drag.prevT > 4) {
        drag.vel = (raw - drag.prevRaw) / (now - drag.prevT);
        drag.prevRaw = raw;
        drag.prevT = now;
      }
    });

    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var v = Math.max(-0.5, Math.min(0.5, drag.vel || 0));
      var snapped = el.classList.contains("is-snapped");
      drag = null;
      el.classList.remove("is-active");
      checkWin();
      if (!state.busy && !snapped && Math.abs(v) > 0.012) spinOut(name, el, v);
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);

    /* 键盘：方向键微调，Enter 确认吸附 */
    el.addEventListener("keydown", function (e) {
      if (el.getAttribute("aria-disabled") === "true" || state.busy) return;
      startBeat();
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
          if (!el.classList.contains("is-snapped")) {
            el.classList.add("is-snapped");
            spring(el);
          }
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
    state.grades = [];
    state.combo = 0;
    state.score = 0;
    if (finalBox) finalBox.hidden = true;
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

  if (soundBtn) {
    soundBtn.addEventListener("click", function () {
      state.sound = !state.sound;
      soundBtn.setAttribute("aria-pressed", state.sound ? "true" : "false");
      if (state.sound) {
        if (!audioCtx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC) audioCtx = new AC();
        }
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
        startBeat();
      }
    });
  }

  /* 末折之后的两条收场：只是选择，不改成绩 */
  if (finalBranch) {
    finalBranch.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-ending]");
      if (!btn) return;
      var key = btn.getAttribute("data-ending");
      finalBranch.hidden = true;
      state.endingText = ENDINGS[key] || "";
      var line = document.createElement("span");
      line.className = "stage__final-end";
      line.textContent = ENDINGS[key] || "";
      if (finalBox) finalBox.appendChild(line);
      try { localStorage.setItem("playEnding", key); } catch (err) { /* 忽略 */ }
    });
  }

  /* 分享卡：把这一次的成绩画成一张 1080×1440 的图 */
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      if (!window.LampShare || !state.result) return;
      window.LampShare.save({
        rank: state.result.rank,
        score: state.score,
        perfect: state.result.perfect,
        good: state.result.good,
        miss: state.result.miss,
        quote: state.endingText
      });
    });
  }

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

  if (window.LampAPI) {
    window.LampAPI.onReady(function () { refreshBoard(); });
  }

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
