"""Reconstrução retrospectiva de 180 dias com o motor VSCS 3.3-DC.

Não escreve no banco nem modifica o snapshot de entrada. Gera um patch privado
somente quando o motor reproduz o score publicado de TODAS as contas.
Usar o checkout aprovado do motor (diretório radar_app/scripts que contém vscs/).
O histórico é reconstruído com o conhecimento do snapshot, não é histórico observado.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path

DIAS = 180
TOLERANCIA = 0.05
VERSAO = "vscs-3.3-dc"


def data(valor):
    try:
        return date.fromisoformat(str(valor)[:10])
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snapshot", required=True, type=Path)
    ap.add_argument("--motor-dir", required=True, type=Path)
    ap.add_argument("--saida", required=True, type=Path)
    ap.add_argument("--relacionamentos", type=Path)
    args = ap.parse_args()
    if args.saida.resolve() == args.snapshot.resolve() or args.saida.exists():
        ap.error("A saída deve ser um arquivo novo, distinto do snapshot.")
    sys.path.insert(0, str(args.motor_dir.resolve()))
    from vscs import motor33
    from vscs.reconciliar import carregar, eventos_da_conta, modelo_e_revisoes
    from vscs.adaptador import registro_por_sinal

    base = carregar(str(args.snapshot))
    if base.get("scoreVersao") != VERSAO or motor33.VERSAO != VERSAO:
        ap.error("Snapshot e motor precisam estar na mesma versão 3.3-DC.")
    p32, p33 = motor33.parametros()
    p32, revs, _, _ = modelo_e_revisoes(base, p32)
    rels = json.loads(args.relacionamentos.read_text(encoding="utf-8")) if args.relacionamentos else {}
    referencia = data(base.get("atualizadoEm") or base.get("geradoEm"))
    if not referencia:
        ap.error("Snapshot sem data de referência.")
    patch, divergencias = {}, []
    for conta in base["contas"]:
        v2 = conta.get("v2") or {}
        ate = data(v2.get("calculadoEm")) or referencia
        registro = registro_por_sinal(conta)
        evs = eventos_da_conta(conta, base.get("sinais", []))
        interacoes = conta.get("interacoes") or []

        def dia_evento(ev):
            sid = str(ev.get("id"))
            return data((revs.get(sid) or {}).get("data") or
                        (registro.get(sid) or {}).get("data") or ev.get("data"))

        def calcular(dia):
            # Sem antecipar fatos nem interações posteriores ao dia simulado.
            fatos = [ev for ev in evs if (d := dia_evento(ev)) and d <= dia]
            contatos = [i for i in interacoes if (d := data(i.get("data"))) and d <= dia]
            rel_dia = {n: r for n, r in rels.get(conta["id"], {}).items()
                       if (d := data(r.get("em"))) and d <= dia}
            return float(motor33.calcular(fatos, dia, conta.get("nome", ""), contatos,
                                         p32, p33, conta, revs, rel_dia)["vscs"])

        atual = calcular(ate)
        publicado = float(conta["score"])
        if (not math.isfinite(atual) or abs(atual - publicado) > TOLERANCIA or
                v2.get("versao") != VERSAO or abs(float(v2.get("vscs", -999)) - publicado) > TOLERANCIA):
            divergencias.append((conta["id"], publicado, atual))
            continue
        valores = [calcular(ate - timedelta(days=d)) for d in range(DIAS, 0, -1)] + [atual]
        if not all(math.isfinite(v) and 0 <= v <= 100 for v in valores):
            raise ValueError("Série inválida: " + str(conta["id"]))
        patch[conta["id"]] = {"serie180": {"ate": ate.isoformat(), "versao": VERSAO,
                                           "metodo": "reconstruido", "valores": valores}}
    if divergencias:
        print(f"{len(divergencias)} divergências; nenhum patch gerado.", file=sys.stderr)
        for cid, publicado, calculado in divergencias[:30]:
            print(f"{cid}: publicado={publicado:.2f}, calculado={calculado:.2f}", file=sys.stderr)
        raise SystemExit(2)
    args.saida.write_text(json.dumps({"versao": VERSAO, "referencia": referencia.isoformat(),
                                    "contas": patch}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(patch)} contas reconciliadas; 181 pontos por conta. Banco não alterado.")


if __name__ == "__main__":
    main()
