#!/usr/bin/env python3
"""Registro de varredura por conta e fonte: separa "sem fato" de "não varrido" (contrato em docs/varreduras.md).

Cada coletor chama `registrar(base, conta_id, fonte, resultado, itens)` ao terminar uma conta. Fica só a última
varredura por conta e fonte:

    base["varreduras"][conta_id][fonte] = {"em": "2026-11-26T10:00:00-03:00", "resultado": "sem_fato", "itens": 0}

resultado: "com_fato" (trouxe sinal), "sem_fato" (olhou e não achou nada) ou "erro" (não conseguiu olhar).
Erro não apaga uma varredura válida anterior da mesma fonte.

Uso direto (varredura manual ou feita por outro agente, sem sinal novo):
    python3 scripts/varreduras.py --fonte pesquisa-web-validada --resultado sem_fato --contas id1 id2 ...
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
RESULTADOS = ("com_fato", "sem_fato", "erro")
BRT = timezone(timedelta(hours=-3))


def agora_iso() -> str:
    return datetime.now(BRT).replace(microsecond=0).isoformat()


def registrar(base: dict, conta_id: str, fonte: str, resultado: str, itens: int = 0, em: str | None = None,
              consulta: str | None = None) -> None:
    if resultado not in RESULTADOS:
        raise ValueError(f"resultado inválido: {resultado}")
    por_fonte = base.setdefault("varreduras", {}).setdefault(str(conta_id), {})
    anterior = por_fonte.get(fonte)
    if resultado == "erro" and anterior and anterior.get("resultado") != "erro":
        anterior["ultimoErroEm"] = em or agora_iso()  # mantém a última leitura válida
        return
    reg = {"em": em or agora_iso(), "resultado": resultado, "itens": int(itens)}
    if consulta:
        reg["consulta"] = consulta[:200]
    por_fonte[fonte] = reg


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fonte", required=True)
    ap.add_argument("--resultado", required=True, choices=RESULTADOS)
    ap.add_argument("--em", help="data ou data e hora ISO (padrão: agora, horário de Brasília)")
    ap.add_argument("--contas", nargs="+", required=True)
    ap.add_argument("--base", type=Path, default=DESTINO)
    a = ap.parse_args()
    base = json.loads(a.base.read_text(encoding="utf-8"))
    ids = {c["id"] for c in base["contas"]}
    desconhecidas = [c for c in a.contas if c not in ids]
    for c in a.contas:
        if c in ids:
            registrar(base, c, a.fonte, a.resultado, em=a.em)
    a.base.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(a.contas) - len(desconhecidas)} varreduras registradas" + (f" · ids desconhecidos: {', '.join(desconhecidas)}" if desconhecidas else ""))


if __name__ == "__main__":
    main()
