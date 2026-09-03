"""Windows desktop entry point used by the packaged application.

The product remains a local web application, but a normal user starts it by
double-clicking one executable instead of running Python or a batch file.
"""
from __future__ import annotations

import socket
import threading
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn


def _log(message: str) -> None:
    """Keep a tiny first-start log for packaged-app diagnostics."""
    try:
        base = Path(__import__("os").environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "afan Talking Head Agent"
        base.mkdir(parents=True, exist_ok=True)
        with (base / "launcher.log").open("a", encoding="utf-8") as output:
            output.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
    except OSError:
        pass


def _available_port() -> int:
    for port in (8000, 8001, 8002):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _open_when_ready(url: str) -> None:
    for _ in range(100):
        try:
            with urllib.request.urlopen(url, timeout=0.5):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.15)


def main() -> None:
    _log("launcher started")
    port = _available_port()
    url = f"http://127.0.0.1:{port}"
    _log(f"selected port {port}; importing app")
    # Import explicitly before starting Uvicorn. This makes frozen-build
    # failures visible in launcher.log and avoids fragile string imports.
    try:
        from app.main import app
    except Exception:
        _log("application import failed:\n" + traceback.format_exc())
        raise

    _log("app imported; starting local server")
    threading.Thread(target=_open_when_ready, args=(url,), daemon=True).start()
    try:
        # A windowed PyInstaller executable has no stdout/stderr handles.
        # Disabling Uvicorn's console formatter prevents it from trying to
        # call ``isatty`` on None during normal double-click launches.
        uvicorn.run(app, host="127.0.0.1", port=port, log_config=None, access_log=False)
    except Exception:
        _log("local server stopped unexpectedly:\n" + traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
