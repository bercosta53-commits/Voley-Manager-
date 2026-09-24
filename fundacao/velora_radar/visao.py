"""A planilha como visão do banco: exporta vw_planilha para CSV ou XLSX."""

from __future__ import annotations

import csv
from pathlib import Path

import psycopg


def linhas_planilha(conn: psycopg.Connection) -> list[dict]:
    return conn.execute("select * from vw_planilha order by coalesce(abc, 'Z'), empresa").fetchall()


def exportar(conn: psycopg.Connection, caminho: str | Path) -> int:
    caminho = Path(caminho)
    linhas = linhas_planilha(conn)
    colunas = [c.name for c in conn.execute("select * from vw_planilha limit 0").description]
    if caminho.suffix.lower() == ".xlsx":
        from openpyxl import Workbook

        wb = Workbook()
        aba = wb.active
        aba.title = "Contas"
        aba.append(colunas)
        for l in linhas:
            aba.append([str(l[c]) if l[c] is not None and not isinstance(l[c], (int, float, str)) else l[c] for c in colunas])
        wb.save(caminho)
    else:
        with caminho.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=colunas, delimiter=";")
            w.writeheader()
            w.writerows(linhas)
    return len(linhas)
