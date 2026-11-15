from pathlib import Path
import os, subprocess, sys

def test_cold_http_import_does_not_load_unused_native_providers () -> None:

    source = """
import sys
from engine.http import App
assert App is not None
assert "PIL.Image" not in sys.modules
assert "pymongo" not in sys.modules
assert "aiokafka" not in sys.modules
"""
    result = subprocess.run(
        [sys.executable, "-c", source], capture_output=True, text=True, check=False,
        cwd=Path(__file__).resolve().parents[1], env=os.environ.copy(),
    )

    assert result.returncode == 0, result.stderr
