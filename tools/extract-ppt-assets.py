# -*- coding: utf-8 -*-
"""
extract-ppt-assets.py — 从源 PPT 抽取 LED 大屏页面所需的全部素材与数据。

用法:
    py tools/extract-ppt-assets.py [--pptx PATH] [--out DIR]
        [--skip-videos] [--skip-images] [--skip-data]

产出:
    assets/images/...   产品图/部件图/背景/装饰
    assets/videos/...   场景视频/技术视频/孪生占位视频
    js/data.js          window.DATA 全量数据（页面唯一数据源）

素材映射依据: openspec/changes/led-bigscreen-page/design.md D11 映射表。
仅依赖 Python 标准库; Pillow 用于背景裁剪合成（缺失时跳过）; imageio-ffmpeg 用于视频压缩
（缺失时视频保持原始格式, GitHub 托管需执行 tools/compress-videos.py 手动压缩）。
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from xml.etree import ElementTree as ET

DEFAULT_PPTX = r"C:\Users\xxlge\Downloads\新版-新能源产业介绍 - 副本.pptx"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
# slide 画布 EMU 尺寸
EMU_CX, EMU_CY = 51198463, 13088938

# ---------------------------------------------------------------- 映射表 ----

# 25 款产品: (分类key, 型号, grid 图, detail 图; detail=None 表示复用 grid)
PRODUCTS = [
    ("ev",  "XE19EV",      "image30.png", "image55.png"),
    ("ev",  "XE27CREV",    "image31.png", "image56.png"),
    ("ev",  "XE60EV",      "image32.png", "image57.png"),
    ("ev",  "XE135CREV",   "image33.png", "image58.png"),
    ("ev",  "XE215EV",     "image34.png", "image59.png"),
    ("ev",  "XE270EV",     "image35.png", "image60.png"),
    ("ev",  "XE380EV",     "image36.png", "image61.png"),
    ("ev",  "XE700EV",     "image37.png", "image62.png"),
    ("ev",  "XE160WEV",    "image38.png", "image63.png"),
    ("ev",  "XE300GMEV",   "image39.png", "image64.png"),
    ("ev",  "XE500WMEV",   "image40.png", "image65.png"),
    ("ev",  "XE800WMEV",   "image41.png", "image66.png"),
    ("ep",  "XE95EP",      "image42.png", "image67.png"),
    ("ep",  "XE215EP",     "image43.png", "image68.png"),
    ("ep",  "XE270EP",     "image44.png", "image69.png"),
    ("ep",  "XE380EP",     "image45.png", "image70.png"),
    ("ep",  "XE600EP",     "image46.png", "image71.png"),
    ("ep",  "XE650EP",     "image46.png", "image71.png"),
    ("ep",  "XE870EP",     "image47.png", "image72.png"),
    ("hev", "XE650GK HEV", "image48.png", "image73.png"),
    ("hev", "XE750GK HEV", "image49.png", "image74.png"),
    ("bat", "充电宝",       "image50.png", None),
    ("bat", "充电桩",       "image51.png", "image75.png"),
    ("bat", "移动补能车",    "image52.png", "image77.png"),
    ("bat", "移动电缆车",    "image53.png", "image78.png"),
]
SLUGS = {
    "XE19EV": "xe19ev", "XE27CREV": "xe27crev", "XE60EV": "xe60ev",
    "XE135CREV": "xe135crev", "XE215EV": "xe215ev", "XE270EV": "xe270ev",
    "XE380EV": "xe380ev", "XE700EV": "xe700ev", "XE160WEV": "xe160wev",
    "XE300GMEV": "xe300gmev", "XE500WMEV": "xe500wmev", "XE800WMEV": "xe800wmev",
    "XE95EP": "xe95ep", "XE215EP": "xe215ep", "XE270EP": "xe270ep",
    "XE380EP": "xe380ep", "XE600EP": "xe600ep", "XE650EP": "xe650ep",
    "XE870EP": "xe870ep", "XE650GK HEV": "xe650gkhev", "XE750GK HEV": "xe750gkhev",
    "充电宝": "chongdianbao", "充电桩": "chongdianzhuang",
    "移动补能车": "yidongbunengche", "移动电缆车": "yidongdianlanche",
}

CATEGORY_LABELS = {
    "ev":  {"label": "纯电", "en": "EV Products", "icon": "bolt"},
    "ep":  {"label": "拖电", "en": "EP Products", "icon": "cable"},
    "hev": {"label": "混动", "en": "HEV Products", "icon": "hybrid"},
    "bat": {"label": "补能", "en": "Energy Refueling Products", "icon": "battery"},
}

# 中屏技术卡 ×8（名称 -> 视频文件, 顺序即 4×2 排布顺序）
TECHS = [
    ("智能拼焊技术",   "media11.mp4", "welding"),
    ("精密加工技术",   "media14.mp4", "machining"),
    ("智慧物流技术",   "media10.mp4", "logistics"),
    ("预测性维护技术", "media9.mp4",  "predictive"),
    ("集成供应链计划", "media13.mp4", "supply-chain"),
    ("制造运营数字化", "media12.mp4", "mom"),
    ("工艺智能体",     "media15.mp4", "process-ai"),
    ("焊缝AI在线检测", "media8.mp4",  "weld-ai"),
]

# 中屏核心部件 ×8（名称 -> 部件图）
COMPONENTS = [
    ("动力电池",     "image24.png", "battery"),
    ("电机",         "image25.png", "motor"),
    ("多合一控制器", "image26.png", "controller"),
    ("电池管理系统", "image23.png", "bms"),
    ("回转体",       "image14.png", "slewing"),
    ("高速电机泵",   "image28.png", "motor-pump"),
    ("分布式主阀",   "image27.png", "main-valve"),
    ("储能柜",       "image29.png", "storage"),
]

# 右屏场景 ×9（名称, 媒体, 类型, poster 静态图, 占位标记）
SCENARIOS = [
    ("市政建设", "media1.mp4", "video", None,          False),
    ("房建园区", "media2.mp4", "video", None,          False),
    ("工厂施工", "media3.mov", "video", None,          False),
    ("港口物流", "media4.mp4", "video", None,          False),
    ("水利工程", "media4.mp4", "video", "image12.png", True),   # 占位: PPT 内仅有静态图
    ("道路桥梁", "media7.mp4", "video", None,          False),
    ("隧道施工", "media5.mp4", "video", "image11.png", True),   # 占位: PPT 内仅有静态图
    ("矿山开采", "media5.mp4", "video", None,          False),
    ("农业林业", "media6.mp4", "video", None,          False),
]
SCENARIO_SLUGS = ["municipal", "park", "factory", "port", "water",
                  "road", "tunnel", "mining", "agriculture"]

META = {
    "left":   {"title": "全场景全工况产品型谱", "en": "Full-scenario & Full-condition Product Spectrum"},
    "middle": {"title": "精益制造运营能力", "en": "Lean Intelligent Manufacturing Operation Capability"},
    "right":  {"title": "多工况解决方案", "en": "Multi-Scenario & Multi-Working Condition Solution"},
    "twin":   {"title": "数字孪生工厂", "en": "Digital Twin Factory"},
    "tech":   {"title": "数智化制造与运营管理技术", "en": "Smart M&O Technology"},
    "parts":  {"title": "自主可控核心部件", "en": "Independent-developed Components"},
}

# ------------------------------------------------------------ XML 解析 ----

def xfrm_of(spPr):
    x = spPr.find("a:xfrm", NS) if spPr is not None else None
    if x is None:
        return None
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    cho, che = x.find("a:chOff", NS), x.find("a:chExt", NS)
    if off is None or ext is None:
        return None
    w, h = int(ext.get("cx")), int(ext.get("cy"))
    return {
        "x": int(off.get("x")), "y": int(off.get("y")), "w": w, "h": h,
        "chx": int(cho.get("x")) if cho is not None else 0,
        "chy": int(cho.get("y")) if cho is not None else 0,
        "chw": max(int(che.get("cx")) if che is not None else w, 1),
        "chh": max(int(che.get("cy")) if che is not None else h, 1),
    }


def collect_texts(grp, sx=1.0, sy=1.0, dx=0.0, dy=0.0, out=None):
    """遍历一个 grpSp 子树, 收结 (text, x, y) 像素坐标列表"""
    if out is None:
        out = []
    for c in grp:
        tag = c.tag.split("}")[-1]
        if tag == "grpSp":
            xf = xfrm_of(c.find("p:grpSpPr", NS))
            if xf:
                nsx = sx * xf["w"] / xf["chw"]
                nsy = sy * xf["h"] / xf["chh"]
                ndx = dx + (xf["x"] - xf["chx"] * nsx / max(sx, 1e-12)) * sx
                ndy = dy + (xf["y"] - xf["chy"] * nsy / max(sy, 1e-12)) * sy
                collect_texts(c, nsx, nsy, ndx, ndy, out)
            else:
                collect_texts(c, sx, sy, dx, dy, out)
        elif tag == "sp":
            txt = "".join(t.text or "" for t in c.findall(".//a:t", NS)).strip()
            xf = xfrm_of(c.find("p:spPr", NS))
            if txt and xf:
                ax = (xf["x"] * sx + dx) / EMU_CX * 7040
                ay = (xf["y"] * sy + dy) / EMU_CY * 1800
                out.append({"t": txt, "x": round(ax), "y": round(ay)})
    return out


def norm_title(t):
    return t.replace(" ", "").upper()


def dedupe_repeat(t):
    """PPT 中特点文案普遍整段重复两遍 (含前缀产品特点：时为 P+A+A), 精确去重并统一剥离前缀"""
    m = re.match(r"^产品特点[:：]\s*", t)
    body = t[m.end():] if m else t
    half = len(body) // 2
    if len(body) % 2 == 0 and body[half:] == body[:half]:
        body = body[:half]
    return body


def cluster_rows(items, tol=20):
    """按 y 聚类成行, 行内按 x 排序"""
    items = sorted(items, key=lambda i: (i["y"], i["x"]))
    rows = []
    for it in items:
        if rows and abs(it["y"] - rows[-1][0]["y"]) <= tol:
            rows[-1].append(it)
        else:
            rows.append([it])
    for r in rows:
        r.sort(key=lambda i: i["x"])
    return rows


def merge_cells(row, gap=100):
    """一行内相邻文本按 x 间距合并为单元格 (PPT 同一单元格常拆成多段 run, 如 1.9 + - + 6T)"""
    cells, cur, prev = [], [], None
    for it in row:
        if prev is not None and it["x"] - prev <= gap:
            cur.append(it["t"])
        else:
            if cur:
                cells.append("".join(cur))
            cur = [it["t"]]
        prev = it["x"]
    if cur:
        cells.append("".join(cur))
    return cells


def parse_spec_table(items):
    """解析规格区文本。两种布局:
    A. 两行键值表 (上=标签行, 下=值行)   -> {specs: [{k,v}...]}
    B. 网格表 (首行=表头, 如充电宝 5列×4行 机型对比 / XE380EP 上下结构) -> {table: {head, rows}}
    其余 -> {specs: []}"""
    if not items:
        return {}
    rows = [merge_cells(r) for r in cluster_rows(items)]
    if len(rows) == 2 and len(rows[0]) == len(rows[1]) and len(rows[0]) >= 2:
        return {"specs": [{"k": a, "v": b} for a, b in zip(*rows)]}
    if len(rows) >= 3 and len({len(r) for r in rows}) == 1 and len(rows[0]) >= 3:
        return {"table": {"head": rows[0], "rows": rows[1:]}}
    return {"specs": [{"k": "", "v": t} for r in rows for t in r]}


def parse_details(zf):
    """解析 slide3 的隐藏详情组 -> {归一化型号: {features, specs}}"""
    details = {}
    root = ET.fromstring(zf.read("ppt/slides/slide3.xml"))
    tree = root.find("p:cSld/p:spTree", NS)
    for child in tree:
        if child.tag.split("}")[-1] != "grpSp":
            continue
        items = collect_texts(child)
        if not items:
            continue
        title = items[0]["t"]
        features = None
        rest = []
        for it in items[1:]:
            t = it["t"]
            if t.startswith("产品特点"):
                features = dedupe_repeat(t)
            elif t != "产品介绍":
                rest.append(it)
        details[norm_title(title)] = {"features": features,
                                      **parse_spec_table(rest)}
    return details


# ------------------------------------------------------------ 素材拷贝 ----

def copy_media(zf, media_name, dest):
    with zf.open("ppt/media/" + media_name.split("/")[-1]) as f, open(dest, "wb") as g:
        shutil.copyfileobj(f, g)


def make_background(zf, work, out):
    """从 image2.jpeg 干净区合成 7040×1800 背景 + 顶部装饰条"""
    try:
        from PIL import Image
    except ImportError:
        print("[WARN] 未安装 Pillow (py -m pip install pillow), 跳过背景合成, 页面将使用纯 CSS 渐变背景")
        return
    src = os.path.join(work, "image2.jpeg")
    with zf.open("ppt/media/image2.jpeg") as f, open(src, "wb") as g:
        shutil.copyfileobj(f, g)
    im = Image.open(src).convert("RGB")

    def mirror_tile(crop, width):
        w, h = crop.size
        tiles, x = [], 0
        while x < width:
            tiles.append(crop.transpose(Image.FLIP_LEFT_RIGHT) if len(tiles) % 2 else crop)
            x += w
        canvas = Image.new("RGB", (x, h))
        for i, t in enumerate(tiles):
            canvas.paste(t, (i * w, 0))
        return canvas.resize((width, round(h * width / x)))

    grid_band = mirror_tile(im.crop((2320, 700, 4672, 1650)), 7040)   # 透视网格带
    dark_band = mirror_tile(im.crop((2320, 700, 4672, 1140)), 7040)   # 纯暗部渐变带
    dark_band = dark_band.resize((7040, 1800 - grid_band.height))
    bg = Image.new("RGB", (7040, 1800))
    bg.paste(dark_band, (0, 0))
    bg.paste(grid_band, (0, 1800 - grid_band.height))
    bg.save(os.path.join(out, "assets/images/bg.jpg"), quality=88)
    im.crop((0, 0, 7040, 210)).save(os.path.join(out, "assets/images/top-deco.jpg"), quality=88)
    copy_media(zf, "image13.png", os.path.join(out, "assets/images/twin-poster.png"))
    os.remove(src)


def extract_assets(pptx, out, skip_videos, skip_images):
    work = tempfile.mkdtemp(prefix="xcmg-ppt-")
    images_dir = os.path.join(out, "assets/images")
    products_dir = os.path.join(images_dir, "products")
    comp_dir = os.path.join(images_dir, "components")
    scen_img_dir = os.path.join(images_dir, "scenario")
    scen_vid_dir = os.path.join(out, "assets/videos/scenario")
    tech_vid_dir = os.path.join(out, "assets/videos/tech")
    for d in (products_dir, comp_dir, scen_img_dir, scen_vid_dir, tech_vid_dir):
        os.makedirs(d, exist_ok=True)

    with zipfile.ZipFile(pptx) as zf:
        for cat, model, grid, detail in PRODUCTS:      # 产品图
            slug = SLUGS[model]
            copy_media(zf, grid, os.path.join(products_dir, f"{slug}-grid.png"))
            if not skip_images:
                if detail:
                    copy_media(zf, detail, os.path.join(products_dir, f"{slug}-detail.png"))
                else:
                    shutil.copyfile(os.path.join(products_dir, f"{slug}-grid.png"),
                                    os.path.join(products_dir, f"{slug}-detail.png"))
        if not skip_images:
            for name, img, slug in COMPONENTS:         # 部件图
                copy_media(zf, img, os.path.join(comp_dir, f"{slug}.png"))
            copy_media(zf, "image11.png", os.path.join(scen_img_dir, "tunnel.png"))
            copy_media(zf, "image12.png", os.path.join(scen_img_dir, "water.png"))
            copy_media(zf, "image54.png", os.path.join(images_dir, "detail-glow.png"))
            make_background(zf, work, out)
        if not skip_videos:                            # 视频 (原始拷贝, 压缩见下)
            for (_, media, _, _, _), slug in zip(SCENARIOS, SCENARIO_SLUGS):
                copy_media(zf, media, os.path.join(scen_vid_dir, f"{slug}.{media.rsplit('.',1)[-1]}"))
            for name, media, slug in TECHS:
                copy_media(zf, media, os.path.join(tech_vid_dir, f"{slug}.{media.rsplit('.',1)[-1]}"))
            copy_media(zf, "media3.mov", os.path.join(out, "assets/videos/twin.mov"))  # 孪生占位
        if not skip_videos:
            compress_videos(out)
    shutil.rmtree(work, ignore_errors=True)


def compress_videos(out):
    """抽取后转码压缩 (统一 mp4 / 低于 GitHub 100MB 限), 需 imageio-ffmpeg"""
    try:
        import imageio_ffmpeg  # noqa: F401
    except ImportError:
        print("[WARN] 未安装 imageio-ffmpeg, 视频保持原始格式; 建议执行: py -m pip install imageio-ffmpeg 后重跑 --skip-images --skip-data")
        return
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "compress-videos.py")
    subprocess.run([sys.executable, script], cwd=out)


# ------------------------------------------------------------ 数据生成 ----

def build_data(details):
    products = []
    for cat, model, _, _ in PRODUCTS:
        slug = SLUGS[model]
        d = details.get(norm_title(model)) or {}
        products.append({
            "id": slug, "cat": cat, "name": model,
            "img": f"assets/images/products/{slug}-grid.png",
            "detail": {
                "img": f"assets/images/products/{slug}-detail.png",
                "specs": d.get("specs") or [],
                "table": d.get("table") or None,
                "features": d.get("features") or "",
            },
        })

    # 视频路径统一指向 .mp4 (extract 后由 tools/compress-videos.py 转码, 保持容器与扩展名一致)
    scenarios = []
    for (name, media, typ, poster, ph), slug in zip(SCENARIOS, SCENARIO_SLUGS):
        scenarios.append({
            "id": slug, "name": name, "type": typ,
            "src": f"assets/videos/scenario/{slug}.mp4" if typ == "video" else None,
            "poster": f"assets/images/scenario/{slug}.png" if poster else None,
            "placeholder": ph,
        })

    techs = [{"id": slug, "name": name,
              "video": f"assets/videos/tech/{slug}.mp4"}
             for name, media, slug in TECHS]

    comps = [{"id": slug, "name": name, "img": f"assets/images/components/{slug}.png"}
             for name, _, slug in COMPONENTS]

    return {
        "meta": META,
        "products": {"categories": [
            {"key": k, **CATEGORY_LABELS[k],
             "products": [p for p in products if p["cat"] == k]}
            for k in ("ev", "ep", "hev", "bat")
        ]},
        "manufacturing": {
            "metrics": [
                {"value": "1", "suffix": "", "label": "领航专线", "en": "Specialized Line", "icon": "gauge"},
                {"value": "5", "suffix": "", "label": "智能混线", "en": "M&P Line", "icon": "bulb"},
                {"value": "10000", "suffix": "+", "label": "制造产能", "en": "Production capacity", "icon": "gears"},
            ],
            "twin": {"video": "assets/videos/twin.mp4",
                     "poster": "assets/images/twin-poster.png", "placeholder": True},
            "techs": techs,
            "components": {"selfCount": 8, "exclusiveCount": 3, "items": comps},
        },
        "scenarios": scenarios,
    }


def load_overrides(out):
    """手工精修数据 (复杂换行表格的几何解析不可靠, 用覆盖文件修正)"""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data-overrides.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def apply_overrides(data, overrides):
    for prod_override in overrides.get("products", []):
        for cat in data["products"]["categories"]:
            for p in cat["products"]:
                if p["id"] == prod_override["id"]:
                    p["detail"].update(prod_override.get("detail", {}))


def write_data_js(data, out):
    os.makedirs(os.path.join(out, "js"), exist_ok=True)
    js = ("// 由 tools/extract-ppt-assets.py 自动生成, 可手工微调;\n"
          "// 素材替换保持路径指向 assets/ 即可, placeholder:true 表示占位素材待正式替换。\n"
          "window.DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")
    with open(os.path.join(out, "js/data.js"), "w", encoding="utf-8") as f:
        f.write(js)


# ---------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pptx", default=DEFAULT_PPTX)
    ap.add_argument("--out", default=REPO)
    ap.add_argument("--skip-videos", action="store_true", help="不拷贝视频(调试用)")
    ap.add_argument("--skip-images", action="store_true", help="不拷贝图片/背景(调试用)")
    ap.add_argument("--skip-data", action="store_true", help="不生成 data.js")
    args = ap.parse_args()

    with zipfile.ZipFile(args.pptx) as zf:
        details = {} if args.skip_data else parse_details(zf)
        if not (args.skip_videos and args.skip_images):
            extract_assets(args.pptx, args.out, args.skip_videos, args.skip_images)

    if not args.skip_data:
        data = build_data(details)
        apply_overrides(data, load_overrides(args.out))
        write_data_js(data, args.out)
        ok = sum(1 for c in data["products"]["categories"]
                 for p in c["products"] if p["detail"]["specs"] or p["detail"]["table"])
        fea = sum(1 for c in data["products"]["categories"]
                  for p in c["products"] if p["detail"]["features"])
        print(f"[data] 详情组 {len(details)} 组; 有规格数据的产品 {ok}/25; 有特点文案的产品 {fea}/25")
        # 全量打印供人工抽查
        for c in data["products"]["categories"]:
            for p in c["products"]:
                d = p["detail"]
                if d["table"]:
                    t = d["table"]
                    print(f"  [{p['name']}] TABLE head={t['head']}")
                    for r in t["rows"]:
                        print(f"      row={r}")
                else:
                    print(f"  [{p['name']}] specs={[(s['k'], s['v']) for s in d['specs']]}")
    print("[done] 素材与数据已输出到", args.out)


if __name__ == "__main__":
    main()
