/* 灯影 · api.js
   双模数据层：有服务用服务，没服务用本地。
   原则：任何失败都静默降级，不许报错、不许阻塞主线。 */
(function () {
  "use strict";

  var api = {
    mode: "local",      /* local | cloud */
    ready: false,
    listeners: [],
    onReady: function (fn) {
      if (typeof fn !== "function") return;
      if (api.ready) { fn(api.mode); return; }
      api.listeners.push(fn);
    }
  };
  window.LampAPI = api;

  function settle() {
    api.ready = true;
    var list = api.listeners.slice();
    api.listeners.length = 0;
    list.forEach(function (fn) {
      try { fn(api.mode); } catch (e) { /* 忽略 */ }
    });
  }

  /* file:// 打开时（评委双击 index.html）不发起任何请求 */
  var http = location.protocol === "http:" || location.protocol === "https:";
  if (!http) { settle(); return; }

  var ctrl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = window.setTimeout(function () {
    if (ctrl) ctrl.abort();
  }, 1500);

  fetch("api/health", { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (data && data.ok) api.mode = "cloud";
    })
    .catch(function () { /* 没服务就安静降级 */ })
    .then(function () {
      window.clearTimeout(timer);
      settle();
    });

  function post(url, body) {
    if (api.mode !== "cloud") return Promise.resolve(null);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  function get(url) {
    if (api.mode !== "cloud") return Promise.resolve(null);
    return fetch(url, { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  /* 交一次成绩：{ rank, score, perfect, good, miss, ending } */
  api.submit = function (payload) { return post("api/score", payload); };

  /* 榜单：{ items: [{ name, rank, score, ts }] } */
  api.leaderboard = function () { return get("api/leaderboard?limit=8"); };
})();
