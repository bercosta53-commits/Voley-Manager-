"""Fatores de tempo da 3.3.

- Fatos em geral: o decaimento exponencial da 3.0 (meia-vida por categoria, zero depois de 3 meias-vidas).
- VAGA aberta, inclusive de liderança: o mesmo decaimento convencional (categoria contratação). Vaga é intenção de
  contratar; ninguém amadurece no cargo antes de chegar.
- Liderança NOMEADA (pessoa no cargo): dupla janela comercial.
    diagnóstico     0–90 d    0,85   o líder novo monta o diagnóstico e o plano: janela para Diagnóstico/GTM
    transição      90–150 d   desce até 0,65   o plano está sendo executado com o time que existe
    subida        150–180 d   sobe até 1,00
    implementação 180–450 d   1,00   (6 a 15 meses) domínio do orçamento: janela para implementação e escala
    depois        meia-vida de 90 d; zero no dia 720
  Revisão da curva 3.1 (0,6 até 90 d, pico no dia 365): o pico chega no 6º mês, como pedido em 26/11, e o
  início deixa de ser "nada acontece" para virar a janela de diagnóstico.
"""
from __future__ import annotations

MEIA_VIDA_30 = {"lideranca": 60, "expansao": 90, "gtm": 60, "contratacao": 45, "estrategia": 60, "intencao": 15, "contexto": 30,
                "negativo": 90}


def exponencial(categoria: str, dias: int, antes: int = 0) -> float:
    if dias < 0:
        return 1.0 if -dias <= antes else 0.0
    mv = MEIA_VIDA_30.get(categoria, 60)
    return 0.0 if dias > 3 * mv else 0.5 ** (dias / mv)


def lideranca_nomeada(dias: int, p33: dict) -> float:
    c = p33["lideranca_nomeada"]
    if dias < 0:
        return 0.0
    d1, f1 = c["diagnostico"]["ate_dia"], c["diagnostico"]["fator"]
    d2, f2 = c["transicao"]["ate_dia"], c["transicao"]["fator_fim"]
    d3 = c["subida"]["ate_dia"]
    d4, f4 = c["implementacao"]["ate_dia"], c["implementacao"]["fator"]
    if dias <= d1:
        return f1
    if dias <= d2:
        return f1 + (f2 - f1) * (dias - d1) / (d2 - d1)
    if dias <= d3:
        return f2 + (f4 - f2) * (dias - d2) / (d3 - d2)
    if dias <= d4:
        return f4
    if dias > c["expira_dia"]:
        return 0.0
    return f4 * 0.5 ** ((dias - d4) / c["meia_vida_depois"])


def janela_lideranca(dias: int, p33: dict) -> str:
    c = p33["lideranca_nomeada"]
    if dias <= c["diagnostico"]["ate_dia"]:
        return "diagnostico"
    if dias <= c["subida"]["ate_dia"]:
        return "transicao"
    if dias <= c["implementacao"]["ate_dia"]:
        return "implementacao"
    return "residual"
