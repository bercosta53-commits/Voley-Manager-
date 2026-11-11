"""Banco SQLite (um arquivo só) e aplicação das migrações em abm/migracoes/, em ordem e uma vez só."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

MIGRACOES = Path(__file__).resolve().parent / "migracoes"


def conectar(caminho: str | Path) -> sqlite3.Connection:
    if str(caminho) != ":memory:":
        Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(caminho)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    return conn


def migrar(conn: sqlite3.Connection) -> list[str]:
    conn.execute("create table if not exists migracoes (nome text primary key, aplicada_em timestamp not null)")
    feitas = {r["nome"] for r in conn.execute("select nome from migracoes")}
    aplicadas = []
    for arquivo in sorted(MIGRACOES.glob("*.sql")):
        if arquivo.name in feitas:
            continue
        conn.executescript(arquivo.read_text(encoding="utf-8"))
        conn.execute("insert into migracoes (nome, aplicada_em) values (?, ?)", (arquivo.name, agora()))
        conn.commit()
        aplicadas.append(arquivo.name)
    return aplicadas


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def novo_id() -> str:
    return uuid.uuid4().hex[:12]
