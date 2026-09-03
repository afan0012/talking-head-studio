"""Build a self-contained Windows test package with PyInstaller.

Run this with a Python environment that already has the project requirements
and PyInstaller installed.  The optional --ffmpeg argument embeds an FFmpeg
binary in the package; only pass a separately verified redistributable build.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist-windows"
BUILD_CACHE = Path(r"D:\program_file_user\build-cache\koubo-shenqi")
APP_EXE_NAME = "afan Talking Head Agent"

# Heavy libraries that may exist in the build environment but are never (or
# only optionally) used by the app.  PyInstaller's static analysis still
# pulls them in through lazy imports; excluding them keeps the bundle near
# 300 MB instead of ~1.5 GB.  cv2 / faster_whisper are guarded by try/except
# at runtime, so their absence only disables local preflight / whisper
# fallback paths.
PYINSTALLER_EXCLUDES = (
    "torch", "torchvision", "torchaudio",
    "faster_whisper", "ctranslate2", "transformers", "tokenizers",
    "onnxruntime", "cv2", "pyarrow", "scipy", "pandas",
    "sklearn", "botocore", "boto3", "av",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", type=Path, help="path to an LGPL-compatible ffmpeg.exe to bundle")
    parser.add_argument("--ffmpeg-license", type=Path, help="LGPL license text shipped with the bundled FFmpeg")
    parser.add_argument("--installer", action="store_true", help="also build the NSIS Windows installer when makensis.exe is available")
    parser.add_argument("--console", action="store_true", help="show a console window for packaging diagnostics")
    args = parser.parse_args()

    if args.ffmpeg:
        # PyInstaller resolves relative add-data/add-binary paths against
        # --specpath, not the working directory: always pass absolute paths.
        args.ffmpeg = args.ffmpeg.resolve()
        args.ffmpeg_license = args.ffmpeg_license.resolve()
        ffprobe = args.ffmpeg.with_name("ffprobe.exe")
        if not args.ffmpeg.is_file() or not ffprobe.is_file():
            raise SystemExit("FFmpeg 包必须同时提供 ffmpeg.exe 和 ffprobe.exe。")
        if not args.ffmpeg_license or not args.ffmpeg_license.is_file():
            raise SystemExit("嵌入 FFmpeg 时必须同时提供其 LGPL 许可证文本。")

    DIST.mkdir(exist_ok=True)
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
        "--console" if args.console else "--windowed",
        "--name", APP_EXE_NAME, "--paths", str(ROOT),
        "--distpath", str(DIST), "--workpath", str(BUILD_CACHE / "work"),
        "--specpath", str(BUILD_CACHE / "spec"),
        "--add-data", f"{ROOT / 'app' / 'static'};app/static",
        "--add-data", f"{ROOT / 'THIRD_PARTY_NOTICES.md'};licenses",
        # uvicorn receives the application as a string, so PyInstaller cannot
        # discover app.main through normal static import analysis.
        "--collect-all", "dashscope", "--hidden-import", "multipart", "--hidden-import", "app.main",
        str(ROOT / "desktop_launcher.py"),
    ]
    for module in PYINSTALLER_EXCLUDES:
        command.extend(["--exclude-module", module])
    if args.ffmpeg:
        command.extend(["--add-binary", f"{args.ffmpeg};bin"])
        command.extend(["--add-binary", f"{ffprobe};bin"])
        command.extend(["--add-data", f"{args.ffmpeg_license};licenses"])
    subprocess.run(command, cwd=ROOT, check=True)

    app_dir = DIST / APP_EXE_NAME
    (app_dir / "测试说明.txt").write_text(
        "Double-click afan Talking Head Agent.exe to start.\n"
        "首次启动后在设置中填写你自己的 API Key。\n"
        "User data is stored in %LOCALAPPDATA%\\afan Talking Head Agent, not the install directory.\n",
        encoding="utf-8-sig",
    )
    if args.installer:
        nsis_candidates = [
            shutil.which("makensis.exe"),
            shutil.which("makensis"),
            Path(r"D:\program_file_user\NSIS\nsis-3.11\makensis.exe"),
        ]
        makensis = next((candidate for candidate in nsis_candidates if candidate and Path(candidate).is_file()), None)
        if not makensis:
            raise SystemExit("未找到 NSIS（makensis.exe）；已生成可测试的独立程序文件夹。")
        subprocess.run(
            [str(makensis), "/INPUTCHARSET", "UTF8", str(ROOT / "scripts" / "installer.nsi")],
            cwd=ROOT,
            check=True,
        )


if __name__ == "__main__":
    main()
