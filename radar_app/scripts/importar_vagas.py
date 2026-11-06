#!/usr/bin/env python3
"""Importa vagas de quadros de emprego (Indeed e afins) e transforma as que interessam em sinais.

uso: python3 scripts/importar_vagas.py vagas.json

O Indeed só existe aqui como conector (MCP, sem endpoint para script — ver coletar_vagas.py), então a
varredura roda pelo Claude, que grava um arquivo com as vagas achadas:
  [{"empresa": "Neogrid Carreiras", "titulo": "Gerente de Growth", "local": "Joinville, SC",
    "data": "2026-10-27", "url": "https://to.indeed.com/...", "fonte": "Indeed", "ti": true}, ...]

Para cada vaga: classifica pelo cargo (mesma regra de coletar_vagas.py: área-alvo, gerente pra cima é
liderança, Growth/Revenue é o foco), casa o empregador com uma conta da base pelo nome e grava o sinal.
Liderança vira um sinal por vaga ("Contratação de Gerente de Growth"); vaga de área entra na contagem.
Só interessa quem está na base: a pergunta é se as contas da lista estão contratando. Empregador fora da base é
descartado (e contado no resumo).
Idempotente: o id do sinal sai da URL da vaga.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

from coletar_vagas import classificar_vaga, contexto_aquisicao, foco_growth_revenue, normalizar
from coletar_noticias import escolher_abordar

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
SUFIXOS_EMPREGADOR = re.compile(r"\b(carreiras|careers|vagas|jobs|ltda|s\.?a\.?|tecnologia|technologies|technology|group|grupo|brasil|brazil|"
                                r"software|sistemas|solucoes|solutions|informatica)\b")


def chave_nome(nome: str) -> str:
    return re.sub(r"[^a-z0-9]", "", SUFIXOS_EMPREGADOR.sub("", normalizar(nome)))


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    vagas = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()

    por_chave: dict[str, dict] = {}
    for c in base["contas"]:
        for nome in {c["nome"], c.get("razaoSocial") or ""}:
            k = chave_nome(nome)
            if len(k) >= 4:
                por_chave.setdefault(k, c)
    ids = {s["id"] for s in base.get("sinais", [])}

    novos = descartadas = fora = 0
    for v in vagas:
        tipo_peso_rotulo = classificar_vaga(v["titulo"])
        if not tipo_peso_rotulo:
            descartadas += 1
            continue
        tipo, peso, rotulo = tipo_peso_rotulo
        k = chave_nome(v["empresa"])
        conta = por_chave.get(k)
        if conta is None:
            fora += 1
            continue
        sid = f'{conta["id"]}-vaga-{hashlib.sha1(v["url"].encode()).hexdigest()[:10]}'
        if sid in ids:
            continue
        # nome curto do cargo: corta o "- Remoto (SP)", mas não a parte que diz a área ("Analista - RevOps")
        partes = [x.strip() for x in re.split(r"\s[-–|/]\s|\(|\|", v["titulo"]) if x.strip()]
        area = next((x for x in partes if classificar_vaga(x)), None)
        if area in (None, partes[0]):
            cargo = partes[0]
        elif re.search(r"\b(analista|gerente|head|diretor|diretora|coordenador|coordenadora|especialista|manager|executivo|lider)\b", normalizar(partes[0])):
            cargo = f"{partes[0]} ({area})"  # "Analista de Dados Sênior (RevOps)"
        else:
            cargo = area  # "Wake | Gerente de Canais e Parcerias": o primeiro pedaço é marca, não cargo
        base["sinais"].append({
            "id": sid, "contaId": conta["id"], "tipo": tipo, "rotulo": rotulo, "peso": peso,
            "sinal": (f"Contratação de {cargo}" if tipo == "vaga_lideranca_alvo" else f"Vaga aberta: {cargo}")[:45],
            "porQueAgora": contexto_aquisicao(v["titulo"]), "focoGrowthRevenue": foco_growth_revenue(v["titulo"]),
            "fonte": v.get("fonte") or "Indeed", "data": v.get("data") or hoje.isoformat(), "alertaEm": hoje.isoformat(),
            "url": v["url"], "exemplo": False, "abordar": escolher_abordar(conta.get("comite", [])), "pontos": 0,
            "local": v.get("local", ""),
        })
        ids.add(sid)
        novos += 1

    base.pop("candidatas", None)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(vagas)} vagas lidas · {descartadas} fora da área-alvo · {fora} de empresas fora da base (descartadas) · "
          f"{novos} sinais novos em contas da base")
    

if __name__ == "__main__":
    main()
