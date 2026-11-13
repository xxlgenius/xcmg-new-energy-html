/* ============================================================
   left.js — 左屏 · 产品型谱
   四分类行横滑 + 产品详情卡转场 (grid → opening → detail → closing → grid)
   ============================================================ */
(function () {
  "use strict";

  /* 分类图标 (内联 SVG) */
  var ICONS = {
    bolt: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z"/></svg>',
    cable: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 20c2-6 5-6 7-8s1-5 4-6m5 14c-2-6-5-6-7-8"/><circle cx="5" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>',
    hybrid: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    battery: '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="15" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="19.5" y="10.5" width="2.5" height="4" rx="0.8" fill="currentColor"/><rect x="6.2" y="10.2" width="4.5" height="4.6" fill="currentColor"/></svg>',
  };

  var state = "grid";           // grid | opening | detail | closing
  var gridLayer, detailLayer, closeBtnEl;
  var draggers = [];

  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ---------------- 型谱网格层 ---------------- */

  function buildGrid(body, data) {
    gridLayer = el("div", "ps-grid", body);
    data.products.categories.forEach(function (cat) {
      var row = el("div", "ps-row", gridLayer);
      el("div", "ps-tab", row,
        '<div class="ps-tab-icon">' + (ICONS[cat.icon] || "") + "</div>" +
        '<div class="ps-tab-zh">' + cat.label + "</div>" +
        '<div class="ps-tab-en">' + cat.en + "</div>");
      var viewport = el("div", "ps-vp", row);
      var track = el("div", "ps-track", viewport);
      cat.products.forEach(function (p, i) {
        var card = el("div", "p-card", track);
        card.style.setProperty("--d", (i % 4) * 0.07 + "s");
        card.dataset.id = p.id;
        el("div", "p-card-label", card, "<i></i>" + p.name);
        var img = el("img", "p-card-img", card);
        img.src = p.img;
        img.alt = p.name;
        card.addEventListener("click", function () { openDetail(p, cat); });
      });
      // 行内横滑
      var dragger = new Gestures.DragAxis({
        el: viewport,
        bounds: function () {
          var over = track.scrollWidth - viewport.clientWidth;
          return { min: -Math.max(0, over), max: 0 };
        },
        render: function (pos) { track.style.transform = "translateX(" + pos + "px)"; },
      });
      draggers.push(dragger);
    });
  }

  /* ---------------- 详情层 ---------------- */

  function specRowsHTML(d) {
    if (d.table) {
      var t = d.table;
      var h = "<tr>" + t.head.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr>";
      t.rows.forEach(function (r) {
        h += "<tr>" + r.map(function (c) { return "<td>" + String(c).replace(/\n/g, "<br>") + "</td>"; }).join("") + "</tr>";
      });
      return '<table class="d-table">' + h + "</table>";
    }
    var rows = (d.specs || []).map(function (s) {
      return '<div class="d-kv"><div class="d-k">' + s.k + '</div><div class="d-v">' + s.v + "</div></div>";
    }).join("");
    return '<div class="d-kvs">' + rows + "</div>";
  }

  function buildDetail(body) {
    detailLayer = el("div", "ps-detail", body);
    detailLayer.innerHTML =
      '<div class="d-glowbg"></div>' +
      '<div class="d-head"><div class="card-label d-title"><i></i><span>产品介绍</span></div></div>' +
      '<div class="close-btn d-close" title="关闭"></div>' +
      '<div class="d-content">' +
      '  <div class="d-stage"><div class="d-ring"></div><img class="d-img" alt=""></div>' +
      '  <div class="d-info">' +
      '    <div class="d-name"></div>' +
      '    <div class="d-specs"></div>' +
      '    <div class="d-feat"></div>' +
      "  </div>" +
      "</div>";
    closeBtnEl = detailLayer.querySelector(".d-close");
    closeBtnEl.addEventListener("click", closeDetail);
  }

  function openDetail(p, cat) {
    if (state !== "grid") return;
    state = "opening";
    var d = p.detail;
    detailLayer.querySelector(".d-img").src = d.img || p.img;
    detailLayer.querySelector(".d-name").textContent = p.name + " · " + cat.label + "产品";
    detailLayer.querySelector(".d-specs").innerHTML = specRowsHTML(d);
    var feat = (d.features || "").replace(/^产品特点：/, "");
    detailLayer.querySelector(".d-feat").innerHTML = feat ? "<b>产品特点：</b>" + feat : "";
    // 1) 网格错落消散
    gridLayer.classList.add("leaving");
    setTimeout(function () {
      // 2) 详情进场
      gridLayer.style.display = "none";
      detailLayer.classList.add("active");
      setTimeout(function () {           // 等一帧让 transition 生效 (rAF 在部分环境会节流)
        detailLayer.classList.add("shown");
        state = "detail";
      }, 40);
    }, 520);
  }

  function closeDetail() {
    if (state !== "detail") return;
    state = "closing";
    detailLayer.classList.remove("shown");
    setTimeout(function () {
      detailLayer.classList.remove("active");
      gridLayer.style.display = "";
      setTimeout(function () {
        gridLayer.classList.remove("leaving");
        setTimeout(function () { state = "grid"; }, 480);
      }, 30);
    }, 460);
  }

  /* ---------------- 初始化 ---------------- */

  function init(body, data) {
    buildGrid(body, data);
    buildDetail(body);
  }

  window.LeftPanel = { init: init };
})();
