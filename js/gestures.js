/* ============================================================
   gestures.js — 统一指针手势模块 (红外触屏 + 鼠标)
   单主指针拖拽 + 惯性 + 边界 rubber-band + 拖拽后点击抑制 + 滚轮横滑映射
   ============================================================ */
(function () {
  "use strict";

  var TAP_PX = 8;          // 位移小于该值视为点击
  var RESISTANCE = 0.35;   // 越界阻力系数
  var FRICTION_DECAY = 0.88;
  var STOP_V = 20;         // 惯性停止速度阈值 (px/s)
  var V_MAX = 2600;        // 速度钳制 (px/s), 防采样过密导致速度爆炸
  var SUPPRESS_MS = 140;   // 拖拽后抑制点击的时间窗 (ms)

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  /* 帧调度: 页面可见用 rAF (流畅), 不可见退化为 setTimeout (避免后台标签动画冻结) */
  function nextFrame(cb) {
    if (typeof document !== "undefined" && document.visibilityState === "visible" &&
        typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(cb);
    }
    return setTimeout(cb, 16);
  }
  function cancelFrame(h) {
    if (typeof h === "number") clearTimeout(h);
    else if (window.cancelAnimationFrame) window.cancelAnimationFrame(h);
  }

  /* 拖拽后抑制误触点击: 仅抑制"拖拽元素内部"且发生在拖拽刚结束瞬间的那次点击 */
  var draggers = [];
  document.addEventListener("click", function (e) {
    var now = performance.now();
    for (var i = 0; i < draggers.length; i++) {
      var d = draggers[i];
      if (d._moved && d._dragEndTime != null && now - d._dragEndTime < SUPPRESS_MS &&
          d.el && d.el.contains(e.target)) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }
  }, true);

  function DragAxis(opts) {
    this.render = opts.render;             // (pos) => void
    this.boundsFn = opts.bounds;           // () => {min, max}
    this.resistance = opts.resistance != null ? opts.resistance : RESISTANCE;
    this.inertia = opts.inertia !== false;
    this.onSettle = opts.onSettle || null; // (pos) => void
    this.onRelease = opts.onRelease || null; // (pos, vel) => void 拖拽释放时优先调用
    this.el = opts.el || null;
    this.pos = 0;
    this._raf = null;
    this._vel = 0;
    this._samples = [];
    this._id = null;
    this._moved = false;
    this._dragEndTime = null;
    draggers.push(this);
    var self = this;
    this._moveH = function (e) { self._move(e); };
    this._upH = function (e) { self._up(e); };
    if (this.el) {
      this.el.addEventListener("pointerdown", function (e) { self._down(e); });
      // 鼠标滚轮 -> 横向映射 (悬停在绑定元素上时生效)
      this.el.addEventListener("wheel", function (e) {
        var b = self.boundsFn();
        if (b.min === b.max) return;
        var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!delta) return;
        e.preventDefault();
        self._stopAnim();
        self.seek(self.pos + delta);
      }, { passive: false });
    }
  }

  DragAxis.prototype._down = function (e) {
    if (!e.isPrimary) return;                       // 只跟踪主指针 (红外触屏多点防抖)
    this._stopAnim();
    this._id = e.pointerId;
    this._x0 = e.clientX;
    this._t0 = performance.now();
    this._pos0 = this.pos;
    this._moved = false;
    this._samples = [{ t: this._t0, x: e.clientX }];
    // 注意: 不用 setPointerCapture —— 它会把指针事件(含合成 click)重定向到拖拽元素,
    // 导致子元素的 click 永远不触发。改为 window 级监听。
    window.addEventListener("pointermove", this._moveH);
    window.addEventListener("pointerup", this._upH);
    window.addEventListener("pointercancel", this._upH);
  };

  DragAxis.prototype._move = function (e) {
    if (e.pointerId !== this._id) return;
    var dx = e.clientX - this._x0;
    if (Math.abs(dx) > TAP_PX) this._moved = true;
    var b = this.boundsFn();
    var target = this._pos0 + dx;
    if (target > b.max) target = b.max + (target - b.max) * this.resistance;
    if (target < b.min) target = b.min + (target - b.min) * this.resistance;
    this.pos = target;
    this._renderSafe();
    var now = performance.now();
    this._samples.push({ t: now, x: e.clientX });
    while (this._samples.length > 2 && now - this._samples[0].t > 90) this._samples.shift();
  };

  DragAxis.prototype._up = function (e) {
    if (e.pointerId !== this._id) return;
    window.removeEventListener("pointermove", this._moveH);
    window.removeEventListener("pointerup", this._upH);
    window.removeEventListener("pointercancel", this._upH);
    this._id = null;
    this._dragEndTime = performance.now();
    var v = 0;
    var s = this._samples;
    if (s.length >= 2) {
      var a = s[0], b = s[s.length - 1];
      if (b.t > a.t) v = (b.x - a.x) / (b.t - a.t) * 1000;
    }
    v = clamp(v, -V_MAX, V_MAX);
    this._vel = v;
    if (this.onRelease) { this.onRelease(this.pos, v); return; }   // 分页器: 自行决定吸附目标
    var bd = this.boundsFn();
    if (this.inertia && Math.abs(v) > 240) {
      // 惯性: 按摩擦衰减模拟落点, 越界部分按阻力折算
      var vv = Math.abs(v), dist = 0;
      while (vv > STOP_V) { dist += vv / 60; vv *= FRICTION_DECAY; }
      var target = this.pos + (v > 0 ? 1 : -1) * dist;
      target = clamp(target, bd.min + (bd.min - bd.max) * 0, bd.max + (bd.min - bd.max) * 0);
      if (target > bd.max) target = bd.max + (target - bd.max) * this.resistance;
      if (target < bd.min) target = bd.min + (target - bd.min) * this.resistance;
      this.animateTo(target, 650, true);
    } else if (this.pos > bd.max || this.pos < bd.min) {
      this.animateTo(clamp(this.pos, bd.min, bd.max), 350, false);
    } else if (this.onSettle) {
      this.onSettle(this.pos);
    }
  };

  DragAxis.prototype.seek = function (pos) {
    var b = this.boundsFn();
    this.pos = clamp(pos, b.min, b.max);
    this._renderSafe();
    if (this.onSettle) this.onSettle(this.pos);
  };

  DragAxis.prototype._renderSafe = function () { if (this.render) this.render(this.pos); };

  /* easeOutCubic; withKick=true 时按初速做轻微前冲衔接 */
  DragAxis.prototype.animateTo = function (target, ms, withKick) {
    var self = this;
    this._stopAnim();
    var from = this.pos, t0 = performance.now();
    var kick = withKick ? clamp(this._vel, -6000, 6000) * 0.02 : 0;
    function frame(now) {
      var k = clamp((now - t0) / ms, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      self.pos = from + (target - from) * e + kick * Math.sin(k * Math.PI);
      self._renderSafe();
      if (k < 1) self._raf = nextFrame(frame);
      else { self._vel = 0; if (self.onSettle) self.onSettle(self.pos); }
    }
    this._raf = nextFrame(frame);
  };

  DragAxis.prototype._stopAnim = function () {
    if (this._raf != null) { cancelFrame(this._raf); this._raf = null; }
  };

  DragAxis.prototype.nudge = function (delta) { this.seek(this.pos + delta); };
  DragAxis.prototype.stop = function () { this._stopAnim(); };

  window.Gestures = { DragAxis: DragAxis, TAP_PX: TAP_PX };
})();
