# xcmg-new-energy-html

徐工新能源 · LED 大屏交互页面（7040×1800）

> 当前是 public，需要后续改成 private

## 项目简介

7040×1800（比例 3.91:1）LED 大屏单页应用，整合新能源产业介绍的全部内容：

- **左屏 · 产品型谱**：25 款产品四分类行横滑浏览，点击满屏弹出产品详情卡（转场动画，可关闭）
- **中屏 · 精益制造**：三子屏横滑切换——核心指标卡 + 数字孪生视频 / 8 项数智化技术视频墙 / 自主可控核心部件
- **右屏 · 场景解决方案**：9 工况场景九宫格，点击后在屏内放大播放视频

纯静态实现：无构建、无第三方运行时依赖，双击或任意静态服务器均可运行。

## 快速开始

```bash
# 方式一: 本地服务器 (推荐, 禁缓存热更新)
py tools/serve.py 8765        # 或 python -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765

# 方式二: 直接双击 index.html (file:// 协议同样可用)
```

页面按 7040×1800 固定画布设计，任意窗口尺寸等比缩放显示；LED 控制端浏览器全屏（F11 或 `--kiosk`）时 1:1 像素呈现。

## 目录结构

```
index.html            页面骨架 (三面板)
css/style.css         全部样式 (暗蓝科技风, CSS 绘制边框)
js/data.js            全部内容数据 (由抽取脚本生成, 可手工微调)
js/gestures.js        统一指针手势 (触屏滑动+惯性+回弹, 兼容鼠标)
js/shell.js           画布等比缩放
js/left.js|middle.js|right.js   三个面板逻辑
js/main.js            入口 (含视频加载失败降级守卫)
assets/images/        产品图/部件图/背景/装饰 (语义化命名)
assets/videos/        场景视频/技术视频/孪生占位视频 (体积约 1GB, 不进 git)
tools/extract-ppt-assets.py    素材抽取脚本
tools/data-overrides.json      手工精修数据 (复杂表格, 抽取时自动合并)
tools/serve.py        开发用禁缓存静态服务器
```

## 素材再生成 / 替换

全部素材与数据可从源 PPT 一键重建：

```bash
py tools/extract-ppt-assets.py --pptx "PPT路径" [--skip-videos] [--skip-images] [--skip-data]
```

**替换素材的两种方式**（页面代码零改动）：

1. **换文件**：保持 `assets/` 下同名路径直接覆盖（如正式孪生视频替换 `assets/videos/twin.mov`）。
2. **改路径**：编辑 `js/data.js` 中对应条目的 `src`/`img` 路径。

`placeholder: true` 标记的条目（孪生工厂视频、水利工程、隧道施工、XE600EP/XE650EP 同图）为占位素材，待正式素材到位后按上述方式替换。

## 现场部署（LED 播放端）

1. 仓库目录（含 assets/videos）整体拷贝到播放端；
2. Edge/Chrome 打开 `index.html`，全屏（F11 或启动参数 `--kiosk --autoplay-policy=no-user-gesture-required`）；
3. 红外触屏手势（滑动/点击）与鼠标操作等价，开发调试可直接用鼠标。

## 备注

- 视频统一 `muted + loop`：浏览器自动播放策略无碍，符合大屏讲解场景；
- 视频播放失败时自动降级为封面图/占位提示，不阻塞页面；
- `assets/videos/` 约 1GB 不进 git，部署前运行抽取脚本或手动拷贝该目录；
- 触摸手势已通过 PointerEvents 触摸模拟验证，正式红外触屏实机验收待现场进行。
