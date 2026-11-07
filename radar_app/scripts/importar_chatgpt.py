#!/usr/bin/env python3
"""Traz para a base as respostas da requisição de dados faltantes (scripts/exportar_requisicao_chatgpt.py).

uso: python3 scripts/importar_chatgpt.py resposta_01.txt [resposta_02.txt …] [--sem-receita]

Cada arquivo é a resposta do chat, com os blocos CSV "EMPRESAS" e "CONTATOS" (separador ;). Regras:
- linha sem fonte_url é ignorada; CNPJ só entra se a Receita (BrasilAPI) confirmar — aí UF, cidade, porte,
  CNAE e data de abertura vêm da Receita, não do chat;
- só preenche campo vazio: nada que já está confirmado na base é sobrescrito;
- tudo que vem do chat fica marcado "ChatGPT (a validar)" (fonte do campo ou da pessoa).
Depois rode scripts/qualificar_icp.py e scripts/score_v2.py --exibir (tier, comitê e score novos).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coletar_cnpj import aplicar_enriquecimento, consultar_brasilapi  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
FONTE = "ChatGPT (a validar)"
FAIXAS = {"1-10": 5, "11-50": 30, "51-200": 125, "201-500": 350, "501-1000": 750, "1001-5000": 3000, "5001+": 6000}
AREAS = {"executivo", "comercial", "marketing", "financeiro", "produto", "outro"}
PAPEL_ABM = {"decisor": "decisor", "dono_da_dor": "dono_da_dor", "assina_cheque": "assina_cheque"}


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t).strip()


def blocos(texto: str) -> dict[str, list[dict]]:
    """Acha os blocos EMPRESAS e CONTATOS (dentro ou fora de ```), cada um com cabeçalho na linha seguinte."""
    out: dict[str, list[dict]] = {"EMPRESAS": [], "CONTATOS": []}
    linhas = [l.strip() for l in texto.replace("\r", "").split("\n")]
    i = 0
    while i < len(linhas):
        nome = linhas[i].strip("` ").upper()
        if nome in out:
            corpo = []
            i += 1
            while i < len(linhas) and linhas[i] and not linhas[i].startswith("```") and linhas[i].strip("` ").upper() not in out:
                corpo.append(linhas[i])
                i += 1
            if corpo:
                out[nome] += list(csv.DictReader(io.StringIO("\n".join(corpo)), delimiter=";"))
            continue
        i += 1
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("arquivos", nargs="+", type=Path)
    ap.add_argument("--sem-receita", action="store_true", help="não consulta a BrasilAPI (CNPJ do chat fica de fora)")
    args = ap.parse_args()
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    contas = {c["id"]: c for c in base["contas"]}
    rel = {"empresas": 0, "sem_fonte": 0, "cnpj_ok": 0, "cnpj_recusado": 0, "campos": 0, "pessoas": 0, "pessoas_repetidas": 0, "id_desconhecido": 0}

    for arq in args.arquivos:
        b = blocos(arq.read_text(encoding="utf-8"))
        for r in b["EMPRESAS"]:
            r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
            c = contas.get(r.get("id", ""))
            if not c:
                rel["id_desconhecido"] += 1
                continue
            if not r.get("fonte_url"):
                rel["sem_fonte"] += 1
                continue
            rel["empresas"] += 1
            cnpj = re.sub(r"\D", "", r.get("cnpj", ""))
            if len(cnpj) == 14 and not c.get("cnpj") and not args.sem_receita:
                dados = consultar_brasilapi(cnpj)
                time.sleep(0.4)
                if dados and "razao_social" in dados and norm(c["nome"]).split(" ")[0][:4] in norm(f'{dados.get("razao_social", "")} {dados.get("nome_fantasia", "")}'):
                    aplicar_enriquecimento(c, cnpj, dados)
                    c["cnpjFonte"] = f'{FONTE}: {r["fonte_url"]}'
                    rel["cnpj_ok"] += 1
                else:
                    rel["cnpj_recusado"] += 1
            def pôr(campo: str, valor) -> None:
                if valor not in (None, "") and not c.get(campo):
                    c[campo] = valor
                    rel["campos"] += 1
            if r.get("uf") and not c.get("uf"):
                pôr("uf", r["uf"].upper()[:2])
                c["ufFonte"] = "pesquisa"
            pôr("cidade", r.get("cidade"))
            faixa = r.get("faixa_funcionarios", "").replace(" ", "").replace("–", "-")
            if faixa in FAIXAS and not c.get("funcionarios"):
                c["funcionarios"] = FAIXAS[faixa]
                c["funcionariosFaixa"] = faixa
                c["funcionariosFonte"] = f'{FONTE}: {r["fonte_url"]}'
                rel["campos"] += 1
            pôr("faturamentoEstimado", r.get("faturamento_faixa"))
            if re.fullmatch(r"(19|20)\d\d", r.get("ano_fundacao", "")):
                pôr("anoFundacao", int(r["ano_fundacao"]))
            if r.get("modelo_negocio") in ("servico", "produto", "misto"):
                pôr("modeloNegocio", r["modelo_negocio"])
            pôr("oQueFaz", r.get("o_que_faz"))
            pôr("linkedinEmpresa", r.get("linkedin_empresa"))
            c.setdefault("enriquecimentoFontes", [])
            if r["fonte_url"] not in c["enriquecimentoFontes"]:
                c["enriquecimentoFontes"].append(r["fonte_url"])

        for r in b["CONTATOS"]:
            r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
            c = contas.get(r.get("id", ""))
            if not c:
                rel["id_desconhecido"] += 1
                continue
            if not r.get("fonte_url") or not r.get("nome") or not r.get("cargo"):
                rel["sem_fonte"] += 1
                continue
            if any(norm(p["nome"]) == norm(r["nome"]) for p in c["comite"]):
                rel["pessoas_repetidas"] += 1
                continue
            area = r.get("area", "outro") if r.get("area") in AREAS else "outro"
            pessoa = {"nome": r["nome"], "cargo": r["cargo"], "area": area,
                      "papel": "decisor" if r.get("papel") in ("decisor", "assina_cheque") else "influenciador",
                      "fonte": f'{FONTE}: {r["fonte_url"]}', "linkedin": r.get("linkedin_url", "")}
            if r.get("papel") in PAPEL_ABM:
                pessoa["papelAbm"] = PAPEL_ABM[r["papel"]]
            c["comite"].append(pessoa)
            rel["pessoas"] += 1

    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(" · ".join(f"{k}: {v}" for k, v in rel.items()))
    print("Agora: python3 scripts/qualificar_icp.py && python3 scripts/score_v2.py --exibir")


if __name__ == "__main__":
    main()
