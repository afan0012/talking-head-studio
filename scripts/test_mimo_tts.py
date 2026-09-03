# -*- coding: utf-8 -*-
"""
MiMo 配音/声音克隆效果快速验证。
用法：
    测试预置音色（不需要样本）：
        python scripts/test_mimo_tts.py
    测试声音克隆（需要一段 10-30 秒干净人声，wav/mp3 均可）：
        python scripts/test_mimo_tts.py --sample D:/path/to/sample.wav
输出：scripts/test_output/ 下的 wav 文件，直接播放试听。
"""
import argparse
import base64
import os
import sys
from pathlib import Path

import httpx

API_URL = "https://api.xiaomimimo.com/v1/chat/completions"
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "scripts" / "test_output"

TEXT = (
    "大家好，这是一段用小米语音合成生成的口播试听音频。"
    "请你重点听听音质是不是清晰自然，语速和停顿是不是舒服，"
    "如果和真人发音差距不大，就可以考虑用这套声音做正式的视频配音了。"
)

VOICES = ["冰糖", "沧声", "燃点"]


def load_key() -> str:
    key = os.getenv("MIMO_API_KEY")
    if key:
        return key
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("MIMO_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("未找到 MIMO_API_KEY。请在 .env 中填写，或先设置环境变量。")


def synth(key: str, model: str, messages: list[dict], out: Path, voice: str = "冰糖") -> None:
    payload = {
        "model": model,
        "messages": messages,
        "audio": {"format": "wav", "voice": voice},
    }
    resp = httpx.post(
        API_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=240,
    )
    if not resp.is_success:
        raise SystemExit(f"{model} 调用失败：HTTP {resp.status_code} {resp.text[:300]}")
    try:
        audio = base64.b64decode(resp.json()["choices"][0]["message"]["audio"]["data"])
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"{model} 返回格式异常：{exc}") from exc
    if not audio.startswith(b"RIFF"):
        raise SystemExit(f"{model} 返回的不是 WAV 音频，格式不对。")
    out.write_bytes(audio)
    seconds = len(audio) / 2 / 24000  # 按 16bit/24kHz 粗估
    print(f"[OK] {model} → {out}（约 {seconds:.1f} 秒）")


def main() -> None:
    ap = argparse.ArgumentParser(description="MiMo 配音效果快速验证")
    ap.add_argument("--sample", help="声音克隆样本路径（wav/mp3，10-30 秒干净人声）")
    ap.add_argument("--voice", default="冰糖", help="预置音色名（冰糖/沧声/燃点）")
    args = ap.parse_args()

    key = load_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. 预置音色
    synth(
        key,
        "mimo-v2.5-tts",
        [
            {"role": "user", "content": "请用自然、清晰、亲切的普通话朗读，语速自然。"},
            {"role": "assistant", "content": TEXT},
        ],
        OUT_DIR / f"mimo_预置音色_{args.voice}.wav",
        voice=args.voice,
    )

    # 2. 声音克隆（可选）
    if args.sample:
        sample = Path(args.sample)
        if not sample.is_file():
            raise SystemExit(f"样本不存在：{sample}")
        mime = "audio/mpeg" if sample.suffix.lower() == ".mp3" else "audio/wav"
        voice_data = base64.b64encode(sample.read_bytes()).decode("ascii")
        synth(
            key,
            "mimo-v2.5-tts-voiceclone",
            [
                {"role": "user", "content": "自然、清晰、亲切。"},
                {"role": "assistant", "content": TEXT},
            ],
            OUT_DIR / f"mimo_声音克隆_{sample.stem}.wav",
            voice=f"data:{mime};base64,{voice_data}",
        )

    print("\n试听完毕。效果能接受 → 可以走‘百炼+MiMo 双 key’收敛；效果不行 → 保留 Fish Audio。")


if __name__ == "__main__":
    main()
