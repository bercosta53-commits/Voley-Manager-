"""Simulação 3.2 canônica × 3.3-DC e variantes, sobre o snapshot real (somente leitura).

  cd radar_app/scripts && python3 -m vscs.simular --snapshot ~/privado/payload.json --hoje 2026-11-26 > ~/privado/simulacao-33.md

Variantes (todas com a mesma classificação 3.2):
  3.2 canônica                 K = 0,5 + bônus, decaimento exponencial
  DC sem maturação             DC sobre movimentos; liderança nomeada no decaimento exponencial
  DC + curva 3.1               liderança nomeada na curva 3.1 (0,6 até 90 d, pico em 365 d)
  DC + dupla janela (3.3)      proposta: liderança nomeada na dupla janela; vaga no decaimento convencional
  DC 3.3 sem agrupamento       mesma proposta, mas cada acontecimento é um movimento (mede o efeito do agrupamento)
Saída: distribuição por tier, Top 20 A/B, estabilidade de ranking, faixa 90+ com pendências, cortes de CQ-1.
O snapshot e a saída ficam FORA do repositório.
"""
from __future__ import annotations

import argparse
import copy
import statistics
from datetime import date

from . import motor32, motor33
from .reconciliar import carregar, eventos_da_conta, modelo_e_revisoes

FAIXAS = [(0, 19.99), (20, 39.99), (40, 54.99), (55, 69.99), (70, 84.99), (85, 89.99), (90, 100)]
CQ1 = {"A": 55, "B": 70}


def variantes(p33: dict) -> dict[str, dict]:
    sem = copy.deepcopy(p33)
    sem["lideranca_nomeada"] = {"diagnostico": {"ate_dia": 0, "fator": 1.0}, "transicao": {"ate_dia": 1, "fator_fim": 1.0},
                                "subida": {"ate_dia": 2}, "implementacao": {"ate_dia": 3, "fator": 1.0}, "meia_vida_depois": 60, "expira_dia": 183}
    c31 = copy.deepcopy(p33)
    c31["lideranca_nomeada"] = {"diagnostico": {"ate_dia": 90, "fator": 0.6}, "transicao": {"ate_dia": 227.5, "fator_fim": 0.8},
                                "subida": {"ate_dia": 365}, "implementacao": {"ate_dia": 450, "fator": 1.0}, "meia_vida_depois": 90, "expira_dia": 720}
    sem_grupo = copy.deepcopy(p33)
    sem_grupo["movimento"]["agrupar"] = False
    return {"DC sem maturação": sem, "DC + curva 3.1": c31, "DC + dupla janela (3.3)": p33, "DC 3.3 sem agrupamento": sem_grupo}


def percentil(v, p):
    v = sorted(v)
    if not v:
        return 0.0
    k = (len(v) - 1) * p
    i = int(k)
    return v[i] + (v[min(i + 1, len(v) - 1)] - v[i]) * (k - i)


