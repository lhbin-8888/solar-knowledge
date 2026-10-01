# -*- coding: utf-8 -*-
"""顺序执行 git add / commit / push 到 github 与 gitee（双仓库部署）。"""
import os
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIT = "C:/Users/73873/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe"
SSH = "C:/Users/73873/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin/ssh.exe"


def run(args):
    e = dict(os.environ)
    e["GIT_TERMINAL_PROMPT"] = "0"
    e["GIT_SSH_COMMAND"] = SSH
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"):
        e.pop(k, None)
    r = subprocess.run([GIT, "-C", BASE] + args, env=e, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    print(f"> git {' '.join(args)}\n  rc={r.returncode}\n  {out[-600:]}")
    return r.returncode == 0


if __name__ == "__main__":
    run(["add", "-A"])
    run(["commit", "-q", "-m",
         "feat: 方案B git自动回写 + 方案C Railway/Fly持久卷部署 + 数据根统一为 data/"])
    ok_g = run(["push", "github", "main"])
    ok_t = run(["push", "gitee", "main"])
    print("PUSH github=", ok_g, "gitee=", ok_t)
