import json

import pytest

from app import main


def make_job(job_id: str, source_name: str = "测试项目") -> main.Job:
    return main.Job(
        id=job_id,
        source_name=source_name,
        instruction="",
        create_voice=True,
        voice_id=None,
    )


def test_api_keys_only_come_from_the_app_local_settings_file(tmp_path, monkeypatch):
    config = tmp_path / ".env"
    config.write_text("MIMO_API_KEY=entered-in-app\n", encoding="utf-8")
    previous = dict(main._LOCAL_SETTINGS)
    monkeypatch.setenv("MIMO_API_KEY", "ambient-system-key")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ambient-system-key")
    try:
        main.load_dotenv(config)
        assert main.local_setting("MIMO_API_KEY") == "entered-in-app"
        assert main.local_setting("DEEPSEEK_API_KEY") is None
    finally:
        main._LOCAL_SETTINGS.clear()
        main._LOCAL_SETTINGS.update(previous)


def test_saved_job_updates_are_persisted(tmp_path, monkeypatch):
    database = tmp_path / "jobs.json"
    monkeypatch.setattr(main, "DB_PATH", database)
    store = main.JobStore()
    job = make_job("persist-test")
    store.add(job)
    store.persist(job.id)

    store.update(job, stage="试听已完成", preview_audio_name="preview.wav")

    saved = json.loads(database.read_text(encoding="utf-8"))
    assert saved[0]["stage"] == "试听已完成"
    assert saved[0]["preview_audio_name"] == "preview.wav"
    assert not database.with_suffix(".json.tmp").exists()


def test_broll_filter_offsets_clip_to_requested_start():
    filter_graph = main.build_broll_filter([(1, 5.0, 4.0)], "null")

    assert "setpts=PTS-STARTPTS+5.000/TB" in filter_graph
    assert "between(t,5.000,9.000)" in filter_graph


def test_broll_filter_with_size_uses_contain_scaling():
    """主画面尺寸已知时 B-roll 用 contain（保比例+pad），不再拉伸变形。"""
    filter_graph = main.build_broll_filter([(1, 1.3, 2.5)], "null", main_w=720, main_h=1254)

    assert "force_original_aspect_ratio=decrease" in filter_graph
    assert "pad=720:1254" in filter_graph
    assert "scale2ref" not in filter_graph
    assert "between(t,1.300,3.800)" in filter_graph


def test_broll_filter_supports_multiple_clips():
    """多段 B-roll：每段独立输入流 + 各自时间窗链式 overlay。"""
    filter_graph = main.build_broll_filter(
        [(1, 1.0, 2.0), (2, 5.0, 3.0)], "null", main_w=720, main_h=1254
    )

    # 两段各自有独立的缩放/时间窗/overlay 链
    assert filter_graph.count("force_original_aspect_ratio=decrease") == 2
    assert "between(t,1.000,3.000)" in filter_graph
    assert "between(t,5.000,8.000)" in filter_graph
    # 链式叠加：第二段的 overlay 基于第一段的结果
    assert "[brollmixed0][broll1]overlay" in filter_graph
    # 最终标签输出 video
    assert filter_graph.rstrip().endswith("[video]")


def test_direct_tts_default_matches_implemented_mimo_path():
    job = make_job("tts-default")

    assert job.direct_tts_model == "mimo-v2.5-tts"
    assert job.direct_tts_model in main.DIRECT_TTS_MODELS


def test_auto_edit_falls_back_when_ai_decision_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "jobs.json")
    monkeypatch.setattr(main, "JOBS_DIR", tmp_path)
    store = main.JobStore()
    monkeypatch.setattr(main, "store", store)
    job = make_job("auto-edit")
    job.rewritten_text = "三个让口播视频更好看的小技巧，第一是字幕要大。"
    job.person_duration = 20
    job.output_name = "output.mp4"
    # 已上传 B-roll 素材但未勾选启用：一键成片应自动启用插片。
    (tmp_path / job.id).mkdir(exist_ok=True)
    (tmp_path / job.id / "scene.png").write_bytes(b"fake-broll")
    job.broll_name = "scene.png"
    store.add(job)

    rendered: list[str] = []
    monkeypatch.setattr(main, "render_edit", lambda job_id: rendered.append(job_id))
    # AI 决策接口直接抛错，一键成片必须仍走默认方案出片。
    monkeypatch.setattr(
        main,
        "generate_script_text",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("AI 不可用")),
    )

    main.run_auto_edit(job.id)

    assert rendered == [job.id]
    assert job.status == "running"  # render_edit 已被替身接管，状态停留在决策完成
    assert job.title  # 回退标题取自文案开头
    assert job.subtitle_enabled is True
    assert job.subtitle_color == "FFFFFF"
    assert job.broll_enabled is True  # 有素材即自动启用


