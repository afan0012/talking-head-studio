@echo off
chcp 65001 >nul
cd /d "%~dp0"
title afan Talking Head Agent

echo ============================================
echo   afan Talking Head Agent - Local Startup
echo ============================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    set "PYCMD=python"
    goto :found
)

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYCMD=py -3"
    goto :found
)

echo [错误] 没有找到 Python。
echo 请先安装 Python 3.10 以上版本：
echo https://www.python.org/downloads/
echo 安装时务必勾选 "Add Python to PATH"
echo.
pause
exit /b 1

:found
echo [1/4] 使用 Python：%PYCMD%

rem 首次运行：安装依赖（已安装则跳过，很快）
echo [2/4] 检查依赖（首次运行需要几分钟，请耐心等待）...
%PYCMD% -c "import fastapi, uvicorn, dashscope, httpx, multipart" >nul 2>nul
if not %errorlevel%==0 (
    echo       正在安装依赖，请勿关闭窗口...
    %PYCMD% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    if not %errorlevel%==0 (
        %PYCMD% -m pip install -r requirements.txt
    )
)

rem 检查 FFmpeg
echo [3/4] 检查 FFmpeg...
where ffmpeg >nul 2>nul
if not %errorlevel%==0 (
    if not exist ".env" (
        echo.
        echo [提示] 没有找到 FFmpeg，视频剪辑和导出功能将无法使用。
        echo 详见《使用指南》第 2 步的 FFmpeg 安装说明。
        echo.
    )
)

rem 检查 .env 配置
if not exist ".env" (
    echo [提示] 检测到还没有配置 .env 文件（API 密钥）。
    echo        请先阅读《使用指南》，按第 3 步把 .env.example 复制为 .env 并填入密钥。
    echo        没有密钥也能打开页面，但无法生成内容。
    echo.
)

echo [4/4] 正在启动服务...
echo 启动后浏览器会自动打开；如没有打开，请手动访问 http://127.0.0.1:8000
echo 关闭本窗口即停止程序。
echo.

start "" http://127.0.0.1:8000
%PYCMD% -m uvicorn app.main:app --host 127.0.0.1 --port 8000

pause
