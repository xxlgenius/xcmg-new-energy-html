/* ============================================================
   main.js — 入口: 初始化外壳与三个面板
   ============================================================ */
(function () {
  "use strict";

  /* 媒体降级: 视频 error 时以 poster 或占位框替代, 不影响其余渲染 */
  function watchMediaErrors() {
    document.addEventListener("error", function (e) {
      var v = e.target;
      if (!(v instanceof HTMLVideoElement) || v.dataset.fallback) return;
      v.dataset.fallback = "1";
      var f = document.createElement("div");
      f.className = "media-fallback";
      if (v.poster) {
        var img = new Image();
        img.src = v.poster;
        f.appendChild(img);
      } else {
        f.innerHTML = '<div class="mf-warn">&#9888;</div><div>视频暂不可用</div>';
      }
      v.parentNode.insertBefore(f, v);
      v.style.display = "none";
      console.warn("[media] 视频加载失败, 已降级:", v.currentSrc || v.src);
    }, true);
  }

  function boot() {
    Shell.fit();
    watchMediaErrors();
    if (window.LeftPanel) LeftPanel.init(document.getElementById("left-body"), window.DATA);
    if (window.MiddlePanel) MiddlePanel.init(document.getElementById("center-body"), window.DATA);
    if (window.RightPanel) RightPanel.init(document.getElementById("right-body"), window.DATA);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
