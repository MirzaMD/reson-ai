"""End-to-end integration test running the complete demo workflow.

Marked 'slow' as it runs the full pipeline including optimization and validation suite.
"""

import pytest
from scripts.e2e_smoke import run_e2e_smoke

pytestmark = pytest.mark.slow


def test_full_demo_e2e_workflow():
    """Verify health -> presets -> drone design -> analyze -> response_at -> optimize -> re-analyze -> agent -> validate."""
    steps = run_e2e_smoke()
    assert len(steps) == 9
    for name, status, ms in steps:
        assert status == "OK", f"Step '{name}' failed with status '{status}'"
