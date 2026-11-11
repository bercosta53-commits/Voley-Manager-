"""Versões da rubrica de fit. Cada contato guarda a versão que o motivou, para calibrar depois.

A versão inicial parte do documento do Radar (ICP e critérios ABC). A rubrica do agente do ChatGPT
entra como nova versão quando for portada; só uma versão fica ativa por vez.
"""

from __future__ import annotations

import json

import psycopg

RUBRICA_INICIAL = {
    "nome": "v1 · documento do Radar",
    "criterios": {
        "icp": {
            "bracos": {
                "prof": "Serviços profissionais B2B de alta complexidade",
                "fin": "Serviços financeiros, exceto investimentos",
                "tech": "Tecnologia B2B madura",
            },
            "regioes": ["SP", "PR", "SC", "RS"],
            "fora": ["saúde", "gestoras de investimento"],
        },
        "abc": {
            "A": "Fit máximo com o ICP: complexidade, porte e acesso ao decisor.",
            "B": "Fit bom, com alguma ressalva de porte, momento ou acesso.",
            "C": "Fit parcial: entra na cadência só com sinal.",
        },
    },
    "pesos": {
        "sinal": {"forte": 3, "medio": 1.5, "negativo": -3},
        "validade_dias": 30,
        "bonus_combinacao": 0.25,
        "fora_do_braco": 0.6,
        "limiar_forte": 3,
    },
}


def registrar(conn: psycopg.Connection, nome: str, criterios: dict, pesos: dict, observacao: str = "", ativar: bool = True) -> int:
    with conn.transaction():
        if ativar:
            conn.execute("update rubrica_versao set ativa = false where ativa")
        r = conn.execute(
            """insert into rubrica_versao (nome, criterios, pesos, observacao, ativa)
               values (%s, %s::jsonb, %s::jsonb, %s, %s) returning id""",
            (nome, json.dumps(criterios, ensure_ascii=False), json.dumps(pesos), observacao, ativar),
        ).fetchone()
    return r["id"]


def ativa(conn: psycopg.Connection) -> dict | None:
    return conn.execute("select * from rubrica_versao where ativa").fetchone()


def garantir_inicial(conn: psycopg.Connection) -> int:
    atual = ativa(conn)
    if atual:
        return atual["id"]
    return registrar(conn, **RUBRICA_INICIAL, observacao="Critérios do documento Radar de Sinais Velora.")