def test_auto_edit_respects_locked_manual_fields(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "jobs.json")
    monkeypatch.setattr(main, "JOBS_DIR", tmp_path)
    store = main.JobStore()
    monkeypatch.setattr(main, "store", store)
    job = make_job("auto-edit-lock")
    job.rewritten_text = "三个让口播视频更好看的小技巧，第一是字幕要大。"
    job.person_duration = 20
    job.output_name = "output.mp4"
    # 用户手动调好的设置
    job.title = "我的手动标题"
    job.subtitle_color = "FF6B6B"
    job.music_volume = 0.3
    job.subtitle_enabled = False
    job.music_name = "bgm.mp3"
    # 用户手动关闭了 B-roll（已上传素材但取消勾选）：一键成片不得擅自打开。
    (tmp_path / job.id).mkdir(exist_ok=True)
    (tmp_path / job.id / "scene.png").write_bytes(b"fake-broll")
    job.broll_name = "scene.png"
    job.broll_enabled = False
    store.add(job)

    rendered: list[str] = []
    monkeypatch.setattr(main, "render_edit", lambda job_id: rendered.append(job_id))
    monkeypatch.setattr(
        main,
        "generate_script_text",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("AI 不可用")),
    )

    main.run_auto_edit(
        job.id,
        locked="title,subtitle_color,subtitle_enabled,music_volume,broll_enabled",
    )

    assert rendered == [job.id]
    # 锁定字段全部保留用户值，AI 没有覆盖
    assert job.title == "我的手动标题"
    assert job.subtitle_color == "FF6B6B"
    assert job.subtitle_enabled is False
    assert job.music_volume == 0.3
    assert job.broll_enabled is False  # 手动关闭不被一键成片重新打开
    # 未锁定字段照常由默认方案/AI 决策
    assert job.cover_text
    assert isinstance(job.sticker, str)


def test_broll_input_args_switches_on_file_type(tmp_path):
    image = tmp_path / "scene.png"
    video = tmp_path / "scene.mp4"
    assert main.broll_input_args(image) == ["-loop", "1"]
    assert main.broll_input_args(video) == ["-stream_loop", "-1"]
    assert main.is_image_path(image) is True
    assert main.is_image_path(video) is False


def test_custom_provider_is_a_real_text_model_route(tmp_path, monkeypatch):
    """自定义服务商可用于两个文本环节，而不只是显示在一个无效下拉框中。"""
    monkeypatch.setattr(main, "CUSTOM_PROVIDERS_PATH", tmp_path / "custom_providers.json")
    monkeypatch.setattr(main, "MODEL_ROUTES_PATH", tmp_path / "model_routes.json")
    main._save_custom_providers([
        {"id": "custom-test", "name": "我的接口", "base_url": "https://api.example.com/v1", "api_key": "test-key", "model": "demo-model"}
    ])

    assert main.selected_text_model("script", "custom:custom-test") == "custom:custom-test"
    assert main.selected_text_model("rewrite", "custom:custom-test") == "custom:custom-test"
    main.save_model_routes({"routes": {"script": "custom:custom-test", "rewrite": "custom:custom-test"}})

    routes = main._load_model_routes()
    assert routes["script"] == "custom:custom-test"
    assert routes["rewrite"] == "custom:custom-test"
    assert routes["asr"] == "auto"


def test_local_ollama_is_a_real_text_model_route(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "LOCAL_OLLAMA_PATH", tmp_path / "local_ollama.json")
    monkeypatch.setattr(main, "MODEL_ROUTES_PATH", tmp_path / "model_routes.json")

    main.save_local_ollama({"base_url": "http://127.0.0.1:11434/v1", "model": "qwen3:8b"})

    assert main._load_local_ollama() == {"base_url": "http://127.0.0.1:11434/v1", "model": "qwen3:8b"}
    assert main.selected_text_model("script", "local:ollama") == "local:ollama"
    assert main.selected_text_model("rewrite", "local:ollama") == "local:ollama"
    main.save_model_routes({"routes": {"script": "local:ollama", "rewrite": "local:ollama"}})
    routes = main._load_model_routes()
    assert routes["script"] == "local:ollama"
    assert routes["rewrite"] == "local:ollama"
    assert routes["voice_clone"] == "mimo-v2.5-tts-voiceclone"


