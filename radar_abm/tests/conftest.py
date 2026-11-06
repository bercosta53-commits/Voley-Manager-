import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))
FIX = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def conn(tmp_path, monkeypatch):
    from abm import db

    monkeypatch.setenv("RADAR_LOGS", str(tmp_path / "logs"))
    c = db.conectar(tmp_path / "radar.db")
    db.migrar(c)
    yield c
    c.close()
