# 设计：新能源产业 LED 大屏交互页面

## Context

源 PPT（`C:\Users\xxlge\Downloads\新版-新能源产业介绍 - 副本.pptx`）共 3 页，画布 51198463×13088938 EMU ≈ 7040×1800（比例 3.91:1，与 LED 屏完全一致）。内含 79 张图片 + 15 段视频（约 850MB）。经 XML 解析已建立完整的「内容 ↔ 素材文件」映射（见下方映射表）。PPT 背景图带有画死的卡片框，不能直接用作整页背景；产品图为透明底抠图，可直接复用。

运行环境：LED 大屏播放端浏览器，7040×1800 原生分辨率，红外触屏操作；开发调试在普通显示器。

## Goals / Non-Goals

**Goals:**

- 单页静态应用，无构建、无运行时第三方库，拷贝目录即可部署
- 7040×1800 固定画布任意视口等比缩放
- 三个面板交互完全解耦（独立的 DOM 子树与状态）
- 所有内容数据驱动，素材路径可配置，支持无侵入替换
- 视频槽位统一降级策略（失败显示封面图）

**Non-Goals:**

- 不做内容管理后台；素材替换 = 换文件 + 改 data.js 路径
- 不做视频转码流水线（如 .mov 不被播放端支持，届时手动转码一次，页面无感知）
- 不做多语言切换、不做自动轮播、不还原 PPT 底部导航条（产业介绍/研发创新等标签属于 PPT 其他章节，与本页无关）

## Decisions

### D1 技术形态：纯静态 + 原生 JS + 普通脚本（非 ES Module）

备选：Vue/React + 构建（被否——现场部署与后续维护成本高）；ES Modules（被否——`file://` 双击打开会被 CORS 拦截，现场可能出现无服务器直接开文件的情况）。

→ 采用普通 `<script>` 顺序加载：`js/data.js`（定义全局 `DATA` 对象）→ `js/gestures.js` → `js/panels/*.js` → `js/main.js`。日常开发用 `python -m http.server` 或任意静态服务器；同时保证双击 `index.html` 也能完整运行（视频经 `file://` 在 Edge/Chrome 可播放）。

### D2 画布缩放：固定 7040×1800 + transform scale

`#stage` 固定 7040×1800 px，`resize` 时计算 `scale = min(vw/7040, vh/1800)`，`transform: scale(s)` + 居中（负 margin 或 translate），`body` 黑底。所有面板内部布局用固定像素值，不做响应式。

### D3 手势：统一 Pointer Events 自实现

备选：CSS overflow 滚动（被否——无法与详情转场、子屏吸附统一，且红外框滚动体验差）；Swiper 等库（被否——引入依赖且定制转场受限）。

→ 自实现轻量手势模块（`gestures.js`）：`pointerdown/move/up` 跟踪单主指针（忽略多点），提供三种消费模式：

- **行内横滑**（左屏每行）：拖拽跟手 + `requestAnimationFrame` 惯性衰减 + 两端 rubber-band 回弹；鼠标滚轮在行上映射为横向滚动
- **子屏切换**（中屏）：拖拽跟手平移 track，松手按位移阈值（>15% 宽）+ 速度阈值吸附到相邻子屏，边界回弹
- **点击**：位移 < 8px 且时长 < 400ms 判定为 tap，交由卡片自身的 click 处理；拖拽期间抑制误触点击

`touch-action: none` + 禁用用户选择/图片拖拽，防止红外触屏触发页面默认行为。

### D4 面板结构：左 2080 / 中 2700 / 右 2260

画布 7040，减去外边距（约 60px）与面板间距（约 40px×2）后按内容需要分配：左屏 2080（产品卡 ~470px 宽 ×4 可见）、中屏 2700（视频 16:9 区域最大化）、右屏 2260（九宫格卡 ~700×360）。实现时微调，保持三面板视觉均衡。

每个面板为独立子树：`#panel-left` / `#panel-center` / `#panel-right`，各自维护状态（左屏 `mode: grid|detail`、中屏 `page: 0|1|2`、右屏 `mode: grid|player`），互不引用对方 DOM。

### D5 左屏详情转场：双层视图 + 状态机

左屏内部两层：`grid-layer`（型谱）与 `detail-layer`（详情卡），绝对定位叠放。

- 打开：grid 层各卡片按序加 `.dissolve-out`（错落 `transition-delay`，透明 + 缩放 + 轻微位移），约 500ms 后隐藏 grid 层；detail 层以放大 + 淡入 + 边框流光动画进场，内容按 `DATA.products[id].detail` 渲染
- 关闭：反向动画回到 grid 层；grid 层 DOM 不重建，行滚动位置自然保留
- 状态机：`grid → opening → detail → closing → grid`，动画期间忽略重复触发

### D6 中屏子屏切换：translateX track + 吸附

3 个子屏横向排列在 track 上，`translateX(-page*2700px)`。拖拽跟手（阻力系数 1，边界 0.35），松手吸附。指示器为底部 3 个圆点/胶囊。

