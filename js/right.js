/* ============================================================
   right.js — 右屏 · 场景解决方案
   3×3 场景九宫格 + 点击在屏内放大播放视频/大图
   ============================================================ */
(function () {
  "use strict";

  var gridLayer, playerLayer, playerVideo, playerImg, playerTitle;
  var state = "grid";           // grid | opening | player | closing
  var currentVideo = null;      // 九宫格中的视频卡 (放大时暂停)

  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* 九宫格: 视频卡以 <video preload=metadata> 显示首帧封面 */
  function buildGrid(body, scenarios) {
    gridLayer = el("div", "sc-grid", body);
    scenarios.forEach(function (s, i) {
      var card = el("div", "sc-card", gridLayer);
      card.style.setProperty("--d", (i % 3) * 0.07 + "s");
      el("div", "sc-card-label", card, s.name);
      if (s.placeholder) el("span", "sc-ph", card, "占位素材");
      if (s.type === "video" && s.src) {
        var v = el("video", "sc-cover", card);
        v.src = s.src;
        v.muted = true;
        v.preload = "metadata";
        v.setAttribute("playsinline", "");
        if (s.poster) v.poster = s.poster;
        v.addEventListener("click", function () { openPlayer(s, v); });
      } else {
        var img = el("img", "sc-cover", card);
        img.src = s.poster || s.src || "";
        img.alt = s.name;
        img.addEventListener("click", function () { openPlayer(s, null); });
      }
    });
  }

  function buildPlayer(body) {
    playerLayer = el("div", "sc-player", body);
    playerLayer.innerHTML =
      '<div class="sc-backdrop"></div>' +
      '<div class="sc-stage">' +
      '  <div class="sc-head"><div class="card-label"><i></i><span class="sc-title">场景</span></div></div>' +
      '  <div class="close-btn sc-close" title="关闭"></div>' +
      '  <video class="sc-video" muted loop playsinline></video>' +
      '  <img class="sc-img" alt="">' +
      "</div>";
    playerVideo = playerLayer.querySelector(".sc-video");
    playerImg = playerLayer.querySelector(".sc-img");
    playerTitle = playerLayer.querySelector(".sc-title");
    playerLayer.querySelector(".sc-close").addEventListener("click", closePlayer);
  }

  function openPlayer(s, gridVideo) {
    if (state !== "grid") return;
    state = "opening";
    currentVideo = gridVideo;
    playerTitle.textContent = s.name;
    if (s.type === "video" && s.src) {
      playerImg.style.display = "none";
      playerVideo.style.display = "block";
      playerVideo.src = s.src;
      playerVideo.poster = s.poster || "";
      playerVideo.play().catch(function () {});
    } else {
      playerVideo.style.display = "none";
      playerVideo.removeAttribute("src");
      playerImg.style.display = "block";
      playerImg.src = s.poster || s.src || "";
    }
    if (currentVideo) currentVideo.pause();
    playerLayer.classList.add("active");
    setTimeout(function () {
      playerLayer.classList.add("shown");
      state = "player";
    }, 40);
  }

  function closePlayer() {
    if (state !== "player") return;
    state = "closing";
    playerLayer.classList.remove("shown");
    playerVideo.pause();
    playerVideo.removeAttribute("src");
    playerVideo.load();
    setTimeout(function () {
      playerLayer.classList.remove("active");
      if (currentVideo) currentVideo.play().catch(function () {});
      currentVideo = null;
      state = "grid";
    }, 460);
  }

  function init(body, data) {
    buildGrid(body, data.scenarios);
    buildPlayer(body);
  }

  window.RightPanel = { init: init };
})();
