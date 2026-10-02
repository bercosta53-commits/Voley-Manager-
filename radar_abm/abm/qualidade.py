"""Relatório de qualidade da base: o que falta em cada conta para os conectores funcionarem."""

from __future__ import annotations

import csv
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

from .identidade import normalizar_nome

# O que cada falta impede.
IMPACTO = {
    "sem_cnpj": "sem CNPJ, o conector CNPJ (sócios, capital, endereço) não roda",
    "sem_dominio": "sem site, a busca de notícias e o Apollo ficam menos precisos",
    "sem_uf": "sem UF, fica mais difícil separar homônimos de outros estados",
    "sem_pessoa": "sem pessoa no comitê, o Apollo não tem quem vigiar",
}


def relatorio(conn: sqlite3.Connection) -> dict:
    contas = conn.execute("select * from contas order by coalesce(tier, 'Z'), nome_fantasia").fetchall()
    com_pessoa = {r["conta_id"] for r in conn.execute("select distinct conta_id from pessoas")}
    faltas: dict[str, list] = defaultdict(list)
    invalidos = []
    for c in contas:
        if not c["cnpj"]:
            faltas["sem_cnpj"].append(c)
        if not c["dominio"]:
            faltas["sem_dominio"].append(c)
        if not c["uf"]:
            faltas["sem_uf"].append(c)
        if c["id"] not in com_pessoa:
            faltas["sem_pessoa"].append(c)
        extra = json.loads(c["contexto_json"] or "{}")
        if extra.get("cnpj_invalido"):
            invalidos.append((c, extra["cnpj_invalido"]))

    por_nome = defaultdict(list)
    for c in contas:
        por_nome[normalizar_nome(c["nome_fantasia"])].append(c["id"])
    return {
        "total": len(contas),
        "por_braco": _contar(contas, "braco_icp"),
        "por_tier": _contar(contas, "tier"),
        "faltas": faltas,
        "cnpj_invalidos": invalidos,
        "filiais": conn.execute("select * from filiais order by conta_id").fetchall(),
        "nomes_repetidos": {n: ids for n, ids in por_nome.items() if len(ids) > 1},
    }


def _contar(contas, campo: str) -> dict[str, int]:
    saida: dict[str, int] = defaultdict(int)
    for c in contas:
        saida[c[campo] or "(vazio)"] += 1
    return dict(sorted(saida.items()))


def imprimir(rel: dict, saida=print, limite: int = 10) -> None:
    saida(f"Contas na base: {rel['total']}")
    saida("  por braço do ICP: " + ", ".join(f"{k} {v}" for k, v in rel["por_braco"].items()))
    saida("  por tier:         " + ", ".join(f"{k} {v}" for k, v in rel["por_tier"].items()))
    saida("")
    for chave, impacto in IMPACTO.items():
        lista = rel["faltas"].get(chave, [])
        por_tier = _contar(lista, "tier")
        saida(f"{chave.replace('_', ' ').upper():<12} {len(lista):>4}   ({', '.join(f'{k}: {v}' for k, v in por_tier.items()) or '-'})")
        saida(f"             {impacto}")
    saida("")
    saida(f"CNPJ inválido (dígito verificador não bate): {len(rel['cnpj_invalidos'])}")
    for c, valor in rel["cnpj_invalidos"][:limite]:
        saida(f"  {c['id']:<8} {c['nome_fantasia']}: {valor}")
    saida(f"Duplicadas por CNPJ (juntadas; filiais registradas): {len(rel['filiais'])}")
    for f in rel["filiais"][:limite]:
        origem = f" (era a linha {f['mesclada_de']})" if f["mesclada_de"] else ""
        saida(f"  {f['cnpj']} -> conta {f['conta_id']}{origem}")
    saida(f"Nomes repetidos em contas diferentes (conferir): {len(rel['nomes_repetidos'])}")
    for nome, ids in list(rel["nomes_repetidos"].items())[:limite]:
        saida(f"  {nome}: {', '.join(ids)}")


def exportar_pendencias(conn: sqlite3.Connection, destino: str | Path) -> int:
    """Planilha das contas sem CNPJ ou sem site, tier A primeiro, pronta para preencher e reimportar."""
    linhas = conn.execute(
        """select id, nome_fantasia, tier, braco_icp, cidade, uf, cnpj, dominio from contas
           where cnpj is null or dominio is null order by coalesce(tier, 'Z'), nome_fantasia"""
    ).fetchall()
    with open(destino, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id_conta", "empresa", "tier", "braco_icp", "cidade", "uf", "cnpj", "site"])
        for r in linhas:
            w.writerow([r["id"], r["nome_fantasia"], r["tier"] or "", r["braco_icp"] or "", r["cidade"] or "", r["uf"] or "",
                        r["cnpj"] or "", r["dominio"] or ""])
    return len(linhas)