### D7 视频策略：muted + autoplay + loop + playsinline；分级预加载

- **内嵌循环视频**（孪生工厂 1 个、技术卡 8 个）：进入所在子屏时才创建/播放，离开时暂停——中屏 3 个子屏同时最多 9 路视频解码，常驻会拖慢低端播放机
- **场景放大播放**（9 个视频约 500MB）：`preload="none"`，点击时才加载；卡片封面用视频首帧截图生成的 jpg（抽取脚本用 OpenCV/图像库截帧；若环境无法截帧，退化为 PPT 里该卡的静态图 image11/image12/首帧人工截图）
- 全部 `muted`（浏览器自动播放限制 + 大屏讲解场景不需要外放）；`error` 事件统一降级为封面图并记录 console.warn

### D8 数据结构：js/data.js 单一全局 DATA

```js
window.DATA = {
  products: {
    categories: [
      { key: 'ev',  label: '纯电', en: 'EV Products',            icon: '...', products: [ { id, name, img, detail: { img, specs: [{k,v}...], features } }, ... 12 ] },
      { key: 'ep',  label: '拖电', en: 'EP Products',            products: [ ... 7 ] },
      { key: 'hev', label: '混动', en: 'HEV Products',          products: [ ... 2 ] },
      { key: 'bat', label: '补能', en: 'Energy Refueling Products', products: [ ... 4 ] },
    ]
  },
  manufacturing: {
    metrics: [ { value: '1', unit: '', label: '领航专线', en: 'Specialized Line', icon }, { value: '5', label: '智能混线', en: 'M&P Line' }, { value: '10000', unit: '+', label: '制造产能', en: 'Production capacity' } ],
    twin: { title: '数字孪生工厂', en: 'Digital Twin Factory', video: 'assets/videos/twin.mp4', placeholder: true },
    techs: [ { name: '智能拼焊技术', en: '...', video: '...', placeholder: false }, ... 8 ],
    components: { selfCount: 8, exclusiveCount: 3, items: [ { name: '动力电池', img: '...' }, ... 8 ] },
  },
  scenarios: [ { name: '市政建设', type: 'video', src: '...', poster: '...', placeholder: false }, ... 9 ],
};
```

### D9 视觉：CSS 重绘边框 + 背景干净区裁剪

- 背景：从 PPT 背景（image2.jpeg，2000×512）中央干净区（无框区域，含暗角渐变与透视网格）裁剪放大为 `assets/images/bg.jpg`，铺满 `#stage`，其上叠加 CSS 渐变保证暗部纯净
- 卡片框：CSS `linear-gradient` 描边 + `clip-path` 切角 + 半透明蓝填充 + `box-shadow` 内外发光；标题条复用同语言（左侧角标 + 中文粗体 + 英文小字 + 右侧装饰斜线）
- 字体：系统栈 `"Microsoft YaHei", "Source Han Sans SC", sans-serif`（LED 播放端为 Windows，雅黑可用）；数字指标用 `Arial Black / Impact` 类粗窄体拉大字号
- 主色参考：背景深蓝 `#051028~#0a1e42`，描边/发光青蓝 `#0af / #00d0ff`，标题白 `#eaf6ff`，辅助文字 `#8fb8d8`

### D10 素材抽取脚本：tools/extract-ppt-assets.py

一次性脚本（可重复运行，幂等覆盖）：解压 PPTX zip → 按 D11 映射表复制/重命名媒体到 `assets/` → 生成 `js/data.js`（含全部产品详情文案与规格键值，从 slide3 XML 的 25 个隐藏详情组解析：每组 = 标题 + 规格标签序列 + 规格值序列 + 产品特点全文）。脚本仅依赖 Python 标准库；PPTX 源路径作为命令行参数。

## D11 素材映射表（抽取的唯一依据）

### 产品（25 款，grid = 型谱卡图，detail = 详情卡图，单位 `unpacked/ppt/media/`）

| 分类 | 型号 | grid | detail | 备注 |
|---|---|---|---|---|
| 纯电 | XE19EV | image30.png | image55.png | |
| 纯电 | XE27CREV | image31.png | image56.png | |
| 纯电 | XE60EV | image32.png | image57.png | |
| 纯电 | XE135CREV | image33.png | image58.png | |
| 纯电 | XE215EV | image34.png | image59.png | |
| 纯电 | XE270EV | image35.png | image60.png | |
| 纯电 | XE380EV | image36.png | image61.png | |
| 纯电 | XE700EV | image37.png | image62.png | |
| 纯电 | XE160WEV | image38.png | image63.png | |
| 纯电 | XE300GMEV | image39.png | image64.png | |
| 纯电 | XE500WMEV | image40.png | image65.png | |
| 纯电 | XE800WMEV | image41.png | image66.png | |
| 拖电 | XE95EP | image42.png | image67.png | |
| 拖电 | XE215EP | image43.png | image68.png | |
| 拖电 | XE270EP | image44.png | image69.png | |
| 拖电 | XE380EP | image45.png | image70.png | |
| 拖电 | XE600EP | image46.png | image71.png | PPT 内与 XE650EP 同图 |
| 拖电 | XE650EP | image46.png | image71.png | 同上，后续用户替换 |
| 拖电 | XE870EP | image47.png | image72.png | |
| 混动 | XE650GK HEV | image48.png | image73.png | |
| 混动 | XE750GK HEV | image49.png | image74.png | |
| 补能 | 充电宝 | image50.png | （无 → 复用 grid 图） | |
| 补能 | 充电桩 | image51.png | image75.png | |
| 补能 | 移动补能车 | image52.png | image77.png | |
| 补能 | 移动电缆车 | image53.png | image78.png | |

