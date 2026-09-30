# -*- coding: utf-8 -*-
"""
太阳系知识库 —— 本地后端服务
- 静态托管前端（D:\线上知识库平台），仅允许白名单目录（assets/css/js/books 与 index.html）
- /api/data            GET   读取全部知识树（正文 content 由 books/<分类>/<id>.md 内联）
- /api/category        POST  新增分类（行星）；返回新分类对象（含自动生成的 id / 轨道）
- /api/category/<id>/satellite   POST  给某分类新增卫星（书籍）
- /api/category/<id>   DELETE 删除整个分类（连带 books/<分类>/ 目录与全部 .md）
- /api/satellite/<id>  PUT    修改卫星   DELETE  删除卫星
元数据持久化到 data/knowledge.json；正文持久化到 books/<分类>/<id>.md
"""
import json
import os
import re
import shutil
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE, "data", "knowledge.json")
PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("HOST", "0.0.0.0")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

# 允许被静态访问的目录前缀（防止 data/knowledge.json、server.py、tools/ 被直接读取）
ALLOWED_PREFIX = ("assets/", "css/", "js/", "books/")
ALLOWED_FILES = ("index.html",)

ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
CAT_PALETTE = ["#FF6B6B", "#FFD166", "#06D6A0", "#118AB2", "#9B5DE5",
               "#F15BB5", "#00BBF9", "#FEE440", "#00F5D4", "#E07A5F",
               "#43AA8B", "#F8961E", "#577590", "#90BE6D", "#F94144"]


def book_path(cat_id, sat_id):
    return os.path.join(BASE, "books", cat_id, sat_id + ".md")