def test_ollama_test_reads_local_model_list(monkeypatch):
    class Response:
        is_success = True

        def json(self):
            return {"models": [{"name": "qwen3:8b"}, {"name": "qwen3:4b"}]}

    captured: list[str] = []
    monkeypatch.setattr(main.httpx, "get", lambda url, timeout: captured.append(url) or Response())

    result = main.test_local_ollama({"base_url": "http://localhost:11434/v1"})

    assert result["models"] == ["qwen3:8b", "qwen3:4b"]
    assert captured == ["http://localhost:11434/api/tags"]
    with pytest.raises(main.HTTPException):
        main.test_local_ollama({"base_url": "http://example.com/v1"})


def test_service_model_discovery_reads_openai_compatible_models(monkeypatch):
    class Response:
        is_success = True

        def json(self):
            return {"data": [{"id": "chat-pro"}, {"id": "speech-pro"}, {"id": "chat-pro"}]}

    captured: dict[str, object] = {}
    monkeypatch.setattr(
        main.httpx,
        "get",
        lambda url, headers, timeout: captured.update(url=url, headers=headers, timeout=timeout) or Response(),
    )

    result = main.discover_service_models({"base_url": "https://api.example.com/v1", "api_key": "test-key"})

    assert result == {"ok": True, "models": ["chat-pro", "speech-pro"]}
    assert captured == {
        "url": "https://api.example.com/v1/models",
        "headers": {"Authorization": "Bearer test-key"},
        "timeout": 10,
    }


def test_provider_model_list_hides_models_that_need_speech_adapters(monkeypatch):
    class Response:
        is_success = True
        status_code = 200
        text = ""

        def json(self):
            return {"data": [
                {"id": "qwen3.7-flash"},
                {"id": "qwen-audio-3.0-asr-flash"},
                {"id": "qwen-audio-3.0-tts-plus"},
            ]}

    monkeypatch.setattr(main, "local_setting", lambda key: "test-key")
    monkeypatch.setattr(main.httpx, "get", lambda *args, **kwargs: Response())

    result = main.list_provider_models("dashscope")

    assert result == {"models": ["qwen3.7-flash"], "filtered": 2}


def test_download_resumes_after_a_midstream_disconnect(tmp_path, monkeypatch):
    calls = []
    retry_events = []

    class Response:
        def __init__(self, attempt):
            self.attempt = attempt
            self.status_code = 200 if attempt == 1 else 206
            self.headers = (
                {"content-length": "6"}
                if attempt == 1
                else {"content-length": "3", "content-range": "bytes 3-5/6"}
            )

        def raise_for_status(self):
            return None

        def iter_bytes(self):
            if self.attempt == 1:
                yield b"abc"
                raise main.httpx.RemoteProtocolError("connection closed")
            yield b"def"

    class Stream:
        def __init__(self, attempt):
            self.response = Response(attempt)

        def __enter__(self):
            return self.response

        def __exit__(self, *_args):
            return False

    def fake_stream(_method, _url, *, headers, **_kwargs):
        calls.append(headers.copy())
        return Stream(len(calls))

    monkeypatch.setattr(main.httpx, "stream", fake_stream)
    monkeypatch.setattr(main.time, "sleep", lambda _seconds: None)
    target = tmp_path / "source.mp4"

    main.download("https://cdn.example.com/source.mp4", target, on_retry=lambda *args: retry_events.append(args))

    assert target.read_bytes() == b"abcdef"
    assert calls == [{"Accept-Encoding": "identity"}, {"Accept-Encoding": "identity", "Range": "bytes=3-"}]
    assert retry_events[0][:2] == (2, 6)
def test_settings_no_longer_exposes_legacy_global_openai_fields():
    settings = main.get_settings()

    assert all(not field["key"].startswith("LLM_") for field in settings["fields"])
    assert [module["id"] for module in settings["modules"]] == [
        "script", "rewrite", "asr", "subtitle_asr", "voice_clone", "direct_tts", "lipsync", "edit_plan",
    ]
    assert all("required" not in field for field in settings["fields"])