详情文案来源：slide3.xml 中 25 个隐藏「产品介绍」组（组名如 `XE19EV-PIC`），每组含型号标题、产品特点全文、规格标签序列（如 充电时间/续航时间/电机功率/电池容量）与对应值序列（1h / 4~6h / 10kW / 27kWh）。脚本按标签-值顺序配对生成 specs 数组。

### 中屏

| 内容 | 素材 | 备注 |
|---|---|---|
| 指标卡（1 领航专线 / 5 智能混线 / 10000+ 制造产能） | 纯文字+CSS 图标复用 | 文案取自 slide2.xml |
| 数字孪生工厂视频区 | **占位 = media3.mov**（工厂场景）→ `assets/videos/twin.mp4` | `placeholder: true`，PPT 内该区仅有静态图 image13.png（作为封面 poster） |
| 技术卡 ×8 | 智能拼焊技术=media11.mp4, 精密加工技术=media14.mp4, 智慧物流技术=media10.mp4, 预测性维护技术=media9.mp4, 集成供应链计划=media13.mp4, 制造运营数字化=media12.mp4, 工艺智能体=media15.mp4, 焊缝AI在线检测=media8.mp4 | 排布 4 列×2 行按此顺序 |
| 核心部件 ×8 | 动力电池=image24.png, 电机=image25.png, 多合一控制器=image26.png, 电池管理系统=image23.png, 回转体=image14.png, 高速电机泵=image28.png, 分布式主阀=image27.png, 储能柜=image29.png | 8 类自研 / 3 类独有 文案取自 slide2.xml |

### 右屏场景（9 个）

| 场景 | 素材 | 备注 |
|---|---|---|
| 市政建设 | media1.mp4 | |
| 房建园区 | media2.mp4 | |
| 工厂施工 | media3.mov | |
| 港口物流 | media4.mp4 | |
| 水利工程 | **占位 = media4.mp4** | PPT 内仅 image12.png（用作 poster），`placeholder: true` 待替换 |
| 道路桥梁 | media7.mp4 | |
| 隧道施工 | **占位 = media5.mp4** | PPT 内仅 image11.png（用作 poster），`placeholder: true` 待替换 |
| 矿山开采 | media5.mp4 | |
| 农业林业 | media6.mp4 | |

### 背景/装饰

| 用途 | 素材 |
|---|---|
| 页面背景 | image2.jpeg 中央干净区裁剪 → `assets/images/bg.jpg` |
| 详情卡底图光效 | image54.png（详情组内复用的光效底图）→ `assets/images/detail-glow.png` |

### 命名规则

抽取时按语义重命名：`assets/images/products/{id}-grid.png`、`{id}-detail.png`；`assets/images/components/{name}.png`；`assets/videos/tech/{n}-{slug}.mp4`、`assets/videos/scenario/{name}.{mp4|mov}`、`assets/videos/twin.mp4`。data.js 中路径与之对应。

## Risks / Trade-offs

- **[.mov 容器兼容性]** media3.mov（144MB）若播放端解码失败 → 统一 `error` 降级为 poster；届时手动转码 mp4 替换同名路径即可，页面零改动
- **[体量与首屏]** 视频合计 ~850MB → 内嵌视频仅进对应子屏才加载，场景视频 `preload=none` 点击加载；图片单张最大 2.4MB 可接受
- **[8~9 路并发解码]** 中屏子屏切换瞬时切两批视频 → 离开子屏即 pause 并保留进度，低端机如卡顿可降为「仅当前可视 4 张播放」
- **[红外触屏多点抖动]** 只跟踪第一个 pointerId，其余忽略；tap 阈值过滤抖动
- **[file:// 下自动播放]** muted 视频 file:// 可自动播放；若现场策略收紧，回退方案是本地静态服务器开机自启
- **[字体渲染差异]** LED 发光字在雅黑下笔画偏细 → 大标题可用 `-webkit-text-stroke` 或局部加粗补偿，实现时目测调整

## Migration Plan

绿地项目无迁移。部署：仓库目录整体拷贝至播放端 → 全屏浏览器（kiosk 模式，F11 或 `--kiosk`）打开 `index.html`。回滚 = 关闭页面。

## Open Questions

（无阻塞项。素材正式版替换、XE600EP/XE650EP 独立照片、孪生工厂正式视频均为用户后续动作，数据与路径已预留。）
