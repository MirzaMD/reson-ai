"""LLM smoke tests for Gemini provider integration."""

import os
import pytest

from scripts.llm_smoke import run_smoke


@pytest.mark.llm
def test_gemini_smoke_live():
    if os.environ.get("RUN_LLM_TESTS") != "1":
        pytest.skip("Skipping LLM live test: RUN_LLM_TESTS=1 not set.")

    result = run_smoke("resonai_test")
    assert result.get("ok") is True
    assert "echo" in result
