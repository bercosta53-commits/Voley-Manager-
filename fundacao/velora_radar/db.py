"""Conexão e migrações. A URL vem de RADAR_DB_URL (Supabase ou Postgres local)."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

MIGRACOES = Path(__file__).resolve().parent.parent / "migrations"
URL_PADRAO = "postgresql://postgres@/radar?host=/tmp&port=5433"


def conectar(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or os.environ.get("RADAR_DB_URL", URL_PADRAO), row_factory=dict_row)


def migrar(conn: psycopg.Connection) -> list[str]:
    """Aplica, em ordem e uma única vez, os arquivos .sql de migrations/."""
    with conn.transaction():
        conn.execute(
            "create table if not exists migracao_aplicada (nome text primary key, aplicada_em timestamptz not null default now())"
        )
        feitas = {r["nome"] for r in conn.execute("select nome from migracao_aplicada")}
        aplicadas = []
        for arquivo in sorted(MIGRACOES.glob("*.sql")):
            if arquivo.name in feitas:
                continue
            conn.execute(arquivo.read_text(encoding="utf-8"))
            conn.execute("insert into migracao_aplicada (nome) values (%s)", (arquivo.name,))
            aplicadas.append(arquivo.name)
    return aplicadas
