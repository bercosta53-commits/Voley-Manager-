"""VSCS 3.2 canônico ("contexto-cargos"): o motor 3.0 de score_v2.py com a tabela de cargos de receita e os blocos
de vagas operacionais da 3.2. Parâmetros em parametros_32.json; reconciliar.py confere contra o snapshot real.

Mesma fórmula de agregação da 3.0 (K·s em noisy-OR, correlação 1/0,7/0,5, bônus +5/+8, maior penalidade) e o
mesmo decaimento exponencial. Muda a classificação:
- vaga ou nomeação de receita: peso pela senioridade (SDR 20 … C-level 95);
- vagas operacionais distintas em 30 dias formam um bloco (2 = 30, 3–4 = 50, 5+ = 70) que SUBSTITUI as vagas;
- republicação da mesma vaga não conta de novo nem renova a data.
"""
from __future__ import annotations

import json
import sys
from dataclasses import replace
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
import score_v2 as s30  # noqa: E402

from .classificar import (FORA_DE_RECEITA, LIDERANCA, OPERACIONAL, base_bloco, cargo_do_evento, evidencia_clevel, familia_cargo,
                          nivel_cargo, norm)  # noqa: E402

VERSAO = "vscs-3.2-contexto-cargos"


def parametros(caminho: Path | None = None) -> dict:
    return json.loads((caminho or AQUI / "parametros_32.json").read_text(encoding="utf-8"))


def _nivel(ev: dict) -> tuple[str | None, str, str]:
    """(nível, cargo, origem) pelo cargo do ocupante ou da vaga; VP só vira C-level com evidência registrada."""
    cargo, origem = cargo_do_evento(ev)
    nivel = nivel_cargo(cargo)
    if nivel == "diretoria_receita" and evidencia_clevel(ev):
        nivel = "clevel_receita"
    return nivel, cargo, origem


def classificar(ev: dict, p: dict) -> dict | None:
    """Evento → {chave, tipo, categoria, base, operacional, nivel, familia} ou None (não pontua)."""
    tipo = ev["tipo"]
    rev = ev.get("_revisao") or {}
    if rev.get("pontua") is False:
        return None  # revisão individual: o sinal não pontua
    if rev.get("chave") and (rev.get("base") is not None or rev["chave"] in s30.P):
        return _da_revisao(ev, rev, p)
    if tipo in ("vaga_area_alvo", "vaga_lideranca_alvo"):
        nivel, texto, _ = _nivel(ev)
        if nivel is None:
            if FORA_DE_RECEITA.search(texto):
                return None  # vaga de CFO, CTO, TI: não é contratação de receita
            nivel = "head" if tipo == "vaga_lideranca_alvo" else "sdr_bdr"
        base = p["cargos_receita"][nivel]
        return {"chave": f"vaga_{nivel}", "tipo": "vaga_lideranca_alvo" if nivel in LIDERANCA else "vaga_area_alvo",
                "categoria": "contratacao", "base": base, "operacional": nivel in OPERACIONAL, "nivel": nivel,
                "familia": familia_cargo(texto), "vaga": True, "cargo": texto}
    if tipo in ("executivo_chegou", "troca_lideranca", "troca_diretoria", "novo_cmo"):
        nivel, texto, _ = _nivel(ev)
        if nivel in LIDERANCA:
            return {"chave": f"nomeacao_{nivel}", "tipo": "troca_lideranca", "categoria": "lideranca",
                    "base": p["cargos_receita"][nivel], "operacional": False, "nivel": nivel, "familia": familia_cargo(texto),
                    "nomeacao": True, "cargo": texto}
        chave = s30.nivelar(ev) if tipo == "executivo_chegou" else None
        if chave == "troca_lideranca_ceo":
            return {"chave": chave, "tipo": "troca_lideranca", "categoria": "lideranca",
                    "base": p["lideranca_fora_de_receita"]["ceo_socio"], "operacional": False, "nivel": "ceo", "familia": "receita", "nomeacao": True}
        if chave == "troca_lideranca_clevel":
            return {"chave": chave, "tipo": "troca_lideranca", "categoria": "lideranca",
                    "base": p["lideranca_fora_de_receita"]["clevel_outro"], "operacional": False, "nivel": "clevel_outro", "familia": "outro", "nomeacao": True}
        return None
    chave = s30.nivelar(ev)
    if not chave or chave not in s30.P:
        return None
    pr = s30.P[chave]
    base = p["bases_30"].get(chave, pr.base)
    return {"chave": chave, "tipo": pr.tipo, "categoria": pr.categoria, "base": base, "operacional": False, "nivel": None, "familia": None}


