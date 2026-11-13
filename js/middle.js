/* ============================================================
   middle.js — 中屏 · 精益制造
   三个子屏左右滑动切换: ① 指标+孪生视频 ② 数智化技术视频墙 ③ 自主可控核心部件
   ============================================================ */
(function () {
  "use strict";

  var PAGE_W = 2414;            // 子屏宽度 (与面板一致)
  var N_PAGES = 3;
  var NAV_LABELS = ["精益制造", "数智技术", "核心部件"];   // 底部跳转按钮 (可改名)

  var METRIC_ICONS = {
    gauge: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M5 19a9 9 0 1 1 14 0"/><path fill="currentColor" d="m12 14 4.2-5.2-6.9 3.2z"/><circle cx="12" cy="14" r="2.4" fill="currentColor"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M9 21h6M10 18h4"/><path fill="currentColor" d="M12 3a6.5 6.5 0 0 0-3.7 11.8c.7.6 1.2 1.3 1.2 2.2h5c0-.9.5-1.6 1.2-2.2A6.5 6.5 0 0 0 12 3z"/></svg>',
    gears: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m10 3 .4 2.3a7 7 0 0 0-2.5 1.4L5.7 6 4 9l1.9 1.3a7 7 0 0 0 0 2.9L4 14.5l1.7 3 2.2-.7a7 7 0 0 0 2.5 1.4L10.8 21h3.4l.4-2.3a7 7 0 0 0 2.5-1.4l2.2.7 1.7-3-1.9-1.3a7 7 0 0 0 0-2.9L21 9.5l-1.7-3-2.2.7a7 7 0 0 0-2.5-1.4L14.2 3h-3.4zm1.5 5.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" transform="translate(-1 -1)"/><circle cx="17.5" cy="17.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="17.5" r="1.2" fill="currentColor"/></svg>',
  };
  var PART_ICONS = {
    self: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M7 4c0 5 10 5 10 9m0 7c0-5-10-5-10-9m0-4.5c1.5 1.2 3 1.7 5 2m-5 6.5c1.5-1.2 3-1.7 5-2m5-2c1.5 1.2 3 1.7 5 2m-5 4.5c1.5-1.2 3-1.7 5-2" transform="translate(-2.5 -1.5)"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M8.5 10V7.5a3 3 0 0 1 6 0V10"/><path fill="currentColor" d="M10.2 13.8h2.6l-.5 2.6h-1.6z"/></svg>',
  };

  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }

  var body_, data_, pages = [], navBtns = [], dragger, current = 0;
  var videoIndex = { 0: [], 1: [], 2: [] };   // 页码 -> video 元素

  /* ---------------- 子屏一: 指标 + 孪生 ---------------- */

  function buildPageMetrics(page, m) {
    var sec = el("div", "mf-sec", page);
    el("div", "block-title", sec, '新能源产能布局 <span class="en">New Energy Product Capacity Layout</span>');
    var cards = el("div", "mt-row", sec);
    m.metrics.forEach(function (mt) {
      var c = el("div", "mt-card", cards);
      var num = el("div", "mt-num", c);
      el("span", "mt-value", num, mt.value);
      el("span", "mt-suffix", num, mt.suffix || "");
      el("div", "mt-label", c, mt.label);
      el("div", "mt-en", c, mt.en);
      var ic = el("div", "mt-icon", c);
      ic.innerHTML = METRIC_ICONS[mt.icon] || "";
    });

    var twin = el("div", "mf-sec mf-twin", page);
    el("div", "block-title", twin,
      data_.meta.twin.title + ' <span class="en">' + data_.meta.twin.en + "</span>");
    var box = el("div", "twin-box", twin);
    var v = el("video", "twin-video", box);
    v.src = m.twin.video;
    v.poster = m.twin.poster || "";
    v.muted = true; v.loop = true; v.autoplay = false; v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.preload = "auto";
    videoIndex[0].push(v);
  }

  /* ---------------- 子屏二: 技术视频墙 ---------------- */

  function buildPageTechs(page, m) {
    var sec = el("div", "mf-sec", page);
    el("div", "block-title", sec, data_.meta.tech.title + ' <span class="en">' + data_.meta.tech.en + "</span>");
    var grid = el("div", "tech-grid", sec);
    m.techs.forEach(function (t) {
      var c = el("div", "tech-card t-card", grid);
      el("div", "t-name", c, t.name);
      var v = el("video", "t-video", c);
      v.src = t.video;
      v.muted = true; v.loop = true; v.autoplay = false; v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.preload = "auto";
      videoIndex[1].push(v);
    });
  }

  /* ---------------- 子屏三: 核心部件 ---------------- */

  function buildPageParts(page, m) {
    var sec = el("div", "mf-sec", page);
    el("div", "block-title", sec, data_.meta.parts.title + ' <span class="en">' + data_.meta.parts.en + "</span>");
    var counts = el("div", "part-counts", sec);
    el("div", "part-count pc-self", counts,
      '<div class="pc-num"><b>' + m.components.selfCount + "</b><span>类</span></div>" +
      '<div class="pc-label">徐工自研零部件<div class="pc-en">Self-developed Components</div></div>' +
      '<div class="pc-icon">' + PART_ICONS.self + "</div>");
    el("div", "part-count pc-exc", counts,
      '<div class="pc-num"><b>' + m.components.exclusiveCount + "</b><span>类</span></div>" +
      '<div class="pc-label">徐工独有零部件<div class="pc-en">Exclusive Components</div></div>' +
      '<div class="pc-icon">' + PART_ICONS.lock + "</div>");
    var grid = el("div", "part-grid", sec);
    m.components.items.forEach(function (it) {
      var c = el("div", "tech-card p-card2", grid);
      el("div", "p-card2-label", c, it.name);
      var img = el("img", "p-card2-img", c);
      img.src = it.img;
      img.alt = it.name;
    });
  }

  /* ---------------- 翻页 ---------------- */

  function trackEl() { return document.getElementById("mf-track"); }

  function goTo(i, ms) {
    current = Math.max(0, Math.min(N_PAGES - 1, i));
    dragger.animateTo(-current * PAGE_W, ms || 520, false);
    syncDots();
    syncVideos();
  }

  function syncDots() {
    navBtns.forEach(function (b, i) { b.classList.toggle("on", i === current); });
  }

  function syncVideos() {
    for (var p = 0; p < N_PAGES; p++) {
      videoIndex[p].forEach(function (v) {
        if (p === current) { v.play().catch(function () {}); }
        else { v.pause(); }
      });
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init(body, data) {
    body_ = body; data_ = data;
    var viewport = el("div", "mf-vp", body);
    var track = el("div", "mf-track", viewport);
    track.id = "mf-track";
    var m = data.manufacturing;

    var pagesWrap = [];
    for (var i = 0; i < N_PAGES; i++) {
      var pg = el("div", "mf-page", track);
      pagesWrap.push(pg);
    }
    buildPageMetrics(pagesWrap[0], m);
    buildPageTechs(pagesWrap[1], m);
    buildPageParts(pagesWrap[2], m);

    // 底部跳转按钮: 挂在舞台层级, 位于中屏面板边框下方 (不挤占面板内部空间)
    var nav = el("div", "mf-nav", document.getElementById("stage"));
    for (i = 0; i < N_PAGES; i++) {
      var b = el("div", "mf-btn" + (i === 0 ? " on" : ""), nav, NAV_LABELS[i]);
      navBtns.push(b);
      (function (idx) {
        b.addEventListener("click", function () { goTo(idx); });
      })(i);
    }

    dragger = new Gestures.DragAxis({
      el: viewport,
      inertia: false,
      bounds: function () { return { min: -(N_PAGES - 1) * PAGE_W, max: 0 }; },
      render: function (pos) { track.style.transform = "translateX(" + pos + "px)"; },
      onRelease: function (pos, vel) {
        // 依据速度(快速轻扫)或位移(>18% 宽)决定目标子屏
        var page = -pos / PAGE_W;
        var target;
        if (vel < -600) target = Math.round(page + 0.30);
        else if (vel > 600) target = Math.round(page - 0.30);
        else target = (page - Math.floor(page) > 0.18) ? Math.ceil(page) : Math.floor(page);
        goTo(Math.max(0, Math.min(N_PAGES - 1, target)), 480);
      },
    });
    current = 0;
    syncVideos();
    window.__mfDragger = dragger;  // 调试句柄
  }

  window.MiddlePanel = { init: init };
})();
