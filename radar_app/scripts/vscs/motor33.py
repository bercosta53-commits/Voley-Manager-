"""VSCS 3.3-DC (proposta em teste, NÃO publicar): dominante + corroboração sobre MOVIMENTOS independentes.

Pipeline por conta:
  1. classificação 3.2 (tabela de cargos, blocos de vagas) — motor32.classificar
  2. fonte pela taxonomia 3.3 (fontes.py) e tempo 3.3 (tempo.py): liderança NOMEADA na dupla janela;
     vaga aberta, inclusive de liderança, no decaimento convencional
  3. documentos → acontecimentos (corroboração documental sobe a fonte) → movimentos (agrupar.py)
  4. intensidade do movimento: s_M = min(s₁ + teto, 100·[1 − (1 − s₁/100)·Π(1 − γ·s_k/100)])
  5. DC entre movimentos:
        principal = 100·[1 − (1 − a·S₁/100)·Π_{j=2..1+M}(1 − b·c_j·S_j/100)]
        c_j = 0,7 quando o movimento repete a categoria de outro já escolhido, senão 1
        (dominante e corroboradores = a combinação de maior valor; garante monotonia)
        contexto  = a·max(S de contexto)          (contexto não corrobora)
        VSCS      = limitar(max(principal, contexto) − maior penalidade, 0, 100)
  6. faixa 90+: se VSCS ≥ 90 e algum requisito falhar, o score fica em 89,9 com o motivo gravado

O tier nunca entra no cálculo.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from . import motor32
from .agrupar import Acontecimento, Documento, Movimento, acontecimentos, movimentos
from .adaptador import adaptar, registro_por_sinal
from .classificar import nivel_cargo, norm
from .fontes import classificar_fonte, corroborar, testemunhos
from .tempo import exponencial, janela_lideranca, lideranca_nomeada
from .missao import selecionar as selecionar_missao

AQUI = Path(__file__).resolve().parent
VERSAO = "vscs-3.3-dc"
NEGATIVO = "negativo"


def parametros() -> tuple[dict, dict]:
    return motor32.parametros(), json.loads((AQUI / "parametros_33.json").read_text(encoding="utf-8"))


MATURAVEIS = {"gerencia", "head", "diretoria_receita", "clevel_receita"}  # mandato de receita com orçamento
STATUS_SEM_VINCULO = ("BLOQUEADO", "RECONFIRMAR_VINCULO")


def _pessoas_do_acontecimento(ac: Acontecimento) -> set[str]:
    nomes = set()
    for d in ac.docs:
        for n in (d.ev.get("pessoa"), (d.ev.get("abordar") or {}).get("nome"), (d.ev.get("_revisao") or {}).get("pessoa")):
            if n and norm(n).strip():
                nomes.add(norm(n).strip())
    return nomes


def relacionamento(ac: Acontecimento, conta: dict | None, relacionamentos: dict | None, hoje: date, p33: dict) -> dict | None:
    """Relação da Velora com a pessoa NOMEADA (escala 0–5), vinda da tabela privada de relacionamentos (por nome
    normalizado) ou do comitê da conta (pessoa.relacionamento). Só para nomeação de liderança; registro com mais
    de `validade_dias` não vale. Devolve {nota, fator, em, rotulo} ou None."""
    cfg = p33.get("relacionamento") or {}
    if cfg.get("alcance") == "nomeacao" and not ac.cl.get("nomeacao"):
        return None
    nomes = _pessoas_do_acontecimento(ac)
    if not nomes:
        return None
    candidatos = []
    for nome, r in (relacionamentos or {}).items():
        if norm(nome).strip() in nomes:
            candidatos.append(r)
    for pes in (conta or {}).get("comite") or []:
        if norm(pes.get("nome", "")).strip() in nomes and isinstance(pes.get("relacionamento"), dict):
            candidatos.append(pes["relacionamento"])
    melhor = None
    for r in candidatos:
        try:
            nota = int(r.get("nota"))
        except (TypeError, ValueError):
            continue
        em = str(r.get("em") or "")[:10]
        if not em or (hoje - date.fromisoformat(em)).days > cfg.get("validade_dias", 365) or not 0 <= nota <= 5:
            continue
        if melhor is None or nota > melhor["nota"]:
            melhor = {"nota": nota, "fator": float(cfg["fatores"][str(nota)]), "em": em, "rotulo": cfg.get("rotulos", {}).get(str(nota))}
    return melhor


def vinculo_atual(ac: Acontecimento, conta: dict | None, hoje: date, rel: dict | None = None) -> tuple[bool, str]:
    """O executivo ainda ocupa o cargo de receita? Sem confirmação, a maturação não se aplica.
    Ordem: revisão/campo vinculoAtual → vinculoConfirmadoEm (até 180 d) → pessoa no comitê da conta com cargo de
    receita e status que não peça reconfirmação."""
    ev = ac.docs[0].ev
    # quem registrou a relação com a pessoa confirmou, naquela data, que ela está no cargo
    if rel and rel["nota"] >= 1 and (hoje - date.fromisoformat(rel["em"])).days <= 180:
        return True, f"vínculo confirmado pelo registro de relacionamento em {rel['em']}"
    for d in ac.docs:
        v = d.ev.get("vinculoAtual")
        if v is not None:
            return (bool(v), "vínculo confirmado no registro" if v else "registro: executivo não está mais no cargo")
        em = d.ev.get("vinculoConfirmadoEm")
        if em and (hoje - date.fromisoformat(str(em)[:10])).days <= 180:
            return True, f"vínculo confirmado em {str(em)[:10]}"
    nome = norm(ev.get("pessoa") or "")
    if nome and conta:
        for pes in conta.get("comite") or []:
            if norm(pes.get("nome", "")) != nome:
                continue
            st = str(pes.get("statusValidacao") or "").upper()
            if st.startswith(STATUS_SEM_VINCULO):
                return False, f"comitê: {st.lower()}"
            if nivel_cargo(norm(pes.get("cargo", ""))) not in MATURAVEIS:
                return False, "comitê: cargo atual sem mandato de receita"
            return True, "no comitê com cargo de receita"
    return False, "sem confirmação de vínculo atual"


def _tempo(ac: Acontecimento, hoje: date, p33: dict, conta: dict | None = None, rel: dict | None = None) -> tuple[float, str | None, str | None]:
    """(fator, janela, maturação). Vaga e fatos em geral: decaimento convencional. Liderança nomeada: dupla janela
    só com mandato de receita e, depois dos 90 dias, vínculo atual confirmado; senão, decaimento convencional."""
    dias = (hoje - ac.data).days
    if ac.cl.get("nomeacao"):
        conv = exponencial("lideranca", dias)
        janela = janela_lideranca(dias, p33)
        if ac.cl.get("nivel") not in MATURAVEIS:
            return conv, None, f"sem maturação: cargo sem mandato de receita ({ac.cl.get('nivel') or 'não identificado'})"
        if dias <= p33["lideranca_nomeada"]["diagnostico"]["ate_dia"]:
            return lideranca_nomeada(dias, p33), janela, "janela de diagnóstico"
        ok, motivo = vinculo_atual(ac, conta, hoje, rel)
        if not ok:
            return min(conv, lideranca_nomeada(dias, p33)), janela, f"suspensa: {motivo}"
        return lideranca_nomeada(dias, p33), janela, f"aplicada: {motivo}"
    antes = 30 if ac.cl["chave"].startswith(("presenca_", "palestra_")) else 0
    return exponencial(ac.cl["categoria"], dias, antes), None, None


def _prod(it):
    r = 1.0
    for x in it:
        r *= x
    return r


def preparar(eventos: list[dict], hoje: date, empresa: str = "", p32: dict | None = None, p33: dict | None = None,
             interacoes: list[dict] | None = None, conta: dict | None = None,
             revisoes: dict[str, dict] | None = None, relacionamentos: dict | None = None) -> tuple[list[Movimento], list[tuple[str, str, str]]]:
    if p32 is None or p33 is None:
        p32, p33 = parametros()
    revisoes = revisoes or {}
    registro = registro_por_sinal(conta)
    eventos = [adaptar(e, revisoes.get(str(e.get("id"))), p33, registro.get(str(e.get("id"))), (conta or {}).get("nome") or empresa)
               for e in eventos]
    evs = list(eventos) + [{"tipo": i["tipo"], "data": i["data"], "interacao": True, "sinal": i.get("rotulo") or i["tipo"],
                            "id": f'int-{i["tipo"]}-{i["data"]}'} for i in (interacoes or [])]
    docs, operacionais = [], []
    for ev in evs:
        if ev.get("interacao"):
            chave = motor32.s30.INTERACAO_CHAVE.get(ev["tipo"])
            if not chave:
                continue
            pr = motor32.s30.P[chave]
            cl = {"chave": chave, "tipo": pr.tipo, "categoria": pr.categoria, "base": p32["bases_30"].get(chave, pr.base), "operacional": False}
        else:
            cl = motor32.classificar(ev, p32)
        if not cl:
            continue
        (operacionais if cl["operacional"] else docs).append((ev, cl))
    docs += motor32._blocos(operacionais, p32)
    documentos = []
    for ev, cl in docs:
        nivel, fator = classificar_fonte(ev, p33)
        if fator <= 0:
            continue
        did = ev.get("id") or ev.get("url") or f'{cl["chave"]}-{ev["data"]}'
        documentos.append(Documento(did, ev, cl, date.fromisoformat(ev["data"][:10]), nivel, fator, testemunhos(ev, nivel, did, p33)))
    acs = acontecimentos(documentos, p33["movimento"]["janela_acontecimento_dias"], p33["movimento"]["janela_vinculo_dias"])
    for ac in acs:
        ac.fonte_nivel, ac.fonte_fator = corroborar([(d.fonte_nivel, d.fonte_fator) for d in ac.docs], [x for d in ac.docs for x in d.testemunhas], p33)
        ac.relacionamento = relacionamento(ac, conta, relacionamentos, hoje, p33)
        ac.tempo, ac.janela, ac.maturacao = _tempo(ac, hoje, p33, conta, ac.relacionamento)
        fator_rel = ac.relacionamento["fator"] if ac.relacionamento else 1.0
        # a relação só amplifica um fato que já existe (s = 0 continua 0) e não vira corroboração independente
        ac.missao = selecionar_missao(ac, p33.get("missao", {}).get("habilitada", False), hoje)
        fator_missao = ac.missao["fator"] if ac.missao else 1.0
        ac.s = min(100.0, ac.cl["base"] * ac.fonte_fator * ac.tempo * fator_rel * fator_missao)
    acs = [a for a in acs if a.s > 0]
    if p33["movimento"].get("agrupar", True):
        movs, possiveis = movimentos(acs, empresa, p33["movimento"]["janela_vinculo_dias"])
    else:  # variante de comparação: cada acontecimento vira um movimento (sem agrupamento causal)
        movs, possiveis = [Movimento(id=a.id, acontecimentos=[a]) for a in acs], []
    g, teto = p33["movimento"]["gamma_execucao"], p33["movimento"]["teto_execucao"]
    for m in movs:
        vivos = sorted((a for a in m.acontecimentos if not a.superado_por), key=lambda a: -a.s)
        if not vivos:
            m.s = 0.0
            continue
        s1 = vivos[0].s
        m.s = min(s1 + teto, 100 * (1 - (1 - s1 / 100) * _prod(1 - g * a.s / 100 for a in vivos[1:])), 100.0)
        m.categoria = vivos[0].cl["categoria"]
    return [m for m in movs if m.s > 0], possiveis


def _valor(escolha: list[Movimento], a: float, b: float, rep: float) -> tuple[float, list[float]]:
    pesos, cats = [], []
    for i, m in enumerate(escolha):
        c = rep if m.categoria in cats else 1.0
        pesos.append((a if i == 0 else b * c) * m.s / 100)
        cats.append(m.categoria)
    return 100 * (1 - _prod(1 - x for x in pesos)), pesos


def agregar(movs: list[Movimento], p33: dict) -> tuple[float, float, list[tuple[Movimento, float]]]:
    """Devolve (principal, contexto, [(movimento, parcela)]) — as parcelas fecham com max(principal, contexto).

    O dominante e os até M corroboradores são a combinação que dá o maior valor (máximo sobre as escolhas). Isso
    garante monotonia: acrescentar um movimento, ou fortalecer um, nunca derruba o score — o que a escolha gulosa
    "três maiores" não garante quando a mesma categoria vale 0,7."""
    from itertools import combinations

    dc = p33["dc"]
    a, b, M, rep = dc["a"], dc["b"], dc["max_corroboradores"], dc["mesma_categoria"]
    pos = sorted((m for m in movs if m.categoria not in (NEGATIVO, *dc["nao_corrobora"])), key=lambda m: -m.s)
    melhor, escolha, pesos = 0.0, [], []
    for i, dom in enumerate(pos):
        outros = pos[:i] + pos[i + 1:]
        for k in range(0, min(M, len(outros)) + 1):
            for comb in combinations(outros, k):
                # corroboradores de categoria nova primeiro: a ordem não muda o produto, só a parcela exibida
                ordem = [dom] + sorted(comb, key=lambda m: (m.categoria == dom.categoria, -m.s))
                v, ps = _valor(ordem, a, b, rep)
                if v > melhor + 1e-12:
                    melhor, escolha, pesos = v, ordem, ps
    ctx = [m for m in movs if m.categoria in dc["nao_corrobora"]]
    contexto = a * max((m.s for m in ctx), default=0.0)
    if contexto > melhor:
        return melhor, contexto, [(max(ctx, key=lambda m: m.s), contexto)]
    resto, parcelas = 1.0, []
    for m, x in zip(escolha, pesos):
        parcelas.append((m, 100 * resto * x))
        resto *= 1 - x
    return melhor, contexto, parcelas


def requisitos_90(parcelas: list[tuple[Movimento, float]], possiveis: list, pen: float, hoje: date, p33: dict) -> list[str]:
    """Condições necessárias para a faixa 90–100. Lista vazia = todas cumpridas."""
    f = p33["faixa_90"]
    falta = []
    movs = [m for m, _ in parcelas]
    if len(movs) < 2:
        return ["precisa de dois movimentos independentes"]
    dom, cor = movs[0], movs[1]
    if pen > 0:
        falta.append("há sinal negativo ativo (penalidade)")
    for m, papel, fonte_min in ((dom, "dominante", f["fonte_minima_dominante"]), (cor, "corroborador", f["fonte_minima_corroborador"])):
        principal = max((a for a in m.acontecimentos if not a.superado_por), key=lambda a: a.s)
        if m.s < f["materialidade_minima"]:
            falta.append(f"{papel}: materialidade abaixo de {f['materialidade_minima']}")
        if m.categoria not in f["categorias_gtm"]:
            falta.append(f"{papel}: sem conexão direta com Growth, Vendas ou GTM ({m.categoria})")
        if principal.fonte_fator < fonte_min:
            falta.append(f"{papel}: fonte {principal.fonte_nivel} abaixo do exigido")
        if any(d.ev.get("dataEstimada") for d in principal.docs):
            falta.append(f"{papel}: data estimada")
        if principal.cl.get("nomeacao"):
            # especificação: só as janelas de diagnóstico e de implementação; transição e residual ficam fora
            if principal.janela not in ("diagnostico", "implementacao"):
                falta.append(f"{papel}: liderança em {principal.janela or 'sem janela'}, fora das janelas de diagnóstico e implementação")
            if (principal.maturacao or "").startswith(("suspensa", "sem maturação")):
                falta.append(f"{papel}: maturação {principal.maturacao}")
        else:
            janela = p33["janela_acao_dias"].get(principal.cl["tipo"], p33["janela_acao_dias"]["padrao"])
            if (hoje - principal.data).days > janela:
                falta.append(f"{papel}: fora da janela de ação ({janela} dias)")
    ids_dom = {a.id for a in dom.acontecimentos}
    ids_cor = {a.id for a in cor.acontecimentos}
    if any((x in ids_dom and y in ids_cor) or (x in ids_cor and y in ids_dom) for x, y, _ in possiveis):
        falta.append("independência não confirmada entre dominante e corroborador (possível vínculo)")
    return falta


def calcular(eventos: list[dict], hoje: date, empresa: str = "", interacoes: list[dict] | None = None,
             p32: dict | None = None, p33: dict | None = None, conta: dict | None = None,
             revisoes: dict[str, dict] | None = None, relacionamentos: dict | None = None) -> dict:
    """`conta` só é lida para o comitê (vínculo atual do executivo); o tier nunca entra no cálculo."""
    if p32 is None or p33 is None:
        p32, p33 = parametros()
    movs, possiveis = preparar(eventos, hoje, empresa, p32, p33, interacoes, conta, revisoes, relacionamentos)
    principal, contexto, parcelas = agregar(movs, p33)
    pen = max((m.s for m in movs if m.categoria == NEGATIVO), default=0.0)
    v = max(0.0, min(100.0, max(principal, contexto)) - pen)
    falta = []
    if v >= 90:
        falta = requisitos_90(parcelas, possiveis, pen, hoje, p33)
        if p33.get("missao", {}).get("habilitada", False) and any((a.missao or {}).get("fator", 1) > 1 for m in movs for a in m.acontecimentos):
            from copy import deepcopy
            sem = deepcopy(p33)
            sem["missao"]["habilitada"] = False
            controle = calcular(eventos, hoje, empresa, interacoes, p32, sem, conta, revisoes, relacionamentos)
            if not controle["excepcional"]:
                falta.append("faixa 90+ não elegível sem amplificação de missão")
        if falta:
            v = min(v, p33["faixa_90"]["teto_sem_requisitos"])
    papel = {m.id: ("dominante" if i == 0 else "corroborador") for i, (m, _) in enumerate(parcelas)}
    parcela = {m.id: x for m, x in parcelas}
    return {
        "versao": VERSAO,
        "vscs": round(v, 2),
        "vscs_base": round(max(principal, contexto), 2),
        "bonus_convergencia": 0,
        "penalidade": round(pen, 2),
        "excepcional": v >= 90,
        "requisitos_90_pendentes": falta,
        "movimentos": [{
            "id": m.id, "s": round(m.s, 2), "categoria": m.categoria, "papel": papel.get(m.id, "fora"),
            "pontos": round(parcela.get(m.id, 0.0), 2),
            "vinculos": [{"de": x, "para": y, "regra": r} for x, y, r in m.vinculos],
            "acontecimentos": [{
                "id": a.id, "chave": a.cl["chave"], "categoria": a.cl["categoria"], "base": a.cl["base"], "data": a.data.isoformat(),
                "fonte": a.fonte_nivel, "fator_fonte": a.fonte_fator, "tempo": round(a.tempo, 4), "janela_lideranca": a.janela,
                "maturacao": a.maturacao, "cargo": a.cl.get("cargo"), "revisado": bool(a.cl.get("revisado")),
                # só nota, fator e data: quem registrou fica na tabela privada
                "relacionamento": ({k: a.relacionamento[k] for k in ("nota", "fator", "em", "rotulo")} if a.relacionamento else None),
                "missao": a.missao,
                "s": round(a.s, 2), "documentos": [d.id for d in a.docs], "superado_por": a.superado_por,
            } for a in sorted(m.acontecimentos, key=lambda a: -a.s)],
        } for m in sorted(movs, key=lambda m: -m.s)],
        "possiveis_vinculos": [{"de": x, "para": y, "regra": r} for x, y, r in possiveis],
    }
