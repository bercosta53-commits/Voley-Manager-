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

from .classificar import (FORA_DE_RECEITA, LIDERANCA, OPERACIONAL, base_bloco, cargo_do_evento, chave_canonica, evidencia_clevel,
                          familia_cargo, marco_historico, nivel_cargo, norm, papel_na_aquisicao)  # noqa: E402

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


def _montar(chave: str, base: float, p: dict, categoria: str | None = None, cargo: str = "", origem: str = "inferido") -> dict:
    """Classificação a partir de uma chave (canônica ou legada): tipo, categoria, nível e flags vêm da chave."""
    chave = chave_canonica(chave)
    pr = s30.P.get(chave)
    if chave.startswith("nomeacao_"):
        nivel = chave.split("_", 1)[1]
        tipo, cat, vaga, nomeacao = "troca_lideranca", "lideranca", False, True
    elif chave.startswith("troca_lideranca"):
        nivel = {"troca_lideranca_ceo": "ceo", "troca_lideranca_clevel": "clevel_outro"}.get(chave)
        tipo, cat, vaga, nomeacao = "troca_lideranca", "lideranca", False, True
    elif chave.startswith("vaga_"):
        nivel = chave.split("_", 1)[1]
        tipo = "vaga_lideranca_alvo" if nivel in LIDERANCA else "vaga_area_alvo"
        cat, vaga, nomeacao = "contratacao", True, False
    else:
        nivel, tipo, cat, vaga, nomeacao = None, (pr.tipo if pr else chave), (pr.categoria if pr else "contexto"), False, False
    return {"chave": chave, "tipo": tipo, "categoria": categoria or cat, "base": base, "nivel": nivel,
            "familia": familia_cargo(cargo) if cargo else "receita", "cargo": cargo, "vaga": vaga, "nomeacao": nomeacao,
            # o que já foi classificado (revisão ou registro) não é reagrupado em bloco nem reinterpretado
            "operacional": origem == "inferido" and nivel in OPERACIONAL, "origem": origem,
            "revisado": origem == "revisao", "registrado": origem == "registro"}


def _base_da_chave(chave: str, p: dict) -> float:
    chave = chave_canonica(chave)
    if chave == "vaga_bloco":
        return p["blocos_operacionais"]["duas"]
    if chave.startswith(("vaga_", "nomeacao_")):
        return p["cargos_receita"].get(chave.split("_", 1)[1], 0)
    if chave == "troca_lideranca_ceo":
        return p["lideranca_fora_de_receita"]["ceo_socio"]
    if chave == "troca_lideranca_clevel":
        return p["lideranca_fora_de_receita"]["clevel_outro"]
    return p["bases_30"].get(chave, s30.P[chave].base if chave in s30.P else 0)


