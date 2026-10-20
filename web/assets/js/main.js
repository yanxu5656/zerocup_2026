/* 灯影 · main.js
   全局：导航开合、滚动入场、时间轴、流派切换、工序弹层
   （无依赖，能力缺失时全部降级为静态可读） */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- 导航 ---------- */
  var toggle = $("#navToggle");
  var links = $("#navLinks");

  function closeNav() {
    if (!toggle || !links) return;
    toggle.setAttribute("aria-expanded", "false");
    links.dataset.open = "false";
  }

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      links.dataset.open = String(!open);
    });
    links.addEventListener("click", function (e) {
      if (e.target && e.target.tagName === "A") closeNav();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });
  }

  /* ---------- 滚动入场 ---------- */
  var reveals = $$(".reveal");
  var staggers = $$("[data-stagger]");
  staggers.forEach(function (box) {
    Array.prototype.forEach.call(box.children, function (child, i) {
      child.style.setProperty("--i", String(i));
    });
  });
  var revealTargets = reveals.concat(staggers);
  var isStatic = /[?&]static=1/.test(window.location.search);
  if (isStatic) document.documentElement.classList.add("is-static");
  if (revealTargets.length && isStatic) {
    revealTargets.forEach(function (el) { el.classList.add("is-in"); });
  } else if (revealTargets.length) {
    if (!("IntersectionObserver" in window)) {
      revealTargets.forEach(function (el) { el.classList.add("is-in"); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
      revealTargets.forEach(function (el) { io.observe(el); });
      requestAnimationFrame(function () {
        revealTargets.forEach(function (el) {
          if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add("is-in");
        });
      });
    }
  }

  /* ---------- 时间轴 ---------- */
  var tl = $("#timeline");
  var tlBar = $("#tlProgress");
  if (tl) {
    var items = $$(".tl-item", tl);

    if ("IntersectionObserver" in window) {
      var tlObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add("is-on");
        });
      }, { rootMargin: "0px 0px -30% 0px", threshold: 0.05 });
      items.forEach(function (it) { tlObs.observe(it); });
      items[0].classList.add("is-on");
    } else {
      items.forEach(function (it) { it.classList.add("is-on"); });
    }

    if (tlBar) {
      var onScroll = function () {
        var rect = tl.getBoundingClientRect();
        var vh = window.innerHeight;
        var total = rect.height;
        var passed = Math.min(Math.max(vh * 0.55 - rect.top, 0), total);
        tlBar.style.height = passed + "px";
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }

    $$(".tl-item__more", tl).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = btn.closest(".tl-item");
        var detail = $(".tl-item__detail", item);
        if (detail) {
          detail.remove();
          btn.textContent = "展开";
          btn.setAttribute("aria-expanded", "false");
          return;
        }
        detail = document.createElement("p");
        detail.className = "tl-item__detail";
        detail.textContent = btn.dataset.more;
        item.appendChild(detail);
        btn.textContent = "收起";
        btn.setAttribute("aria-expanded", "true");
      });
    });
  }

  /* ---------- 流派切换 ---------- */
  var SCHOOLS = {
    shaanxi: {
      name: "陕西 · 华县",
      desc: "关中人叫它“牛皮影”。影人用黄牛皮，刻得细密，一个人物要几千刀。唱腔是碗碗腔、老腔，声腔一起，满场的烟都静下来。",
      tags: ["黄牛皮", "碗碗腔", "刻工细密"],
      pat: "#pat-cloud"
    },
    tangshan: {
      name: "唐山 · 乐亭",
      desc: "驴皮影。影人小巧，刀口讲究“薄、透、亮”，上色偏鲜。唱的是乐亭大鼓的调子，一个人能唱出几种声口。",
      tags: ["驴皮", "乐亭大鼓", "影人小巧"],
      pat: "#pat-water"
    },
    sichuan: {
      name: "四川 · 成都",
      desc: "成都灯影的影人格外高大，讲究“大、亮、活”。川剧的锣鼓和帮腔一进来，戏就有了辣味。",
      tags: ["大影人", "川剧锣鼓", "帮腔"],
      pat: "#pat-dragon"
    },
    shandong: {
      name: "山东 · 泰山",
      desc: "泰山皮影最出名的是“十不闲”：一个人、一张嘴、一套乐器，把一台戏全包了。人少，戏不减。",
      tags: ["十不闲", "一人一台戏", "节奏紧"],
      pat: "#pat-key"
    },
    zhejiang: {
      name: "浙江 · 海宁",
      desc: "江南的影戏细软些，丝竹配唱，影人动作轻。水乡的台口小，看客近，戏就得耐看。",
      tags: ["丝竹", "动作轻", "台口小"],
      pat: "#pat-flower"
    }
  };

  var schoolBtns = $$(".school");
  if (schoolBtns.length) {
    var sName = $("#schoolName");
    var sDesc = $("#schoolDesc");
    var sTags = $("#schoolTags");
    var sArt = $("#schoolArt");

    schoolBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.school;
        var data = SCHOOLS[key];
        if (!data) return;
        schoolBtns.forEach(function (b) { b.setAttribute("aria-selected", String(b === btn)); });
        sName.textContent = data.name;
        sDesc.textContent = data.desc;
        sTags.innerHTML = data.tags.map(function (t) { return '<span class="chip">' + t + "</span>"; }).join("");
        if (sArt) sArt.setAttribute("href", data.pat);
      });
    });
  }

  /* ---------- 工序弹层 ---------- */
  var CRAFTS = [
    { name: "选皮", text: "牛皮要选老黄牛，厚薄均匀、没有划伤。看皮的人会把整张皮对着光举起来，只凭透光的均匀程度判断能不能刻。" },
    { name: "制皮", text: "泡软、刮薄、绷在木框上阴干。要刮到半透明——太厚不透光，太薄一戳就破。" },
    { name: "画稿", text: "把样子过到皮上。老艺人不用底稿，几笔就定出头脸、身架、关节的位置，这是最难偷的一手。" },
    { name: "镂刻", text: "推着皮走刀，刀不动，皮转。一个头脸几百刀，一身行头几千刀。刀口斜切，光才透得进来。" },
    { name: "敷彩", text: "矿物颜料加牛皮胶，一层层罩染。红要正、绿要沉、黄要透。胶调不好，颜色几年就褪。" },
    { name: "发汗熨平", text: "受热，让颜色吃进皮里，同时把皮熨平。温度差一点，色就浮在表面，一摸就掉。" },
    { name: "缀结", text: "关节处打孔、穿线、装竹签。三根签管一个影人，手腕一抖，它就活了。" }
  ];

  var modal = $("#craftModal");
  if (modal && $$(".craft").length) {
    var mIdx = $("#craftModalIdx");
    var mTitle = $("#craftModalTitle");
    var mText = $("#craftModalText");
    var mClose = $("#craftModalClose");
    var lastFocus = null;

    var openModal = function (i) {
      var c = CRAFTS[i];
      if (!c) return;
      if (window.LampAch) window.LampAch.tick("craft", i, 7, "crafts");
      lastFocus = document.activeElement;
      mIdx.textContent = "工序 " + "一二三四五六七".charAt(i) + " / 七";
      mTitle.textContent = c.name;
      mText.textContent = c.text;
      modal.dataset.open = "true";
      if (mClose) mClose.focus();
    };

    var closeModal = function () {
      modal.dataset.open = "false";
      if (lastFocus) lastFocus.focus();
    };

    $$(".craft").forEach(function (btn) {
      btn.addEventListener("click", function () { openModal(Number(btn.dataset.craft)); });
    });
    if (mClose) mClose.addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.dataset.open === "true") closeModal();
    });
  }

  /* ---------- 工具墙（触屏点击展开） ---------- */
  $$(".tool").forEach(function (tool) {
    tool.addEventListener("click", function () {
      var open = tool.classList.toggle("is-open");
      tool.setAttribute("aria-expanded", String(open));
    });
    tool.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tool.click(); }
    });
  });

  /* ---------- 传承人卡片翻转 ---------- */
  $$(".master").forEach(function (card) {
    card.addEventListener("click", function () {
      var on = card.getAttribute("aria-pressed") === "true";
      card.setAttribute("aria-pressed", String(!on));
    });
  });
})();