def spearman(x, y):
    def ranks(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(v):
            j = i
            while j + 1 < len(v) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    rx, ry = ranks(x), ranks(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 1.0


def f2(v):
    return f"{v:.2f}".replace(".", ",")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--hoje")
    a = ap.parse_args()
    base = carregar(a.snapshot)
    hoje = date.fromisoformat(a.hoje or str(base.get("geradoEm", date.today().isoformat()))[:10])
    p32, p33 = motor33.parametros()
    p32, revs, _, _ = modelo_e_revisoes(base, p32)  # scoreModelo prevalece; revisões individuais preservadas
    vs = variantes(p33)
    linhas = []
    for c in base["contas"]:
        evs = eventos_da_conta(c, base.get("sinais", []))
        r = {"gravado": float(c.get("score") or 0), "3.2 canônica": motor32.calcular(evs, hoje, p32, c.get("interacoes"), revs, c)["vscs"]}
        detalhe = None
        for nome, pv in vs.items():
            res = motor33.calcular(evs, hoje, c.get("nome", ""), c.get("interacoes"), p32, pv, c, revs)
            r[nome] = res["vscs"]
            if nome == "DC + dupla janela (3.3)":
                detalhe = res
        linhas.append((c, r, detalhe))
    modelos = list(linhas[0][1]) if linhas else []
    out = [f"# Simulação VSCS 3.3-DC · referência {hoje.isoformat()} · {len(linhas)} contas", ""]
    for grupo, filtro in (("A/B", ("A", "B")), ("A", ("A",)), ("B", ("B",)), ("C", ("C",))):
        sub = [r for c, r, _ in linhas if c.get("tier") in filtro]
        if not sub:
            continue
        out += [f"## Tier {grupo} ({len(sub)} contas)", "", "| modelo | zeros | mediana | P90 | P95 | P99 | máx | ≥55 | ≥70 | ≥85 | ≥90 | " +
                " | ".join(f"{lo:.0f}–{hi:.0f}" for lo, hi in FAIXAS) + " |", "|---" + "|---:" * (11 + len(FAIXAS)) + "|"]
        for m in modelos:
            v = [r[m] for r in sub]
            out.append(f"| {m} | {sum(1 for x in v if x == 0)} | {f2(statistics.median(v))} | {f2(percentil(v, .9))} | {f2(percentil(v, .95))} | "
                       f"{f2(percentil(v, .99))} | {f2(max(v))} | {sum(x >= 55 for x in v)} | {sum(x >= 70 for x in v)} | {sum(x >= 85 for x in v)} | "
                       f"{sum(x >= 90 for x in v)} | " + " | ".join(str(sum(lo <= x <= hi for x in v)) for lo, hi in FAIXAS) + " |")
        out.append("")
    ab = [(c, r, d) for c, r, d in linhas if c.get("tier") in ("A", "B")]
    rec = "DC + dupla janela (3.3)"
    ref = "3.2 canônica"
    pos_ref = {c["id"]: i + 1 for i, (c, _, _) in enumerate(sorted(ab, key=lambda x: -x[1][ref]))}
    out += ["## Top 20 A/B na proposta 3.3", "", "| # | conta | tier | gravado | 3.2 canônica | 3.3 | Δ vs 3.2 | pos. 3.2 | movimentos (s, papel, regras) |", "|---:|---|---|---:|---:|---:|---:|---:|---|"]
    for i, (c, r, d) in enumerate(sorted(ab, key=lambda x: -x[1][rec])[:20]):
        movs = "; ".join(f"{m['acontecimentos'][0]['chave']} {f2(m['s'])} {m['papel']}" + (f" [{', '.join(sorted({v['regra'] for v in m['vinculos']}))}]" if m["vinculos"] else "")
                         for m in d["movimentos"][:3])
        out.append(f"| {i + 1} | {c.get('nome')} | {c.get('tier')} | {f2(r['gravado'])} | {f2(r[ref])} | {f2(r[rec])} | {f2(r[rec] - r[ref])} | {pos_ref[c['id']]} | {movs} |")
    out += ["", "## Estabilidade frente à 3.2 canônica (A/B)", "", "| modelo | Top 20 em comum | Spearman |", "|---|---:|---:|"]
    top_ref = {c["id"] for c, _, _ in sorted(ab, key=lambda x: -x[1][ref])[:20]}
    for m in modelos:
        top = {c["id"] for c, _, _ in sorted(ab, key=lambda x: -x[1][m])[:20]}
        out.append(f"| {m} | {len(top & top_ref)}/20 | {f2(spearman([r[ref] for _, r, _ in ab], [r[m] for _, r, _ in ab]))} |")
    out += ["", "## Faixa 90+ na proposta: contas que chegaram a 90 ou ficaram retidas em 89,9", ""]
    for c, r, d in ab:
        if d["vscs_base"] >= 90:
            out.append(f"- {c.get('nome')} ({c.get('tier')}): {f2(d['vscs'])} · pendências: {'; '.join(d['requisitos_90_pendentes']) or 'nenhuma'}")
    out += ["", "## Auditoria da maturação de liderança (revisar vínculo atual, mandato de receita e relevância comercial)", "",
            "Ganho = s com a dupla janela − s com decaimento convencional. Ordenado pelo ganho; inclui as suspensas.", "",
            "| conta | tier | cargo | dias | janela | maturação | s 3.3 | s convencional | ganho |", "|---|---|---|---:|---|---|---:|---:|---:|"]
    from .tempo import exponencial
    auditoria = []
    for c, r, d in linhas:
        for m in d["movimentos"]:
            for a in m["acontecimentos"]:
                if a.get("janela_lideranca") is None and not (a.get("maturacao") or "").startswith(("suspensa", "sem maturação")):
                    continue
                dias = (hoje - date.fromisoformat(a["data"])).days
                conv = a["base"] * a["fator_fonte"] * exponencial("lideranca", dias)
                auditoria.append((a["s"] - conv, c, a, dias, conv))
    for ganho, c, a, dias, conv in sorted(auditoria, key=lambda x: -x[0])[:40]:
        out.append(f"| {c.get('nome')} | {c.get('tier')} | {a.get('cargo') or a['chave']} | {dias} | {a.get('janela_lideranca') or '—'} | "
                   f"{a.get('maturacao') or '—'} | {f2(a['s'])} | {f2(conv)} | {f2(ganho)} |")
    out += ["", "## Cortes numéricos de CQ-1 (A ≥ 55, B ≥ 70) — elegibilidade exige as demais regras", "", "| modelo | cruzam | com contato bloqueado |", "|---|---:|---:|"]
    for m in modelos:
        cruzam = [c for c, r, _ in ab if r[m] >= CQ1[c["tier"]]]
        bloq = sum(1 for c in cruzam if any(str(p.get("statusValidacao", "")).upper().startswith("BLOQUEADO") for p in c.get("comite") or []))
        out.append(f"| {m} | {len(cruzam)} | {bloq} |")
    print("\n".join(out))


if __name__ == "__main__":
    main()