def _da_revisao(ev: dict, rev: dict, p: dict) -> dict:
    """Revisão individual registrada no Supabase (scoreModelo.revisoesPorSinal): prevalece sobre a inferência."""
    chave = rev["chave"]
    pr = s30.P.get(chave)
    nivel = rev.get("nivel") or (chave.split("_", 1)[1] if chave.startswith(("vaga_", "nomeacao_")) else None)
    categoria = rev.get("categoria") or (pr.categoria if pr else ("lideranca" if chave.startswith("nomeacao_") else "contratacao"))
    tipo = pr.tipo if pr else ("troca_lideranca" if chave.startswith("nomeacao_") else "vaga_area_alvo")
    base = rev["base"] if rev.get("base") is not None else (pr.base if pr else p["cargos_receita"].get(nivel or "", 0))
    cargo = norm(rev.get("cargo") or "")
    return {"chave": chave, "tipo": tipo, "categoria": categoria, "base": base, "operacional": nivel in OPERACIONAL,
            "nivel": nivel, "familia": familia_cargo(cargo) if cargo else "receita", "cargo": cargo,
            "vaga": chave.startswith("vaga_"), "nomeacao": chave.startswith("nomeacao_") or categoria == "lideranca", "revisado": True}


def _blocos(itens: list[tuple[dict, dict]], p: dict) -> list[tuple[dict, dict]]:
    """Vagas operacionais distintas (por título normalizado) em janelas de 30 dias viram um bloco."""
    janela = p["blocos_operacionais"]["janela_dias"]
    distintas: dict[str, tuple[dict, dict]] = {}
    for ev, cl in sorted(itens, key=lambda x: x[0]["data"]):
        k = norm(ev.get("sinal") or ev.get("titulo") or ev.get("porQueAgora", ""))
        if k not in distintas:  # republicação: fica a data da primeira
            distintas[k] = (ev, cl)
    ordem = sorted(distintas.values(), key=lambda x: x[0]["data"])
    out, grupo = [], []

    def fechar(g):
        if not g:
            return
        qtd = sum(max(1, int(ev.get("qtdVagas") or 1)) for ev, _ in g)
        maior = max(cl["base"] for _, cl in g)  # especialista GTM sozinho (35) vale mais que um bloco de 2 (30)
        base = max(base_bloco(qtd, p), maior)
        ev0 = max(g, key=lambda x: x[0]["data"])[0]
        ids = [ev.get("id") or ev.get("url", "") for ev, _ in g]
        ev_bloco = {**ev0, "id": "bloco:" + "+".join(sorted(ids)), "grupo": "bloco:" + "+".join(sorted(ids)),
                    "sinal": f"Bloco de {qtd} vaga(s) operacional(is) em {janela} dias" if qtd > 1 else ev0.get("sinal", "")}
        out.append((ev_bloco, {"chave": "vaga_bloco" if qtd > 1 else g[0][1]["chave"], "tipo": "vaga_area_alvo", "categoria": "contratacao",
                               "base": base, "operacional": True, "nivel": "bloco" if qtd > 1 else g[0][1]["nivel"],
                               "familia": g[0][1]["familia"], "vaga": True, "componentes": ids, "qtd": qtd}))

    for ev, cl in ordem:
        if grupo and (date.fromisoformat(ev["data"][:10]) - date.fromisoformat(grupo[0][0]["data"][:10])).days > janela:
            fechar(grupo)
            grupo = []
        grupo.append((ev, cl))
    fechar(grupo)
    return out