def read_book(cat_id, sat_id):
    p = book_path(cat_id, sat_id)
    if os.path.isfile(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def write_book(cat_id, sat_id, content):
    d = os.path.join(BASE, "books", cat_id)
    os.makedirs(d, exist_ok=True)
    with open(book_path(cat_id, sat_id), "w", encoding="utf-8") as f:
        f.write(content or "")


def delete_book(cat_id, sat_id):
    p = book_path(cat_id, sat_id)
    if os.path.isfile(p):
        os.remove(p)


def load_data():
    """读取 knowledge.json 并把每本书正文从 .md 内联进 content。"""
    if not os.path.exists(DATA_FILE):
        return {"categories": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    for c in data.get("categories", []):
        for s in c.get("satellites", []):
            s["content"] = read_book(c["id"], s["id"])
            s.setdefault("tags", [])
            s.setdefault("cover", "")
    return data


def save_data(data):
    """写回 knowledge.json（剥离 content，避免重复存储）。"""
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    clean = {"categories": []}
    for c in data.get("categories", []):
        cc = dict(c)
        cc["satellites"] = []
        for s in c.get("satellites", []):
            meta = {k: v for k, v in s.items() if k != "content"}
            cc["satellites"].append(meta)
        clean["categories"].append(cc)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)


def next_sat_id(data, cat_id):
    n = 1
    ids = {s["id"] for c in data["categories"] if c["id"] == cat_id for s in c["satellites"]}
    while f"{cat_id}-{n}" in ids:
        n += 1
    return f"{cat_id}-{n}"


def next_cat_id(data):
    n = 1
    ids = {c["id"] for c in data["categories"]}
    while f"cat-{n}" in ids:
        n += 1
    return f"cat-{n}"


def find_sat(data, sat_id):
    for c in data["categories"]:
        for s in c.get("satellites", []):
            if s["id"] == sat_id:
                return c, s
    return None, None


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # ---------------- GET ----------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/data":
            self._send(200, load_data())
            return
        if path == "/":
            self._serve_file("index.html")
            return
        self._serve_file(path.lstrip("/"))

    # ---------------- POST ----------------
    def do_POST(self):
        path = urlparse(self.path).path
        m = re.match(r"^/api/category$", path)
        if m:
            self._create_category()
            return
        m = re.match(r"^/api/category/([^/]+)/satellite$", path)
        if not m:
            self._send(404, {"error": "not found"})
            return
        cat_id = m.group(1)
        data = load_data()
        cat = next((c for c in data["categories"] if c["id"] == cat_id), None)
        if not cat:
            self._send(404, {"error": "category not found"})
            return
        payload = self._read_json()
        sat = {
            "id": next_sat_id(data, cat_id),
            "title": str(payload.get("title", "")).strip(),
            "author": str(payload.get("author", "")).strip(),
            "summary": str(payload.get("summary", "")).strip(),
            "tags": payload.get("tags", []) if isinstance(payload.get("tags"), list) else [],
            "cover": str(payload.get("cover", "")).strip(),
        }
        if not sat["title"]:
            self._send(400, {"error": "title required"})
            return
        content = str(payload.get("content", ""))
        write_book(cat_id, sat["id"], content)
        sat["content"] = content
        cat.setdefault("satellites", []).append(sat)
        save_data(data)
        self._send(201, sat)

    def _create_category(self):
        data = load_data()
        payload = self._read_json()
        name = str(payload.get("name", "")).strip()
        if not name:
            self._send(400, {"error": "name required"})
            return
        color = str(payload.get("color", "")).strip()
        if not HEX_RE.match(color):
            color = random.choice(CAT_PALETTE)
        maxr = max((c.get("orbitRadius", 0) for c in data["categories"]), default=0)
        cat = {
            "id": next_cat_id(data),
            "name": name,
            "color": color,
            "size": 1.3,
            "orbitRadius": (maxr + 4.5) if maxr else 9.0,
            "speed": 0.16,
            "satellites": [],
        }
        data["categories"].append(cat)
        save_data(data)
        self._send(201, cat)

    # ---------------- PUT ----------------
    def do_PUT(self):
        path = urlparse(self.path).path
        m = re.match(r"^/api/satellite/([^/]+)$", path)
        if not m:
            self._send(404, {"error": "not found"})
            return
        sat_id = m.group(1)
        data = load_data()
        cat, sat = find_sat(data, sat_id)
        if not sat:
            self._send(404, {"error": "satellite not found"})
            return
        payload = self._read_json()
        for k in ("title", "author", "summary", "tags", "cover"):
            if k in payload:
                sat[k] = payload[k] if k != "cover" else str(payload[k]).strip()
        if "content" in payload:
            write_book(cat["id"], sat_id, str(payload["content"]))
            sat["content"] = str(payload["content"])
        save_data(data)
        self._send(200, sat)

    # ---------------- DELETE ----------------
    def do_DELETE(self):
        path = urlparse(self.path).path
        # 删除整个分类（连带其 books/<catId>/ 目录与全部 .md）
        m = re.match(r"^/api/category/([^/]+)$", path)
        if m:
            cat_id = m.group(1)
            data = load_data()
            idx = next((i for i, c in enumerate(data["categories"]) if c["id"] == cat_id), None)
            if idx is None:
                self._send(404, {"error": "category not found"})
                return
            bdir = os.path.join(BASE, "books", cat_id)
            if os.path.isdir(bdir):
                shutil.rmtree(bdir)
            del data["categories"][idx]
            save_data(data)
            self._send(200, {"ok": True, "deleted": cat_id, "remaining": len(data["categories"])})
            return
        m = re.match(r"^/api/satellite/([^/]+)$", path)
        if not m:
            self._send(404, {"error": "not found"})
            return
        sat_id = m.group(1)
        data = load_data()
        cat, sat = find_sat(data, sat_id)
        if not sat:
            self._send(404, {"error": "satellite not found"})
            return
        delete_book(cat["id"], sat_id)
        cat["satellites"].remove(sat)
        save_data(data)
        self._send(200, {"ok": True})

    # ---------------- 静态文件（白名单） ----------------
    def _serve_file(self, rel):
        norm = rel.replace("\\", "/")
        allowed = norm in ALLOWED_FILES or norm.startswith(ALLOWED_PREFIX)
        if not allowed:
            self._send(403, {"error": "forbidden"})
            return
        full = os.path.normpath(os.path.join(BASE, rel))
        if not full.startswith(BASE):
            self._send(403, {"error": "forbidden"})
            return
        if not os.path.isfile(full):
            self._send(404, {"error": "not found"})
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        try:
            with open(full, "rb") as f:
                body = f.read()
            self._send(200, body, ctype)
        except Exception as e:
            self._send(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        pass


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"🌌 太阳系知识库已启动： http://{HOST}:{PORT}")
    print(f"   数据文件： {DATA_FILE}")
    print(f"   正文目录： {os.path.join(BASE, 'books')}")
    print("   按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
