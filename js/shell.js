/* ============================================================
   shell.js — 7040×1800 固定画布等比缩放适配
   ============================================================ */
(function () {
  "use strict";

  var W = 7040, H = 1800;

  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / W, vh / H);
    var stage = document.getElementById("stage");
    stage.style.transform = "scale(" + s + ")";
    // 居中
    var ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;
    stage.style.left = Math.max(0, ox) + "px";
    stage.style.top = Math.max(0, oy) + "px";
  }

  window.Shell = { fit: fit };

  window.addEventListener("resize", fit);
  document.addEventListener("DOMContentLoaded", fit);
  window.addEventListener("load", fit);
})();
