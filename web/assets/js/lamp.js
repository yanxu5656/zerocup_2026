/* 灯影 · lamp.js
   首页：点灯。灯未亮时整站压暗，点亮后写入 localStorage。
   其余页面由 body[data-lit] 共享同一套亮度语义。 */
(function () {
  "use strict";

  var body = document.body;
  var hero = document.getElementById("hero");
  var ignite = document.getElementById("ignite");

  function isLit() { return body.dataset.lit === "1"; }

  /* 支持 ?lit=1 直接进入已点灯状态（方便分享与截图，不影响正常流程） */
  var forceLit = /[?&]lit=1/.test(window.location.search);
  if (forceLit) {
    body.dataset.lit = "1";
    try { localStorage.setItem("lampLit", "1"); } catch (e) { /* 忽略 */ }
  }

  function light() {
    if (isLit()) return;
    body.dataset.lit = "1";
    try { localStorage.setItem("lampLit", "1"); } catch (e) { /* 忽略隐私模式 */ }
    if (hero) hero.setAttribute("data-lit", "1");
  }

  if (!isLit() && hero) {
    hero.addEventListener("click", function (e) {
      /* 点灯按钮自己会处理，避免重复触发 */
      if (e.target === ignite) return;
      light();
    });
    hero.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { light(); }
    });
    if (ignite) {
      ignite.addEventListener("click", function () { light(); });
    }
  }

  /* 首页入口卡的"已通关"角标 */
  var badge = document.getElementById("playBadge");
  var entryPlay = document.getElementById("entryPlay");
  try {
    if (badge && entryPlay && localStorage.getItem("playPassed") === "1") {
      badge.hidden = false;
      badge.parentElement.classList.add("is-passed");
    }
  } catch (e) { /* 忽略 */ }
})();
