"""Create a no-admin Windows test installer with the built-in IExpress tool.

This installer targets the current user's LocalAppData directory, never
requests administrator access, and avoids requiring a separate installer
compiler on a tester's PC.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "dist-windows" / "afan Talking Head Agent"
OUTPUT_DIR = ROOT / "dist-windows" / "installer"
SETUP_EXE = OUTPUT_DIR / "afan-Talking-Head-Agent-Setup.exe"


def _zip_payload(path: Path) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in APP_DIR.rglob("*"):
            if item.is_file():
                archive.write(item, item.relative_to(APP_DIR.parent))


def main() -> None:
    if not (APP_DIR / "afan Talking Head Agent.exe").is_file():
        raise SystemExit("请先运行 scripts/build_windows.py 生成独立程序文件夹。")
    iexpress = Path(r"C:\Windows\System32\iexpress.exe")
    if not iexpress.is_file():
        raise SystemExit("当前 Windows 未提供 IExpress，无法生成测试安装包。")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="koubo-installer-", dir=ROOT / "dist-windows") as temp:
        stage = Path(temp)
        payload = stage / "payload.zip"
        _zip_payload(payload)
        (stage / "install.cmd").write_text(
            "@echo off\r\n"
            "setlocal\r\n"
            "set \"TARGET=%LOCALAPPDATA%\\Programs\\afan Talking Head Agent\"\r\n"
            "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$ErrorActionPreference='Stop'; "
            "$target=[Environment]::ExpandEnvironmentVariables('%TARGET%'); "
            "New-Item -ItemType Directory -Force -Path $target | Out-Null; "
            "Expand-Archive -LiteralPath '%~dp0payload.zip' -DestinationPath (Split-Path $target) -Force\"\r\n"
            "if errorlevel 1 exit /b 1\r\n"
            "start \"\" \"%TARGET%\\afan Talking Head Agent.exe\"\r\n"
            "exit /b 0\r\n",
            encoding="mbcs",
            newline="",
        )
        sed = stage / "installer.sed"
        # SED is an INI-like file, not a Python/JSON string: Windows paths
        # must be written with their ordinary single backslashes.
        source = str(stage)
        target = str(SETUP_EXE)
        sed.write_text(
            "[Version]\r\nClass=IEXPRESS\r\nSEDVersion=3\r\n"
            "[Options]\r\nPackagePurpose=InstallApp\r\nShowInstallProgramWindow=0\r\n"
            "HideExtractAnimation=1\r\nUseLongFileName=1\r\nInsideCompressed=1\r\n"
            "CAB_FixedSize=0\r\nCAB_ResvCodeSigning=0\r\nRebootMode=N\r\nInstallPrompt=%InstallPrompt%\r\n"
            "DisplayLicense=%DisplayLicense%\r\nFinishMessage=%FinishMessage%\r\nTargetName=%TargetName%\r\n"
            "FriendlyName=%FriendlyName%\r\nAppLaunched=%AppLaunched%\r\n"
            "PostInstallCmd=%PostInstallCmd%\r\nAdminQuietInstCmd=%AdminQuietInstCmd%\r\nUserQuietInstCmd=%UserQuietInstCmd%\r\n"
            "SourceFiles=SourceFiles\r\n"
            "FILE0=\"payload.zip\"\r\nFILE1=\"install.cmd\"\r\n"
            "[Strings]\r\nInstallPrompt=\r\nDisplayLicense=\r\nFinishMessage=\r\n"
            "TargetName=" + target + "\r\nFriendlyName=afan Talking Head Agent Setup\r\n"
            "AppLaunched=cmd /c install.cmd\r\nPostInstallCmd=<None>\r\nAdminQuietInstCmd=\r\nUserQuietInstCmd=\r\n"
            "[SourceFiles]\r\nSourceFiles0=" + source + "\\\r\n"
            "[SourceFiles0]\r\n%FILE0%=\r\n%FILE1%=\r\n",
            encoding="mbcs",
            newline="",
        )
        # /Q and /M suppress any wizard/error UI during an automated build.
        subprocess.run([str(iexpress), "/N", "/Q", "/M", str(sed)], check=True)
    print(f"[完成] {SETUP_EXE} ({SETUP_EXE.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
