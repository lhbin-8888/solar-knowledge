# -*- coding: utf-8 -*-
"""
从 data/knowledge.json + books/<分类>/<id>.md 重新生成 js/seed.js（离线兜底）。
用于在通过界面/接口增删改知识后，让离线兜底数据与线上一致。
不会改动 knowledge.json，可随时运行。
"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with open(os.path.join(BASE, "data", "knowledge.json"), encoding="utf-8") as f:
        data = json.load(f)

    for c in data["categories"]:
        for s in c.get("satellites", []):
            p = os.path.join(BASE, "books", c["id"], s["id"] + ".md")
            s["content"] = open(p, encoding="utf-8").read() if os.path.isfile(p) else ""
            s.setdefault("tags", [])
            s.setdefault("cover", "")

    out = os.path.join(BASE, "js", "seed.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// 自动生成，请勿手改。离线兜底数据（含 content）。\n")
        f.write("window.SEED_DATA = ")
        f.write(json.dumps(data, ensure_ascii=False, indent=2))
        f.write(";\n")

    print("regenerated seed.js: categories=", len(data["categories"]),
          "satellites=", sum(len(c["satellites"]) for c in data["categories"]))


if __name__ == "__main__":
    main()