def test_model_assignment_only_lists_configured_and_adapted_routes(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SERVICE_CONNECTIONS_PATH", tmp_path / "service_connections.json")
    monkeypatch.setattr(main, "CUSTOM_PROVIDERS_PATH", tmp_path / "custom_providers.json")
    monkeypatch.setattr(main, "LOCAL_OLLAMA_PATH", tmp_path / "ollama.json")
    monkeypatch.setattr(main, "local_setting", lambda key: None)

    unavailable = {module["id"]: module["options"] for module in main.get_settings()["modules"]}
    assert unavailable["asr"] == []
    assert unavailable["direct_tts"] == []

    monkeypatch.setattr(main, "local_setting", lambda key: "configured" if key in {"DASHSCOPE_API_KEY", "DASHSCOPE_WORKSPACE_ID"} else None)
    available = {module["id"]: module["options"] for module in main.get_settings()["modules"]}
    assert [item["value"] for item in available["asr"]] == ["auto", "qwen-audio-3.0-asr-flash-filetrans"]
    assert [item["value"] for item in available["subtitle_asr"]] == ["auto", "paraformer-realtime-v2", "qwen-audio-3.0-asr-flash-filetrans"]
    assert [item["value"] for item in available["direct_tts"]] == ["qwen-builtin-tts"]
    assert "mimo-v2.5" not in [item["value"] for item in available["script"]]


def test_every_supported_processing_step_has_a_saved_model_route(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "MODEL_ROUTES_PATH", tmp_path / "model_routes.json")
    monkeypatch.setattr(main, "local_setting", lambda key: "configured-for-test")

    main.save_model_routes({"routes": {
        "asr": "qwen-audio-3.0-asr-flash-filetrans",
        "voice_clone": "mimo-v2.5-tts-voiceclone",
        "direct_tts": "qwen-builtin-tts",
        "lipsync": "videoretalk",
    }})

    routes = main._load_model_routes()
    assert routes["asr"] == "qwen-audio-3.0-asr-flash-filetrans"
    assert routes["voice_clone"] == "mimo-v2.5-tts-voiceclone"
    assert routes["direct_tts"] == "qwen-builtin-tts"
    assert routes["lipsync"] == "videoretalk"
    assert main._is_model_option("asr", "custom:not-a-real-provider") is False


def test_service_connection_registers_generic_models_as_text_only_without_exposing_key(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SERVICE_CONNECTIONS_PATH", tmp_path / "service_connections.json")
    result = main.add_service_connection({
        "name": "我的兼容网关",
        "base_url": "https://api.example.com/v1",
        "api_key": "super-secret-key",
        "connections": [{"capability": "chat", "models": "chat-model"}],
    })

    chat = "service:" + result["service_connections"][0]["id"] + ":chat:chat-model"
    assert main.selected_model("script", chat) == chat
    assert main.selected_model("rewrite", chat) == chat
    assert all("super-secret-key" not in str(item) for item in result["service_connections"])
    assert not any(item["value"].startswith("service:") for item in next(m for m in result["modules"] if m["id"] == "asr")["options"])

    with pytest.raises(main.HTTPException, match="只支持文本对话"):
        main.add_service_connection({
            "name": "错误的语音网关", "base_url": "https://speech.example.com/v1", "api_key": "key",
            "connections": [{"capability": "asr", "models": "asr-model"}],
        })

    provider_id = result["service_connections"][0]["id"]
    main.update_service_connection(provider_id, {
        "name": "更新后的网关", "base_url": "https://api.example.com/v1", "kind": "compatible",
        "api_key": "", "connections": [{"capability": "chat", "models": "new-chat-model"}],
    })
    saved = main._load_service_connections()[0]
    assert saved["api_key"] == "super-secret-key"
    assert saved["connections"] == [{"capability": "chat", "adapter": "openai-chat", "models": ["new-chat-model"]}]


def test_bailian_builtin_tts_uses_native_qwen_audio_adapter(tmp_path, monkeypatch):
    calls = {}

    class Result:
        def get_audio_data(self):
            return b"RIFFtest-wav"

    class Synthesizer:
        @staticmethod
        def call(**kwargs):
            calls.update(kwargs)
            return Result()

    monkeypatch.setattr(main, "HttpSpeechSynthesizer", Synthesizer)
    pipeline = object.__new__(main.BailianPipeline)
    pipeline.key = "test-key"
    target = tmp_path / "preview.wav"

    pipeline.synthesize_builtin_tts("测试文案", target, speed="fast")

    assert target.read_bytes() == b"RIFFtest-wav"
    assert calls["model"] == "qwen-audio-3.0-tts-plus"
    assert calls["voice"] == "longanlingxin"
    assert calls["rate"] == 1.15


def test_generate_script_supports_native_bailian_model(monkeypatch):
    calls = {}

    class Choice:
        class message:
            content = "原生百炼文案"

    class Response:
        status_code = 200
        output = type("Output", (), {"choices": [Choice()]})()

    class Pipeline:
        def generate_script(self, prompt, **kwargs):
            calls["prompt"] = prompt
            calls.update(kwargs)
            return "原生百炼文案"

    monkeypatch.setattr(main, "BailianPipeline", Pipeline)
    assert main.generate_script_text("写一段文案", model="qwen3.7-flash", temperature=0.2, max_tokens=300) == "原生百炼文案"
    assert calls == {"prompt": "写一段文案", "temperature": 0.2, "max_tokens": 300}


def test_bailian_asr_uses_http_for_sdk_uploaded_oss_input(monkeypatch, tmp_path):
    calls = {}

    def fake_request(method, url, *, headers, payload=None):
        calls.setdefault(method, []).append({"url": url, "headers": headers, "payload": payload})
        if method == "POST":
            return main.httpx.Response(200, json={"request_id": "submit-123", "output": {"task_id": "task-123", "task_status": "PENDING"}})
        return main.httpx.Response(200, json={
            "request_id": "fetch-123",
            "output": {"task_id": "task-123", "task_status": "SUCCEEDED", "results": [{
                "subtask_status": "FAILED", "code": "FILE_DOWNLOAD_FAILED", "message": "input unavailable",
            }]},
        })

    monkeypatch.setattr(main, "bailian_request", fake_request)
    pipeline = object.__new__(main.BailianPipeline)
    pipeline.key = "test-key"
    pipeline.workspace_id = "workspace-123"
    monkeypatch.setattr(pipeline, "stage", lambda *_: "oss://temporary/audio.wav")

    with pytest.raises(RuntimeError, match="ASR 任务失败"):
        pipeline.transcribe(tmp_path / "audio.wav")

    submit = calls["POST"][0]
    assert submit["url"] == "https://workspace-123.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/asr/transcription"
    assert submit["headers"]["X-DashScope-Async"] == "enable"
    assert submit["headers"]["X-DashScope-OssResourceResolve"] == "enable"
    assert submit["payload"]["input"]["file_urls"] == ["oss://temporary/audio.wav"]
    assert submit["payload"]["parameters"] == {"channel_id": [0], "language_hints": ["zh"]}
    assert calls["GET"][0]["url"].endswith("/tasks/task-123")


def test_bailian_task_error_uses_nested_safe_diagnostic():
    result = type("Result", (), {"code": None, "message": None, "request_id": None})()
    error = main.BailianPipeline._task_error(
        "ASR 任务失败",
        result,
        {"task_status": "FAILED", "error": {"error_code": "MODEL_NOT_ENABLED", "error_message": "模型未开通"}},
    )

    assert "code=MODEL_NOT_ENABLED" in error
    assert "message=模型未开通" in error
    assert "task_status=FAILED" in error


def test_cosyvoice_enrollment_uses_documented_workspace_http_api(tmp_path, monkeypatch):
    sample = tmp_path / "sample.wav"
    sample.write_bytes(b"sample-audio")
    calls = {}

    monkeypatch.setattr(main, "prepare_clone_sample", lambda *_: sample)

    def fake_request(method, url, *, headers, payload=None):
        calls.update({"method": method, "url": url, "headers": headers, "payload": payload})
        return main.httpx.Response(200, json={"request_id": "request-123", "output": {"voice_id": "cosyvoice-v3.5-plus-test-123"}})

    monkeypatch.setattr(main, "bailian_request", fake_request)
    pipeline = object.__new__(main.BailianPipeline)
    pipeline.key = "test-key"
    pipeline.workspace_id = "workspace-123"
    monkeypatch.setattr(pipeline, "stage", lambda *_: "oss://temporary/sample.wav")

    voice_id = pipeline.enroll_voice(sample, "job-123", allow_tunnel=True)

    assert voice_id == "cosyvoice-v3.5-plus-test-123"
    assert calls["method"] == "POST"
    assert calls["url"] == "https://workspace-123.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization"
    assert calls["headers"]["X-DashScope-OssResourceResolve"] == "enable"
    assert calls["payload"]["model"] == "voice-enrollment"
    assert calls["payload"]["input"]["target_model"] == "cosyvoice-v3.5-plus"
    assert calls["payload"]["input"]["url"] == "oss://temporary/sample.wav"


def test_voice_preview_stays_ready_when_optional_subtitle_alignment_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "jobs.json")
    monkeypatch.setattr(main, "JOBS_DIR", tmp_path / "jobs")
    store = main.JobStore()
    monkeypatch.setattr(main, "store", store)
    job = make_job("voice-preview")
    job.rewritten_text = "这是一段可以试听的口播文案。"
    job.script_confirmed = True
    store.add(job)
    work = main.JOBS_DIR / job.id
    work.mkdir(parents=True)
    sample = tmp_path / "sample.wav"
    sample.write_bytes(b"sample")

    def fake_clone(text, source, target, emotion, style=""):
        target.write_bytes(b"RIFFfake-audio")

    monkeypatch.setattr(main, "synthesize_voiceclone_with_mimo", fake_clone)
    monkeypatch.setattr(main, "duration_seconds", lambda _: 3.0)
    monkeypatch.setattr(main, "subtitle_asr_timeline", lambda _: (_ for _ in ()).throw(RuntimeError("ASR unavailable")))

    main.run_voice_preview(
        job.id, "upload", None, "standard", "natural", "mimo-v2.5-tts-voiceclone", "mimo-v2.5-tts",
        "s2-pro", "", 1.0, 0.0, 0.5, 0.7, True, "", custom_voice=sample,
    )

    assert job.status == "ready"
    assert job.preview_audio_name == "preview.wav"
    assert (work / "preview.wav").is_file()


def test_extract_upload_requires_authorization():
    from fastapi.testclient import TestClient

    client = TestClient(main.app)
    response = client.post("/api/projects/extract-upload", files={"video": ("a.mp4", b"00", "video/mp4")})

    assert response.status_code == 400
    assert "授权" in response.json()["detail"]


def test_extract_upload_rejects_non_video(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setattr(main, "JOBS_DIR", tmp_path)
    client = TestClient(main.app)
    response = client.post(
        "/api/projects/extract-upload",
        files={"video": ("a.txt", b"hello", "text/plain")},
        data={"reference_content_authorized": "true", "instruction": ""},
    )

    assert response.status_code == 400
    assert "视频" in response.json()["detail"]


def test_run_extraction_prepared_source_skips_download(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "jobs.json")
    monkeypatch.setattr(main, "JOBS_DIR", tmp_path)
    monkeypatch.setattr(main, "store", main.JobStore())
    downloads = []
    monkeypatch.setattr(main, "download", lambda *args, **kwargs: downloads.append(args))

    job = make_job("prepared-source")
    main.store.add(job)
    work = tmp_path / job.id
    work.mkdir()
    (work / "source.mp4").write_bytes(b"not-a-real-video")

    main.run_extraction(job.id)

    assert downloads == []
    updated = main.store.get(job.id)
    assert updated.status == "failed"
    assert updated.error


def test_cosyvoice_instruction_maps_speed_and_emotion():
    text = main.cosyvoice_instruction("fast", "warm")

    assert "语速稍快" in text
    assert "热情" in text
    assert "音色" in text


def test_normalize_clone_model_maps_legacy_alias():
    assert main.normalize_clone_model("qwen-voice") == "cosyvoice-v3.5-plus"
    assert main.normalize_clone_model("mimo-v2.5-tts-voiceclone") == "mimo-v2.5-tts-voiceclone"
    assert main.normalize_clone_model(None) == ""


def test_generic_compat_models_are_registered_as_text_only():
    assert main.infer_service_capability("paraformer-realtime-v2") == "chat"
    assert main.infer_service_capability("funaudiollm/cosyvoice2-0.5b") == "chat"
    assert main.infer_service_capability("qwen3.7-flash") == "chat"