def classificar(ev: dict, p: dict) -> dict | None:
    """Evento → classificação ou None (não pontua). Ordem de autoridade:
    1. revisão individual (scoreModelo.revisoesPorSinal), inclusive pontua=false;
    1b. calibração registrada no próprio sinal (sinal.calibracao): base 0, ou só motivo, = não pontua;
        base > 0 = base decidida para o sinal;
    2. classificação registrada no snapshot (v2.contribuicoes: chave, base, categoria, fonte, data);
    3. decisão registrada de não pontuar (sinal com tipoSpec, categoria e nivel nulos gravados pelo motor);
    4. inferência pelo texto, só para sinal nunca classificado."""
    tipo = ev["tipo"]
    rev = ev.get("_revisao") or {}
    if rev.get("pontua") is False:
        return None
    if rev.get("chave"):
        base = rev["base"] if rev.get("base") is not None else _base_da_chave(rev["chave"], p)
        return _montar(rev["chave"], base, p, rev.get("categoria"), norm(rev.get("cargo") or ""), "revisao")
    cal = ev.get("calibracao") if isinstance(ev.get("calibracao"), dict) else {}
    if cal and (cal.get("base") == 0 or ("base" not in cal and cal.get("motivo"))):
        # decisão de calibração registrada no sinal: absorvido num bloco (agrupadoEm), dupla contagem, contexto
        # aceito sem pontuação automática ou fora da janela — não pontua
        return None
    reg = ev.get("_registro") or {}
    if reg.get("chave"):
        base = reg["base"] if reg.get("base") is not None else _base_da_chave(reg["chave"], p)
        return _montar(reg["chave"], base, p, reg.get("categoria"), norm(ev.get("cargo") or ""), "registro")
    if "tipoSpec" in ev and ev.get("tipoSpec") is None and ev.get("categoria") is None and "nivel" in ev and ev.get("nivel") is None:
        return None  # o motor já decidiu que este sinal não pontua (contexto encerrado, notícia genérica)
    if tipo in ("vaga_area_alvo", "vaga_lideranca_alvo"):
        nivel, texto, _ = _nivel(ev)
        if nivel is None:
            if FORA_DE_RECEITA.search(texto):
                return None  # vaga de CFO, CTO, TI: não é contratação de receita
            nivel = "head" if tipo == "vaga_lideranca_alvo" else "sdr_bdr"
        if cal.get("base"):
            return _montar(f"vaga_{nivel}", cal["base"], p, cargo=texto, origem="registro")
        return _montar(f"vaga_{nivel}", p["cargos_receita"][nivel], p, cargo=texto)
    if tipo in ("executivo_chegou", "troca_lideranca", "troca_diretoria", "novo_cmo"):
        nivel, texto, _ = _nivel(ev)
        if nivel in LIDERANCA:
            return _montar(f"nomeacao_{nivel}", p["cargos_receita"][nivel], p, cargo=texto)
        chave = s30.nivelar(dict(ev, tipo="executivo_chegou", sinal=texto, porQueAgora=""))
        if chave in ("troca_lideranca_ceo", "troca_lideranca_clevel"):
            return _montar(chave, _base_da_chave(chave, p), p, cargo=texto)
        return None
    if tipo == "fusao_aquisicao":
        papel = papel_na_aquisicao(f'{ev.get("sinal", "")} {ev.get("porQueAgora", "")}', ev.get("_empresa") or "")
        if papel == "sofrida":
            return _montar("foi_adquirida", p["bases_30"]["foi_adquirida"], p)
    chave = s30.nivelar(ev)
    if not chave or chave not in s30.P:
        return None
    if cal.get("base"):  # base decidida na calibração do sinal prevalece sobre a da tabela
        cl = _montar(chave, cal["base"], p, origem="registro")
        return cl
    if chave == "declaracao_meta" and marco_historico(f'{ev.get("sinal", "")} {ev.get("porQueAgora", "")}'):
        chave = "declaracao_generica"  # número de resultado passado não é meta futura
    cl = _montar(chave, _base_da_chave(chave, p), p)
    if cl["categoria"] == "contexto" and p.get("contexto", {}).get("exige_classificacao_explicita", True):
        return None  # evento, palestra, prêmio: só pontuam com classificação explícita (revisão ou registro)
    return cl


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
    texto_ev: dict[str, dict] = {}
    for ev, cl in classificados:
        pr = s30.Param(cl["tipo"], cl["categoria"], cl["base"], s30.P[cl["chave"]].antes if cl["chave"] in s30.P else 0)
        reg = ev.get("_registro") or {}
        data = str(reg.get("data") or ev["data"])[:10]
        dias = (hoje - date.fromisoformat(data)).days
        fonte = float(reg["fonte"]) if reg.get("fonte") is not None else s30.fator_fonte(ev)  # fonte efetiva preservada
        c = s30.Contribuicao(cl["chave"], cl["tipo"], cl["categoria"], pr.nivel, cl["base"], fonte,
                             round(_tempo(pr, dias, p), 4), 1.0, 0.0, data, ev.get("sinal") or ev.get("porQueAgora", ""),
                             ev.get("id") or ev.get("url", ""))
        texto_ev[c.id] = ev
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
    # declaração encerrada só quando o fato posterior executa a MESMA decisão (mesmo lugar, texto próximo ou
    # movimentoId igual); uma vaga de liderança qualquer não encerra uma meta de crescimento (correção de 26/11)
    fatos = [c for c in contrs if c.categoria == "expansao" and c.tipo != "declaracao_expansao" or c.tipo == "vaga_lideranca_alvo"]
    contrs = [c for c in contrs if not (c.tipo == "declaracao_expansao" and any(
        f.data >= c.data and mesma_decisao(texto_ev.get(c.id, {}), texto_ev.get(f.id, {})) for f in fatos))]
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


def mesma_decisao(a: dict, b: dict) -> bool:
    from .agrupar import _jaccard, _lugares, _tokens
    if a.get("movimentoId") and a.get("movimentoId") == b.get("movimentoId"):
        return True
    ta = f'{a.get("sinal", "")} {a.get("porQueAgora", "")}'
    tb = f'{b.get("sinal", "")} {b.get("porQueAgora", "")}'
    return bool(_lugares(ta) & _lugares(tb)) or _jaccard(_tokens(ta), _tokens(tb)) >= 0.3


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


def _anotar(e: dict, rev: dict | None, reg: dict | None, empresa: str | None) -> dict:
    if not (rev or reg or empresa):
        return e
    e = dict(e)
    if rev:
        e["_revisao"] = rev
    if reg:
        e["_registro"] = reg
    if empresa:
        e["_empresa"] = empresa
    return e


def _prod(it):
    r = 1.0
    for x in it:
        r *= x
    return r


def calcular(eventos: list[dict], hoje: date, p: dict | None = None, interacoes: list[dict] | None = None,
             revisoes: dict[str, dict] | None = None, conta: dict | None = None) -> dict:
    """`revisoes` = scoreModelo.revisoesPorSinal normalizado; `conta` dá o registro de classificação (v2.contribuicoes)
    e o nome da empresa (sujeito × objeto em aquisições). Revisão > registro > inferência."""
    from .adaptador import registro_por_sinal
    p = p or parametros()
    revisoes = revisoes or {}
    registro = registro_por_sinal(conta)
    empresa = (conta or {}).get("nome")
    eventos = [_anotar(e, revisoes.get(str(e.get("id"))), registro.get(str(e.get("id"))), empresa) for e in eventos]
    cs = contribuicoes(eventos, hoje, p, interacoes)
    return vscs(cs, p) | {"contribuicoes": [replace(c).__dict__ | {"s": round(c.s, 2), "pontos": round(c.marginal, 2)} for c in cs]}
