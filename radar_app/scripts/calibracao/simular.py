"""Simulação da calibração do VSCS (proposta 3.3, NÃO vigente). Somente leitura.

Uso:
  python3 -I scripts/calibracao/simular.py --casos                 # casos do documento + contrafactuais
  python3 -I scripts/calibracao/simular.py --snapshot payload.json  # base inteira (payload de radar_snapshots)

O snapshot real NUNCA entra no repositório: passe um caminho fora dele (ex.: ~/privado/payload.json). A saída é
Markdown no stdout, com nomes de contas: trate como material interno.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modelos import Contrib, atual, curva_d, dc, k_integral, tempo_30  # noqa: E402

MODELOS = {
    "A atual (K=0,5)": lambda cs, b: atual(cs, b),
    "K=0,75": lambda cs, b: atual(cs, b, 0.75),
    "K=1": lambda cs, b: k_integral(cs, b),
    "K=1 + curva D": lambda cs, b: curva_d(cs, b),
    "DC conservador (a=0,75 b=0,5)": lambda cs, b: dc(cs, 0.75, 0.5),
    "DC recomendado (a=0,85 b=0,6)": lambda cs, b: dc(cs),
    "DC sensível (a=0,9 b=0,7)": lambda cs, b: dc(cs, 0.9, 0.7),
}
FAIXAS = [(0, 19.99), (20, 39.99), (40, 54.99), (55, 69.99), (70, 84.99), (85, 89.99), (90, 100)]
CQ1 = {"A": 55, "B": 70}


def bonus_30(cs: list[Contrib]) -> int:
    """Bônus de convergência do motor 3.0: categorias distintas com s ≥ 40 numa janela de 45 dias."""
    fortes = [c for c in cs if c.s >= 40 and c.categoria != "negativo" and c.data]
    m = 0
    for a in fortes:
        d0 = date.fromisoformat(a.data[:10])
        m = max(m, len({c.categoria for c in fortes if 0 <= (date.fromisoformat(c.data[:10]) - d0).days <= 45}))
    return 8 if m >= 3 else 5 if m == 2 else 0


def tab(cab: list[str], linhas: list[list]) -> str:
    out = ["| " + " | ".join(cab) + " |", "|" + "|".join("---:" if i else "---" for i in range(len(cab))) + "|"]
    out += ["| " + " | ".join(str(x) for x in l) + " |" for l in linhas]
    return "\n".join(out)


def f2(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


# ---------------------------------------------------------------- casos do documento e contrafactuais

HOJE = date(2026, 11, 26)


def c(base, categoria, fonte=1.0, dias=0, correlacao=1.0, tempo=None, texto=""):
    t = tempo_30(categoria, dias) if tempo is None else tempo
    data = (HOJE - timedelta(days=max(dias, 0))).isoformat()
    return Contrib(base * fonte * t * correlacao, categoria, data, base, fonte, t, correlacao, texto=texto)


CASOS_REAIS = {
    # casos ILUSTRATIVOS (números redondos, nenhuma conta real): os valores reais ficam só na saída privada
    "Caso 1: liderança (secundária) + meta + vagas": ([Contrib(50, "lideranca", "2026-10-26", 80, .85, .735), Contrib(45, "expansao", "2026-11-01", 65, .85, .814),
                                                      Contrib(18, "contratacao", "2026-11-16", 20, 1, .9), Contrib(4, "contratacao", "2026-10-06", 20, .6, .46, .7)], 5),
    "Caso 2: gerência + oferta nova + liderança antiga": ([Contrib(60, "contratacao", "2026-11-16", 70, 1), Contrib(40, "estrategia", "2026-10-12", 65, 1),
                                                          Contrib(11, "lideranca", "2026-06-15", 85, .85), Contrib(7, "lideranca", "2026-07-27", 50, .85)], 0),
    "Caso 3: expansão efetiva isolada": ([Contrib(77, "expansao", "2026-11-13", 85, 1, .905)], 0),
}

def _com_31() -> dict:
    """Os mesmos casos com a maturação de liderança da 3.1 (PR 44, curva confirmada em 26/11). A correlação dentro da
    categoria é refeita (1º = 1, 2º = 0,7) porque a ordem pode mudar."""
    from modelos import tempo_31_lideranca
    out = {}
    for nome, (cs, _) in CASOS_REAIS.items():
        novos = []
        for x in cs:
            if x.categoria == "lideranca" and x.base:
                dias = (HOJE - date.fromisoformat(x.data)).days
                t = tempo_31_lideranca(dias)
                novos.append(Contrib(x.base * x.fonte * t, x.categoria, x.data, x.base, x.fonte, t, 1.0))
            else:
                novos.append(x)
        lid = sorted((x for x in novos if x.categoria == "lideranca"), key=lambda x: -x.s)
        refeitos = [Contrib(x.s * (1.0 if i == 0 else 0.7), x.categoria, x.data, x.base, x.fonte, x.tempo, 1.0 if i == 0 else 0.7) for i, x in enumerate(lid)]
        out[nome + " · 3.1"] = ([x for x in novos if x.categoria != "lideranca"] + refeitos, None)
    return out


CONTRAFACTUAIS = [
    ("SDR isolado, primário, hoje", [c(20, "contratacao")]),
    ("5 republicações do mesmo SDR (dedup: 1 evento)", [c(20, "contratacao")]),
    ("5 republicações SEM dedup (o que não pode acontecer)", [c(20, "contratacao", correlacao=k) for k in (1, .7, .5, .5, .5)]),
    ("Bloco de 5 vagas reais distintas", [c(70, "contratacao")]),
    ("Meta de 67% de crescimento (quantificada)", [c(65, "expansao")]),
    ("Novo CRO, primário, hoje (decaimento 3.0)", [c(95, "lideranca")]),
    ("Novo CRO, primário, hoje (maturação 3.1: 0,6)", [c(95, "lideranca", tempo=.6)]),
    ("Novo CRO há 9 meses (maturação 3.1: ~0,89)", [c(95, "lideranca", tempo=.6 + .4 * (270 - 90) / 275)]),
    ("Nova filial", [c(75, "expansao")]),
    ("Lançamento simples", [c(65, "estrategia")]),
    ("Nova vertical", [c(75, "estrategia")]),
    ("Expansão comercial efetiva (6 profissionais)", [c(85, "expansao")]),
    ("Dois independentes: CRO + expansão efetiva", [c(95, "lideranca"), c(85, "expansao")]),
    ("Três fortes: CRO + expansão + bloco de vagas", [c(95, "lideranca"), c(85, "expansao"), c(70, "contratacao")]),
    ("Head (secundária, 30 d) + meta (secundária) + SDR", [c(80, "lideranca", .85, 30), c(65, "expansao", .85, 25), c(20, "contratacao", 1, 9)]),
    ("Mesmo fato em dois veículos (dedup: 1 evento)", [c(85, "expansao", .85)]),
    ("Head 80 + aquisição pela controladora (−30)", [c(80, "lideranca"), Contrib(30, "negativo")]),
    ("Evento expirado (> 3 meias-vidas)", [c(85, "expansao", dias=300)]),
    ("Intenção direta: pedido de diagnóstico", [c(100, "intencao")]),
    ("Quatro sinais médios (exposição pública alta)", [c(50, "estrategia"), c(50, "contexto"), c(45, "gtm"), c(40, "estrategia", correlacao=.7)]),
]


def casos() -> str:
    nomes = list(MODELOS)
    partes = ["## Casos ilustrativos", ""]
    linhas = []
    for nome, (cs, bonus) in CASOS_REAIS.items():
        linhas.append([nome] + [f2(MODELOS[m](cs, bonus)) for m in nomes])
    partes += [tab(["Conta"] + nomes, linhas), ""]

    partes += ["## Os mesmos casos com a maturação de liderança da 3.1", ""]
    linhas = []
    for nome, (cs, _) in _com_31().items():
        linhas.append([nome] + [f2(MODELOS[m](cs, bonus_30(cs))) for m in nomes])
    partes += [tab(["Conta"] + nomes, linhas), ""]

    partes += ["## Robustez de data (caso 1): todas as datas deslocadas ±7/15 dias, decaimento 3.0", ""]
    cs0, b0 = CASOS_REAIS["Caso 1: liderança (secundária) + meta + vagas"]
    linhas = []
    for delta in (-15, -7, 0, 7, 15):
        cs = []
        for x in cs0:
            dias = (HOJE - date.fromisoformat(x.data)).days + delta
            t = tempo_30(x.categoria, dias)
            cs.append(Contrib(x.base * x.fonte * t * x.correlacao, x.categoria, (HOJE - timedelta(days=dias)).isoformat(), x.base, x.fonte, t, x.correlacao))
        linhas.append([f"{delta:+d} d"] + [f2(MODELOS[m](cs, bonus_30(cs))) for m in nomes])
    partes += [tab(["Deslocamento"] + nomes, linhas), ""]

    partes += ["## Sensibilidade à fonte (caso 1): secundária 0,85 → 0,95", ""]
    cs = [Contrib(x.s / x.fonte * (0.95 if x.fonte == .85 else x.fonte), x.categoria, x.data) for x in cs0]
    partes += [tab(["Fonte secundária"] + nomes, [["0,85"] + [f2(MODELOS[m](cs0, b0)) for m in nomes],
                                                   ["0,95"] + [f2(MODELOS[m](cs, bonus_30(cs))) for m in nomes]]), ""]

    partes += ["## Contrafactuais (pesos 3.2, fonte primária e fato de hoje salvo indicação)", ""]
    linhas = [[n] + [f2(MODELOS[m](cs, bonus_30(cs))) for m in nomes] for n, cs in CONTRAFACTUAIS]
    partes += [tab(["Cenário"] + nomes, linhas), ""]
    return "\n".join(partes)


# ---------------------------------------------------------------- base inteira

def ler_snapshot(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8") as f:
        dados = json.load(f)
    payload = dados.get("payload", dados)
    return payload["contas"]


def contribs_da_conta(conta: dict) -> tuple[list[Contrib], float, float]:
    v2 = conta.get("v2") or {}
    cs = [Contrib(float(x.get("s") or 0), x.get("categoria") or "", (x.get("data") or "")[:10], float(x.get("base") or 0),
                  float(x.get("fonte") or 1), float(x.get("tempo") or 1), float(x.get("correlacao") or 1), x.get("tipo") or "",
                  x.get("texto") or "") for x in v2.get("contribuicoes") or []]
    return cs, float(v2.get("bonus_convergencia") or 0), float(conta.get("score") or 0)


def percentil(v: list[float], p: float) -> float:
    if not v:
        return 0.0
    v = sorted(v)
    k = (len(v) - 1) * p
    i = int(k)
    return v[i] + (v[min(i + 1, len(v) - 1)] - v[i]) * (k - i)


def spearman(x: list[float], y: list[float]) -> float:
    def ranks(v):
        ordem = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(v):
            j = i
            while j + 1 < len(v) and v[ordem[j + 1]] == v[ordem[i]]:
                j += 1
            for k in range(i, j + 1):
                r[ordem[k]] = (i + j) / 2
            i = j + 1
        return r
    rx, ry = ranks(x), ranks(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 1.0


def base_inteira(caminho: str) -> str:
    contas = ler_snapshot(caminho)
    nomes = list(MODELOS)
    res = []
    divergentes = []
    for ct in contas:
        cs, bonus, score = contribs_da_conta(ct)
        r = {m: MODELOS[m](cs, bonus) for m in nomes}
        if abs(r[nomes[0]] - score) > 0.05:
            divergentes.append((ct.get("nome"), score, r[nomes[0]]))
        res.append((ct, cs, r))
    out = [f"# Simulação na base inteira ({len(contas)} contas)", ""]
    out += [f"Reprodução do score gravado com a fórmula atual: {len(contas) - len(divergentes)} de {len(contas)} batem (±0,05).", ""]
    if divergentes:
        out += ["Divergências (corrigir antes de calibrar):", "", tab(["Conta", "Gravado", "Recalculado"], [[n, f2(a), f2(b)] for n, a, b in divergentes[:30]]), ""]

    for grupo, filtro in (("A/B", lambda t: t in ("A", "B")), ("A", lambda t: t == "A"), ("B", lambda t: t == "B"), ("C", lambda t: t == "C")):
        sub = [(ct, r) for ct, _, r in res if filtro(ct.get("tier"))]
        if not sub:
            continue
        out += [f"## Distribuição: Tier {grupo} ({len(sub)} contas)", ""]
        linhas = []
        for m in nomes:
            v = [r[m] for _, r in sub]
            hist = [sum(1 for x in v if lo <= x <= hi) for lo, hi in FAIXAS]
            linhas.append([m, sum(1 for x in v if x == 0), f2(statistics.median(v)), f2(percentil(v, .9)), f2(percentil(v, .95)),
                           f2(percentil(v, .99)), f2(max(v))] + hist)
        out += [tab(["Modelo", "zeros", "mediana", "P90", "P95", "P99", "máx"] + [f"{lo:.0f}–{hi:.0f}" for lo, hi in FAIXAS], linhas), ""]

    ab = [(ct, cs, r) for ct, cs, r in res if ct.get("tier") in ("A", "B")]
    base_m, rec = nomes[0], "DC recomendado (a=0,85 b=0,6)"
    pos_antiga = {id(ct): i + 1 for i, (ct, _, _) in enumerate(sorted(ab, key=lambda x: -x[2][base_m]))}
    novo = sorted(ab, key=lambda x: -x[2][rec])
    out += ["## Top 20 A/B no modelo recomendado", ""]
    linhas = []
    for i, (ct, cs, r) in enumerate(novo[:20]):
        principais = "; ".join(f"{(x.tipo or x.categoria)} {f2(x.s)}" for x in sorted(cs, key=lambda x: -x.s)[:3])
        linhas.append([i + 1, ct.get("nome"), ct.get("tier"), f2(r[base_m]), f2(r[rec]), f2(r[rec] - r[base_m]), pos_antiga[id(ct)], principais])
    out += [tab(["#", "Conta", "Tier", "Atual", "Proposto", "Δ", "Pos. antiga", "Principais contribuições (s)"], linhas), ""]

    out += ["## Estabilidade do ranking A/B frente ao atual", ""]
    linhas = []
    top_base = {id(x[0]) for x in sorted(ab, key=lambda x: -x[2][base_m])[:20]}
    for m in nomes[1:]:
        top_m = {id(x[0]) for x in sorted(ab, key=lambda x: -x[2][m])[:20]}
        rho = spearman([x[2][base_m] for x in ab], [x[2][m] for x in ab])
        linhas.append([m, f"{len(top_base & top_m)}/20", f2(rho), sum(1 for x in ab if x[2][m] >= 90)])
    out += [tab(["Modelo", "Sobreposição Top 20", "Spearman", "≥ 90"], linhas), ""]

    out += ["## Cortes numéricos de CQ-1 (A ≥ 55, B ≥ 70) — só o número; elegibilidade exige as demais regras", ""]
    linhas = []
    for m in nomes:
        n = sum(1 for ct, _, r in ab if r[m] >= CQ1[ct.get("tier")])
        bloqueio = sum(1 for ct, _, r in ab if r[m] >= CQ1[ct.get("tier")] and any(
            str(p.get("statusValidacao", "")).upper().startswith("BLOQUEADO") for p in ct.get("comite") or []))
        linhas.append([m, n, bloqueio])
    out += [tab(["Modelo", "Cruzam o corte", "… com contato bloqueado no comitê"], linhas), ""]
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", action="store_true")
    ap.add_argument("--snapshot")
    a = ap.parse_args()
    if a.snapshot:
        print(base_inteira(a.snapshot))
    if a.casos or not a.snapshot:
        print(casos())
