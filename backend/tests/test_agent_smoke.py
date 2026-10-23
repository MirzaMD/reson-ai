"""LLM smoke tests for configured provider integration."""

import os
import json
import pytest

from app.agent.provider import LLMError, OpenRouterLLM, get_llm
from scripts.llm_smoke import run_smoke


def test_llm_smoke_validates_successful_response(monkeypatch):
    class FakeLLM:
        def chat_json(self, system, messages):
            return {"ok": True, "echo": "resonai_test"}

    monkeypatch.setattr("scripts.llm_smoke.get_llm", lambda: FakeLLM())

    assert run_smoke("resonai_test") == {"ok": True, "echo": "resonai_test"}


def test_llm_smoke_rejects_incorrect_echo(monkeypatch):
    class FakeLLM:
        def chat_json(self, system, messages):
            return {"ok": True, "echo": "wrong"}

    monkeypatch.setattr("scripts.llm_smoke.get_llm", lambda: FakeLLM())

    with pytest.raises(LLMError, match="did not echo"):
        run_smoke("resonai_test")


def test_get_llm_selects_openrouter(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    assert isinstance(get_llm(), OpenRouterLLM)


def test_openrouter_client_sends_json_chat_request(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": '{"ok": true, "echo": "hello"}'}}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def post(self, url, headers, json):
            captured.update(url=url, headers=headers, body=json)
            return FakeResponse()

    monkeypatch.setattr("app.agent.provider.httpx.Client", FakeClient)
    client = OpenRouterLLM(api_key="test-key", model="provider/test-model")

    result = client.chat_json(
        system="Return JSON.",
        messages=[{"role": "user", "content": "Say hello."}],
    )

    assert result == {"ok": True, "echo": "hello"}
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["body"]["model"] == "provider/test-model"
    assert captured["body"]["response_format"] == {"type": "json_object"}
    assert captured["body"]["messages"][0] == {
        "role": "system",
        "content": "Return JSON.",
    }


@pytest.mark.llm
def test_configured_provider_smoke_live():
    if os.environ.get("RUN_LLM_TESTS") != "1":
        pytest.skip("Skipping LLM live test: RUN_LLM_TESTS=1 not set.")

    result = run_smoke("resonai_test")
    assert result.get("ok") is True
    assert "echo" in result
