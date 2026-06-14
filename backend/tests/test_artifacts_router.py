import asyncio
from pathlib import Path

from starlette.requests import Request

import app.gateway.routers.artifacts as artifacts_router


def test_get_artifact_reads_utf8_text_file_on_windows_locale(tmp_path, monkeypatch) -> None:
    artifact_path = tmp_path / "note.txt"
    text = "Curly quotes: \u201cutf8\u201d"
    artifact_path.write_text(text, encoding="utf-8")

    original_read_text = Path.read_text

    def read_text_with_gbk_default(self, *args, **kwargs):
        kwargs.setdefault("encoding", "gbk")
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", read_text_with_gbk_default)
    monkeypatch.setattr(artifacts_router, "resolve_thread_virtual_path", lambda *args, **kwargs: artifact_path)

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "query_string": b"",
            "state": {"user_id": "test_user", "tenant_id": "tenant-a"},
        }
    )
    response = asyncio.run(artifacts_router.get_artifact("thread-1", "mnt/user-data/outputs/note.txt", request))

    assert bytes(response.body).decode("utf-8") == text
    assert response.media_type == "text/plain"


def test_get_pptx_preview(tmp_path, monkeypatch) -> None:
    artifact_path = tmp_path / "presentation.pptx"
    artifact_path.write_bytes(b"dummy zip content")

    # Mock resolve_thread_virtual_path
    monkeypatch.setattr(artifacts_router, "resolve_thread_virtual_path", lambda *args, **kwargs: artifact_path)

    # Mock convert_pptx_to_svg
    class DummySlide:
        def __init__(self, index, svg):
            self.index = index
            self.svg = svg

    class DummyResult:
        canvas_px = (1280.0, 720.0)
        slides = [DummySlide(1, "<svg>1</svg>"), DummySlide(2, "<svg>2</svg>")]

    def mock_convert(pptx_path, output_dir, options):
        return DummyResult()

    import sys
    from types import ModuleType

    mock_pptx_to_svg = ModuleType("pptx_to_svg")
    mock_pptx_to_svg.convert_pptx_to_svg = mock_convert

    mock_converter = ModuleType("pptx_to_svg.converter")
    class DummyConvertOptions:
        def __init__(self, **kwargs):
            pass
    mock_converter.ConvertOptions = DummyConvertOptions

    sys.modules["pptx_to_svg"] = mock_pptx_to_svg
    sys.modules["pptx_to_svg.converter"] = mock_converter

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "query_string": b"preview=true",
            "state": {"user_id": "test_user", "tenant_id": "tenant-a"},
        }
    )

    response = asyncio.run(artifacts_router.get_artifact("thread-1", "mnt/user-data/outputs/presentation.pptx", request))

    import json
    data = json.loads(response.body.decode("utf-8"))

    assert data["canvas_width"] == 1280.0
    assert data["canvas_height"] == 720.0
    assert len(data["slides"]) == 2
    assert data["slides"][0]["index"] == 1
    assert data["slides"][0]["svg"] == "<svg>1</svg>"

