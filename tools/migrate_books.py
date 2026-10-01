# -*- coding: utf-8 -*-
"""把旧的 books/<分类>/<id>.md 迁移到 data/books/<分类>/<id>.md（统一数据根，便于方案 B/C 共用）。"""
import os
import shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "books")
DST = os.path.join(BASE, "data", "books")

if not os.path.isdir(SRC):
    print("books/ 不存在，无需迁移")
    raise SystemExit(0)

os.makedirs(DST, exist_ok=True)
moved = 0
for cat in sorted(os.listdir(SRC)):
    s = os.path.join(SRC, cat)
    if not os.path.isdir(s):
        continue
    d = os.path.join(DST, cat)
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(s):
        sf = os.path.join(s, f)
        if os.path.isfile(sf):
            shutil.move(sf, os.path.join(d, f))
            moved += 1
    try:
        os.rmdir(s)
    except OSError:
        pass

print(f"已迁移 {moved} 个 .md 到 data/books/")
