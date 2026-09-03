# -*- coding: utf-8 -*-
"""打包发布版：从 git 跟踪列表导出干净副本，生成可发群的 zip。

用法：
    python scripts/package.py

输出：
    dist-release/afan-Talking-Head-Agent.zip   -- source, docs and config template only,
    不含个人素材（work/）、项目数据（data/jobs）、日志和 .env。
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist-release"
STAGE = DIST / "afan Talking Head Agent"
ZIP_PATH = DIST / "afan-Talking-Head-Agent.zip"

# 除了 git 跟踪文件外，还要打进发布包的新文件
EXTRA_FILES = [
    "一键启动.bat",
    ".env.example",
    "docs/使用指南.md",
]

# 从 git 跟踪列表里剔除、不进发布包的文件（内部文档/开发脚本）
EXCLUDE_FILES = {
    "afan-talking-head-agent-product-notes.md",  # internal product notes
    "work/sample.jpg",
}

README_FIRST = """\
【先看我】

1. 软件本体以 MIT License 开源。使用云端 AI 服务时，请自行查看服务商的价格、账户状态和使用条款；详细步骤请打开：docs/使用指南.md
2. 按指南装好 Python 和 FFmpeg 后，双击「一键启动.bat」，
   在打开的网页里点左下角「⚙ 设置」填入 API Key 即可使用。
3. 本软件基于 MIT 协议开源（见 LICENSE），可自由使用和修改。

打不开 .md 文件的话：右键 → 打开方式 → 记事本。
"""


def git_tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "-c", "core.quotepath=false", "ls-files"],
        cwd=ROOT, capture_output=True, check=True,
    )
    return [line for line in out.stdout.decode("utf-8").splitlines() if line]


def _reset_dir(path: Path) -> None:
    """清空旧产物；受沙箱/回收站限制时退化为直接覆盖同名文件。"""
    if path.exists():
        try:
            shutil.rmtree(path)
        except OSError:
            pass
    path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    _reset_dir(STAGE)

    wanted = [f for f in git_tracked_files() if f.replace("\\", "/") not in EXCLUDE_FILES]
    for rel in EXTRA_FILES:
        if rel.replace("\\", "/") not in wanted:
            wanted.append(rel.replace("\\", "/"))

    missing = [rel for rel in wanted if not (ROOT / rel).is_file()]
    if missing:
        sys.exit(f"[打包失败] 缺少文件：{missing}")

    for rel in wanted:
        src = ROOT / rel
        dst = STAGE / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    (STAGE / "先看我.txt").write_text(README_FIRST, encoding="utf-8-sig")

    if ZIP_PATH.exists():
        try:
            ZIP_PATH.unlink()
        except OSError:
            pass  # 直接以 'w' 模式覆盖
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(STAGE.rglob("*")):
            zf.write(path, path.relative_to(STAGE.parent))

    size_mb = ZIP_PATH.stat().st_size / 1024 / 1024
    print(f"[完成] {ZIP_PATH}（{size_mb:.1f} MB，共 {len(wanted) + 1} 个文件）")
    print("已排除：个人素材 work/、项目数据 data/jobs、日志、.env、备份文件。")


if __name__ == "__main__":
    main()
