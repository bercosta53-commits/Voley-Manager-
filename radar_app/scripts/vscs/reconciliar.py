"""Reconciliação da 3.2 canônica com o snapshot real (somente leitura).

  cd radar_app/scripts && python3 -m vscs.reconciliar --snapshot ~/privado/payload.json --hoje 2026-11-26 > ~/privado/reconciliacao.md

Lê payload.scoreModelo — o registro dos parâmetros EFETIVAMENTE usados — e as revisões individuais em
scoreModelo.revisoesPorSinal. Mostra:
  1. o que o scoreModelo traz, o que difere de parametros_32.json e o que não tem correspondência;
  2. as revisões individuais: quantas, quais campos, chaves desconhecidas e revisões de sinais que não existem;
  3. a tabela de bases que as contribuições gravadas realmente usaram;
  4. o score de cada conta recalculado pela 3.2 canônica (com scoreModelo + revisões) contra o gravado.
O snapshot e a saída ficam FORA do repositório (têm nomes de contas reais).
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import date

from . import motor32
from .adaptador import parametros_do_modelo, registro_por_sinal, revisoes
from .classificar import chave_canonica


def carregar(caminho: str) -> dict:
    with open(caminho, encoding="utf-8") as f:
        d = json.load(f)
    return d.get("payload", d)


def eventos_da_conta(conta: dict, sinais: list[dict]) -> list[dict]:
    return [s for s in sinais if s.get("contaId") == conta["id"] and not s.get("exemplo")] + \
        [h for h in conta.get("historico", []) if not h.get("exemplo")]


def modelo_e_revisoes(base: dict, p32: dict) -> tuple[dict, dict, list, list]:
    modelo = base.get("scoreModelo") or {}
    p, difs, sobras = parametros_do_modelo(modelo, p32)
    return p, revisoes(modelo), difs, sobras


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--hoje", help="data de referência do recálculo (AAAA-MM-DD); padrão: geradoEm do snapshot")
    a = ap.parse_args()
    base = carregar(a.snapshot)
    hoje = date.fromisoformat(a.hoje or str(base.get("geradoEm", date.today().isoformat()))[:10])
    p, revs, difs, sobras = modelo_e_revisoes(base, motor32.parametros())
    modelo = base.get("scoreModelo") or {}
    out = [f"# Reconciliação VSCS 3.2 · snapshot {base.get('scoreVersao', '?')} · referência {hoje.isoformat()}", ""]

    out += ["## 1. scoreModelo", ""]
    if not modelo:
        out += ["**payload.scoreModelo não encontrado.** A reconciliação usa só parametros_32.json.", ""]
    else:
        out += [f"Chaves: {', '.join(sorted(modelo))}", "", "Diferenças aplicadas (scoreModelo prevalece sobre parametros_32.json):", ""]
        out += [f"- `{c}`: JSON {j!r} → modelo {m!r}" for c, j, m in difs] or ["- nenhuma"]
        out += ["", "Sem correspondência no motor (ajustar o motor ou o adaptador):", ""]
        out += [f"- `{s}`" for s in sobras] or ["- nenhuma"]
        out.append("")

    ids = {str(s.get("id")) for s in base.get("sinais", [])} | {str(h.get("id")) for c in base["contas"] for h in c.get("historico", []) if h.get("id")}
    campos = Counter(k for r in revs.values() for k in r if not k.startswith("_"))
    desconhecidas = Counter(k for r in revs.values() for k in r.get("_desconhecidas", []))
    orfas = [sid for sid in revs if sid not in ids]
    out += ["## 2. Revisões individuais (scoreModelo.revisoesPorSinal)", "",
            f"{len(revs)} revisões · {len(orfas)} sem sinal correspondente no snapshot", "",
            "Campos reconhecidos: " + (", ".join(f"{k} ({n})" for k, n in campos.most_common()) or "nenhum"), "",
            "Campos desconhecidos (não aplicados): " + (", ".join(f"{k} ({n})" for k, n in desconhecidas.most_common()) or "nenhum"), ""]
    if orfas:
        out += ["Revisões sem sinal: " + ", ".join(orfas[:30]) + (" …" if len(orfas) > 30 else ""), ""]

    usadas: dict[str, Counter] = defaultdict(Counter)
    for c in base["contas"]:
        for x in (c.get("v2") or {}).get("contribuicoes") or []:
            usadas[x.get("chave") or x.get("tipo") or "?"][x.get("base")] += 1
    esperado = {**p["bases_30"], **{f"vaga_{k}": v for k, v in p["cargos_receita"].items()},
                **{f"nomeacao_{k}": v for k, v in p["cargos_receita"].items()}}
    out += ["## 3. Bases usadas nas contribuições gravadas × parâmetros efetivos", "",
            "| chave | bases gravadas (ocorrências) | parâmetro | confere |", "|---|---|---:|---|"]
    for chave, cont in sorted(usadas.items()):
        par = esperado.get(chave, esperado.get(chave_canonica(chave)))
        if chave in ("troca_lideranca_ceo", "troca_lideranca_clevel"):
            par = p["lideranca_fora_de_receita"]["ceo_socio" if chave.endswith("ceo") else "clevel_outro"]
        if chave_canonica(chave) == "vaga_bloco":
            par = None  # bloco: base depende da quantidade (2 = 30, 3–4 = 50, 5+ = 70)
            ok_bloco = set(cont) <= {p["blocos_operacionais"][k] for k in ("duas", "tres_a_quatro", "cinco_ou_mais")}
        if chave == "vaga_area_alvo":
            par = p["cargos_receita"]["sdr_bdr"]
        bases = ", ".join(f"{b} ({n})" for b, n in cont.most_common())
        if chave_canonica(chave) == "vaga_bloco":
            ok = "sim (bloco por quantidade)" if ok_bloco else "NÃO (ver quantidades)"
        else:
            ok = "sim" if par is not None and set(cont) == {par} else ("sem parâmetro" if par is None else "NÃO (ver revisões)")
        if chave != chave_canonica(chave):
            chave = f"{chave} → {chave_canonica(chave)}"
        out.append(f"| {chave} | {bases} | {par if par is not None else '—'} | {ok} |")
    out.append("")

    difs_conta, motivos_total, pares = [], Counter(), Counter()
    for c in base["contas"]:
        evs = eventos_da_conta(c, base.get("sinais", []))
        # recalcula na data em que a conta foi calculada, para o tempo não criar divergência falsa
        dia = hoje if a.hoje else date.fromisoformat(str((c.get("v2") or {}).get("calculadoEm") or hoje.isoformat())[:10])
        r = motor32.calcular(evs, dia, p, c.get("interacoes"), revs, c)
        g = float(c.get("score") or 0)
        motivos = explicar(c, r, p) if abs(r["vscs"] - g) > 0.05 else []
        motivos_total.update({m.split(":")[0] for m in motivos})
        difs_conta.append((abs(r["vscs"] - g), c.get("nome"), c.get("tier"), g, r["vscs"], motivos))
        # registro × inferência: o que o classificador de texto faria com sinais já validados (regressões do classificador)
        reg = registro_por_sinal(c)
        for e in evs:
            rg = reg.get(str(e.get("id")))
            if not rg or str(e.get("id")) in revs:
                continue
            inf = motor32.classificar(dict(e, _empresa=c.get("nome")), p)
            ch_inf = inf["chave"] if inf else "não pontua"
            if ch_inf != chave_canonica(rg.get("chave", "")):
                pares[(chave_canonica(rg.get("chave", "")), ch_inf)] += 1
    batem = sum(1 for d in difs_conta if d[0] <= 0.05)
    out += [f"## 4. Score recalculado pela 3.2 canônica: {batem} de {len(difs_conta)} contas batem (±0,05)", "",
            "Causas das divergências (uma conta pode ter mais de uma): " + (", ".join(f"{k} ({n})" for k, n in motivos_total.most_common()) or "nenhuma"), "",
            "| conta | tier | gravado | 3.2 canônica | diferença | explicação |", "|---|---|---:|---:|---:|---|"]
    for d, nome, tier, g, r, motivos in sorted(difs_conta, key=lambda x: -x[0]):
        if d > 0.05:
            out.append(f"| {nome} | {tier} | {g:.2f} | {r:.2f} | {r - g:+.2f} | {'; '.join(motivos) or 'SEM EXPLICAÇÃO — investigar'} |")
    out += ["", "## 5. Registro × inferência pelo texto (sinais já validados que o classificador leria diferente)", "",
            "O motor usa o registro; esta tabela mede onde o classificador de texto erraria em sinais novos.", "",
            "| chave registrada | inferência pelo texto | sinais |", "|---|---|---:|"]
    out += [f"| {a_} | {b_} | {n_} |" for (a_, b_), n_ in pares.most_common()] or ["| — | — | 0 |"]
    print("\n".join(out))


def explicar(conta: dict, r: dict, p: dict) -> list[str]:
    """Por que o recálculo difere do gravado: compara as contribuições sinal a sinal."""
    v2 = conta.get("v2") or {}
    gravadas = {str(x.get("id")): x for x in v2.get("contribuicoes") or []}
    novas = {str(x.get("id")): x for x in r["contribuicoes"]}
    motivos = []
    for sid, g in gravadas.items():
        n = novas.get(sid)
        if n is None:
            motivos.append(f"gravada sem recálculo: {g.get('chave')} (sinal ausente do snapshot, deduplicado ou expirado)")
            continue
        for campo, rotulo in (("base", "base"), ("fonte", "fonte"), ("correlacao", "correlação")):
            if g.get(campo) is not None and abs(float(g[campo]) - float(n[campo])) > 1e-6:
                motivos.append(f"{rotulo} diferente: {g.get('chave')} {g[campo]} → {n[campo]}")
        if g.get("tempo") is not None and abs(float(g["tempo"]) - float(n["tempo"])) > 1e-3:
            motivos.append(f"tempo diferente: {g.get('chave')} {g['tempo']} → {n['tempo']} (data {g.get('data')} → {n['data']})")
    for sid, n in novas.items():
        if sid not in gravadas:
            motivos.append(f"pontuada agora sem registro: {n['chave']} (classificação inferida pelo texto)")
    if float(v2.get("bonus_convergencia") or 0) != float(r["bonus_convergencia"]):
        motivos.append(f"bônus diferente: {v2.get('bonus_convergencia')} → {r['bonus_convergencia']}")
    if abs(float(v2.get("penalidade") or 0) - float(r["penalidade"])) > 0.05:
        motivos.append(f"penalidade diferente: {v2.get('penalidade')} → {r['penalidade']}")
    return motivos


if __name__ == "__main__":
    main()
