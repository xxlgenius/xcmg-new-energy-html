# -*- coding: utf-8 -*-
"""
compress-videos.py — 转码压缩 assets/videos 下的视频, 使仓库适合 git 托管
(GitHub 单文件上限 100MB; .mov 统一转 .mp4; H.264 CRF24 + AAC 96k, faststart)

依赖: py -m pip install imageio-ffmpeg   (提供免安装 ffmpeg)
用法: py tools/compress-videos.py
"""
import json
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VID = os.path.join(REPO, "assets/videos")
CRF = "24"
ACODEC = ["-c:a", "aac", "-b:a", "96k"]
SIZE_LIMIT = 95 * 1024 * 1024          # GitHub 100MB 硬限, 留余量


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def transcode(src, dst, ff, crf=CRF):
    tmp = dst + ".tmp.mp4"
    cmd = [ff, "-y", "-i", src, "-c:v", "libx264", "-crf", crf, "-preset", "medium",
           "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmp]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FAIL] {src}\n{r.stderr[-600:]}")
        return False
    shutil.move(tmp, dst)
    return True


def main():
    ff = ffmpeg()
    jobs = []           # (src, dst)
    for root, _, files in os.walk(VID):
        for f in files:
            p = os.path.join(root, f)
            ext = f.rsplit(".", 1)[-1].lower()
            dst = p if ext == "mp4" else p.rsplit(".", 1)[0] + ".mp4"
            jobs.append((p, dst))

    total_before = total_after = 0
    for src, dst in jobs:
        before = os.path.getsize(src)
        base = os.path.basename(src)
        crf = CRF
        # 大文件加大压缩力度, 保证低于 GitHub 100MB
        if before > 120 * 1024 * 1024:
            crf = "27"
        elif before > 80 * 1024 * 1024:
            crf = "26"
        ok = transcode(src, dst, ff, crf)
        after = os.path.getsize(dst)
        total_before += before
        total_after += after
        tag = "OK " if ok else "FAIL"
        if src != dst and ok:
            os.remove(src)                     # 原始 mov 删除, 统一为 mp4
        print(f"[{tag}] {base:18} {before//1048576:4}MB -> {after//1048576:4}MB (crf {crf})")
        if after > SIZE_LIMIT:
            print(f"[WARN] {dst} 超过 {SIZE_LIMIT//1048576}MB, 需要更大压缩率重跑")

    print(f"合计 {total_before//1048576}MB -> {total_after//1048576}MB")


if __name__ == "__main__":
    main()
