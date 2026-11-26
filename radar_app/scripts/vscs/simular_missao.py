"""Comparativo somente leitura, com a mesma entrada privada e data de referência.
python -m vscs.simular_missao --snapshot /privado/payload.json --hoje 2026-11-26
"""
import argparse
import copy
import json
from datetime import date
from . import motor33
from .reconciliar import carregar, eventos_da_conta, modelo_e_revisoes

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--hoje", required=True)
    ap.add_argument("--relacionamentos")
    args = ap.parse_args()
    base = carregar(args.snapshot)
    rels = {}
    if args.relacionamentos:
        with open(args.relacionamentos, encoding="utf-8") as f:
            rels = json.load(f)
    hoje = date.fromisoformat(args.hoje)
    p32, p33 = motor33.parametros()
    p32, revs, _, _ = modelo_e_revisoes(base, p32)
    sem, com = copy.deepcopy(p33), copy.deepcopy(p33)
    sem["missao"]["habilitada"] = False
    com["missao"]["habilitada"] = True
    rows = []
    for c in base["contas"]:
        evs = eventos_da_conta(c, base.get("sinais", []))
        kw = dict(empresa=c.get("nome", ""), interacoes=c.get("interacoes"), p32=p32, conta=c,
                  revisoes=revs, relacionamentos=rels.get(c["id"]))
        a = motor33.calcular(evs, hoje, p33=sem, **kw)
        b = motor33.calcular(evs, hoje, p33=com, **kw)
        missions = [ac["missao"] for m in b["movimentos"] for ac in m["acontecimentos"] if ac.get("missao")]
        tier = c.get("tier")
        corte = {"A":55,"B":70}.get(tier)
        rows.append(dict(conta=c["nome"], id=c["id"], tier=tier, antes=a["vscs"], depois=b["vscs"],
                         delta=round(b["vscs"]-a["vscs"],2), missoes=missions,
                         cruza_corte=(a["vscs"] < corte <= b["vscs"]) if corte else False,
                         pendencias_90=b["requisitos_90_pendentes"]))
    for k, campo in (("rank_antes","antes"),("rank_depois","depois")):
        for i,r in enumerate(sorted(rows,key=lambda r:(-r[campo],str(r["id"]))),1):
            r[k]=i
    print(json.dumps({"data":args.hoje,"contas":len(rows),"com_missao":sum(bool(r["missoes"]) for r in rows),
                      "alteradas":sum(r["delta"]!=0 for r in rows),
                      "detalhes":sorted((r for r in rows if r["missoes"] or r["delta"]),key=lambda r:-r["delta"])},
                     ensure_ascii=False,indent=2))

if __name__ == "__main__":
    main()