def contribuicoes(eventos: list[dict], hoje: date, p: dict | None = None, interacoes: list[dict] | None = None) -> list[s30.Contribuicao]:
    p = p or parametros()
    evs = list(eventos) + [{"tipo": i["tipo"], "data": i["data"], "interacao": True, "sinal": i.get("rotulo") or i["tipo"],
                            "id": f'int-{i["tipo"]}-{i["data"]}'} for i in (interacoes or [])]
    classificados, operacionais = [], []
    for ev in evs:
        if ev.get("interacao"):
            chave = s30.INTERACAO_CHAVE.get(ev["tipo"])
            if not chave:
                continue
            pr = s30.P[chave]
            cl = {"chave": chave, "tipo": pr.tipo, "categoria": pr.categoria, "base": p["bases_30"].get(chave, pr.base), "operacional": False}
        else:
            cl = classificar(ev, p)
        if not cl:
            continue
        (operacionais if cl["operacional"] else classificados).append((ev, cl))
    classificados += _blocos(operacionais, p)

    por_evento: dict[str, s30.Contribuicao] = {}
    for ev, cl in classificados:
        pr = s30.Param(cl["tipo"], cl["categoria"], cl["base"], s30.P[cl["chave"]].antes if cl["chave"] in s30.P else 0)
        dias = (hoje - date.fromisoformat(ev["data"][:10])).days
        c = s30.Contribuicao(cl["chave"], cl["tipo"], cl["categoria"], pr.nivel, cl["base"], s30.fator_fonte(ev),
                             round(_tempo(pr, dias, p), 4), 1.0, 0.0, ev["data"][:10], ev.get("sinal") or ev.get("porQueAgora", ""),
                             ev.get("id") or ev.get("url", ""))
        if c.pre <= 0:
            continue
        grupo = ev.get("grupo") or ev.get("url") or c.id or f"{c.chave}-{c.data}"
        if grupo not in por_evento or c.pre > por_evento[grupo].pre:
            por_evento[grupo] = c
    por_texto: dict[tuple[str, str], s30.Contribuicao] = {}
    for c in por_evento.values():
        k = (c.chave, norm(c.texto) or c.id)
        if k not in por_texto or c.pre > por_texto[k].pre:
            por_texto[k] = c
    contrs = list(por_texto.values())
    fatos = [c for c in contrs if c.categoria == "expansao" and c.tipo != "declaracao_expansao" or c.tipo == "vaga_lideranca_alvo"]
    contrs = [c for c in contrs if not (c.tipo == "declaracao_expansao" and any(f.data >= c.data for f in fatos))]
    por_cat: dict[str, list[s30.Contribuicao]] = {}
    for c in contrs:
        por_cat.setdefault(c.categoria, []).append(c)
    corr = p["correlacao"]
    for itens in por_cat.values():
        itens.sort(key=lambda x: -x.pre)
        for i, c in enumerate(itens):
            c.correlacao = corr[min(i, len(corr) - 1)]
            c.s = min(100.0, c.pre * c.correlacao)
    contrs = sorted((c for c in contrs if c.s > 0), key=lambda c: -c.s)
    resto, K = 1.0, p["K"]
    for c in contrs:
        if c.categoria in s30.CATEGORIAS_NEGATIVAS:
            continue
        c.marginal = 100 * resto * K * c.s / 100
        resto *= 1 - K * c.s / 100
    return contrs


def _tempo(pr: s30.Param, dias: int, p: dict) -> float:
    if dias < 0:
        return 1.0 if -dias <= pr.antes else 0.0
    mv = p["meia_vida"][pr.categoria]
    return 0.0 if dias > 3 * mv else 0.5 ** (dias / mv)


def vscs(contrs: list[s30.Contribuicao], p: dict | None = None) -> dict:
    p = p or parametros()
    K = p["K"]
    pos = [c for c in contrs if c.categoria not in s30.CATEGORIAS_NEGATIVAS]
    base = 100 * (1 - _prod(1 - K * c.s / 100 for c in pos))
    cv = p["convergencia"]
    fortes = [c for c in pos if c.s >= cv["s_minimo"]]
    m = 0
    for a in fortes:
        d0 = date.fromisoformat(a.data)
        m = max(m, len({c.categoria for c in fortes if 0 <= (date.fromisoformat(c.data) - d0).days <= cv["janela_dias"]}))
    bonus = cv["bonus_tres_ou_mais"] if m >= 3 else cv["bonus_duas"] if m == 2 else 0
    pen = max((c.s for c in contrs if c.categoria in s30.CATEGORIAS_NEGATIVAS), default=0.0)
    v = round(max(0.0, min(100.0, base + bonus) - pen), 2)
    return {"versao": VERSAO, "vscs": v, "vscs_base": round(base, 2), "bonus_convergencia": bonus, "penalidade": round(pen, 2)}


def _prod(it):
    r = 1.0
    for x in it:
        r *= x
    return r


def calcular(eventos: list[dict], hoje: date, p: dict | None = None, interacoes: list[dict] | None = None,
             revisoes: dict[str, dict] | None = None) -> dict:
    """`revisoes` = scoreModelo.revisoesPorSinal normalizado (adaptador.revisoes): a revisão individual prevalece."""
    p = p or parametros()
    if revisoes:
        eventos = [dict(e, _revisao=revisoes[str(e.get("id"))]) if str(e.get("id")) in revisoes else e for e in eventos]
    cs = contribuicoes(eventos, hoje, p, interacoes)
    return vscs(cs, p) | {"contribuicoes": [replace(c).__dict__ | {"s": round(c.s, 2), "pontos": round(c.marginal, 2)} for c in cs]}
