# afan Talking Head Agent

一个本地运行的短视频口播制作工作台。它把文案、配音、人物口型、字幕和简单剪辑串成一条可检查的流程。

## 能做什么

- 直接输入主题，让 AI 生成口播稿；或上传本地参考视频，提取原文案后生成可编辑的改写稿。
- 上传人物视频并进行人物视频预检。
- 使用上传的声音样音、已保存音色或云端标准音色生成试听配音。
- 将新配音与人物视频提交给 VideoRetalk，生成改口型视频。
- 为成片生成字幕、关键词高亮、B-roll、背景音乐和封面，并导出 MP4。

## 模型与服务

- 文案生成、改写和部分编辑方案支持 MiMo、百炼、Ollama 以及配置好的 OpenAI 兼容服务。
- ASR、声音复刻、标准配音和改口型依赖对应的模型适配器；不同模型需要不同服务商的接口和权限。
- 改口型当前使用阿里云百炼 VideoRetalk。
- 云端模型是否可用、是否收费、是否有免费额度，以服务商控制台当前显示为准。

## 运行要求

源码运行需要：

- Python 3.10 或更高版本
- FFmpeg 和 ffprobe，并加入 PATH，或在应用设置中填写 FFmpeg 路径
- 你自己配置的模型服务密钥（仅使用本地模型的环节可以不填云端密钥）

项目当前以源码形式提供；仓库中的打包脚本用于开发者自行构建。

## Windows 快速开始

在项目根目录打开 PowerShell：

```powershell
pip install -r requirements.txt
.\run.ps1
```

或者双击 `一键启动.bat`。启动后打开：

<http://127.0.0.1:8000>

服务默认只监听本机地址；是否将媒体发送到云端，取决于你在工作流中选择的模型步骤。

运行测试需要额外安装开发依赖和 Playwright 浏览器：

```powershell
pip install -r requirements-dev.txt
python -m playwright install chromium
pytest -q
```

## 第三方服务与数据流向

本项目本身是 MIT 协议开源软件，但第三方模型服务有各自的服务条款、价格和数据处理规则。

- 上传到云端的内容只由你在工作流中主动选择的模型步骤决定，例如 ASR、声音生成或 VideoRetalk。
- API Key 默认保存在当前 Windows 用户的 `%LOCALAPPDATA%\afan Talking Head Agent` 数据目录中，不应提交到 Git 或分享给他人。
- 参考视频、声音样音和生成文件默认保存在本机数据目录；请自行确认磁盘空间和备份策略。
- 使用人物肖像、声音样音和参考内容前，必须确认你拥有相应授权，并遵守发布平台的 AI 内容标注规则。

## 打包 Windows 安装包

开发者可以使用 PyInstaller 和 NSIS/IExpress 构建 Windows 包。FFmpeg 必须使用可再分发的 LGPL 构建，并随包提供许可证文本：

```powershell
python scripts/build_windows.py --ffmpeg <path-to-ffmpeg.exe> --ffmpeg-license <path-to-license.txt> --installer
```

打包产物不会自动上传到 GitHub；发布前请人工检查依赖、许可证、安装路径、快捷方式和数据目录。

## 许可证

本项目采用 [MIT License](LICENSE)。FFmpeg 等第三方组件遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
