#!/usr/bin/env python3
"""Lê o export de pessoas do Snov.io (uma linha por pessoa) e gera data/contas.local.json.

uso: python3 scripts/importar_decisores.py caminho/do/export.csv

Substitui a base atual (contas.local.json): o arquivo gerado aqui sobrescreve qualquer base real
anterior. Sem sinais (esse CSV só traz pessoa + empresa, sem notícia/vaga/CNPJ), então a tela Hoje
fica vazia até os coletores rodarem — o que já existe é a lista de contas e, dentro de cada uma, o
comitê de pessoas, para a tela Contas e a nova tela Decisores.

A classificação de cargo (nível, área, papel) é a mesma usada em fundacao/velora_radar/snov.py,
portada aqui porque os dois projetos não compartilham pacote Python.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# ---------- normalização (igual a fundacao/velora_radar/identidade.py) ----------


def sem_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn")


def normalizar_dominio(valor: str) -> str:
    texto = sem_acentos(valor or "").lower().strip()
    texto = re.sub(r"^[a-z][a-z0-9+.-]*://", "", texto)
    texto = re.sub(r"^www\.", "", texto)
    return texto.split("/")[0]


# ---------- classificação de cargo: nível, área, papel ----------
# Mesma lógica de fundacao/velora_radar/snov.py (classificar_cargo), com Area/Papel do radar_app.

_C_LEVEL = [
    "ceo", "cfo", "cmo", "coo", "cro", "cco", "cgo", "cmso", "chro", "presidente", "president", "fundador", "fundadora",
    "founder", "owner", "proprietario", "proprietaria", "dono", "dona", "socio", "socia", "partner",
]
_CHIEF_OFFICER = re.compile(r"\bchie\w*\b.*\bofficer\b")
_VICE = re.compile(r"\bvice[\s-]*presiden\w*")
_VP_DIRETOR_QUALIFICA_HEAD = ["global", "regional", "executiv", "latam", "brasil", "brazil", "corporat"]
_VP_DIRETOR = ["diretor", "diretora", "director", "superintendente", "vice-presidente", "vice presidente", "vice president", "vp"]
_GERENTE_HEAD = ["gerente", "manager", "head", "lider", "lead"]

_AREAS: list[tuple[str, list[str]]] = [
    ("executivo", ["ceo", "presidente", "president", "fundador", "fundadora", "founder", "owner", "proprietario",
                   "proprietaria", "socio", "socia", "partner", "diretor geral", "diretora geral", "diretoria executiva",
                   "diretor executivo", "diretora executiva", "executive director", "managing director", "general manager",
                   "diretor administrativo", "diretora administrativa", "administrador", "administradora", "country manager",
                   "chief executive", "executive officer"]),
    ("financeiro", ["financeiro", "financeira", "finance", "financial", "cfo", "controladoria", "controller"]),
    ("marketing", ["marketing", "cmo", "cmso", "brand"]),
    ("comercial", ["comercial", "commercial", "vendas", "sales", "growth", "cgo", "cco", "crescimento", "negocios", "business",
                   "relacionamento", "revenue", "cro"]),
    ("produto", ["produto", "product", "cpo"]),
    ("compras", ["compras", "suprimentos", "procurement", "supply"]),
    ("juridico", ["juridico", "compliance", "legal", "dpo", "data protection"]),
    ("ti", ["tecnologia", "technology", "ti", "it", "cto", "cio", "sistemas", "dados", "data", "engenharia de software"]),
    ("operacoes", ["operacoes", "operacional", "operations", "ops", "coo", "producao", "logistica", "operating officer"]),
    ("rh", ["recursos humanos", "rh", "chro", "people", "gente e gestao", "human resources"]),
]


def _tem(texto: str, termos: list[str]) -> bool:
    for t in termos:
        if len(t) <= 4 and t.isalpha():
            if re.search(rf"\b{t}\b", texto):
                return True
        elif t in texto:
            return True
    return False


def classificar_cargo(cargo: str) -> tuple[str, str]:
    """(area, papel) — área sempre 'outro' quando nada bate; papel é 'decisor' ou 'influenciador'."""
    texto = f" {sem_acentos(cargo).lower().strip()} "
    if not texto.strip():
        return "outro", "influenciador"
    sem_vice = _VICE.sub(" vp ", texto)

    if _tem(sem_vice, _C_LEVEL) or _CHIEF_OFFICER.search(texto):
        nivel = "c_level"
    elif _tem(sem_vice, _VP_DIRETOR) or ("head" in texto and _tem(texto, _VP_DIRETOR_QUALIFICA_HEAD)):
        nivel = "vp_diretor"
    elif _tem(texto, _GERENTE_HEAD):
        nivel = "gerente_head"
    else:
        nivel = None

    area = next((a for a, termos in _AREAS if _tem(sem_vice, termos)), None)
    if area is None and nivel == "vp_diretor":
        area = "executivo"

    if (area in ("compras", "juridico", "ti") and nivel != "c_level") or (nivel == "c_level" and area in ("juridico", "ti")):
        papel = "influenciador"  # guardião: veta ou destrava, mas não é quem decide comprar
    elif nivel == "c_level" or (nivel == "vp_diretor" and area in ("financeiro", "executivo")):
        papel = "decisor"
    elif area in ("marketing", "comercial") and nivel in ("gerente_head", "vp_diretor"):
        papel = "decisor"  # dono do problema: também decide, mesmo sem ser o pagador
    else:
        papel = "influenciador"
    return area or "outro", papel


# ---------- leitura do CSV e agrupamento por conta ----------


def ler_csv(caminho: Path) -> list[dict[str, str]]:
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def slug(dominio: str) -> str:
    return "dec-" + re.sub(r"[^a-z0-9]+", "-", dominio).strip("-")


def montar(linhas: list[dict[str, str]]) -> dict:
    grupos: dict[str, list[dict[str, str]]] = {}
    nomes_empresa: dict[str, dict[str, int]] = {}
    for linha in linhas:
        dominio = normalizar_dominio(linha["Company domain name"])
        if not dominio:
            continue
        grupos.setdefault(dominio, []).append(linha)
        nomes_empresa.setdefault(dominio, {})
        nome = linha["Company name"].strip()
        nomes_empresa[dominio][nome] = nomes_empresa[dominio].get(nome, 0) + 1

    contas = []
    for dominio, grupo in sorted(grupos.items()):
        nome_empresa = max(nomes_empresa[dominio].items(), key=lambda kv: kv[1])[0]
        comite = []
        for l in grupo:
            nome = f"{l['First name'].strip()} {l['Last name'].strip()}".strip()
            cargo = l["Position"].strip()
            area, papel = classificar_cargo(cargo)
            comite.append({
                "nome": nome,
                "cargo": cargo,
                "area": area,
                "papel": papel,
                "fonte": "snov",
                "email": l["Email"].strip() or None,
                "linkedin": l["LinkedIn"].strip() or None,
            })
        contas.append({
            "id": slug(dominio),
            "nome": nome_empresa,
            "razaoSocial": nome_empresa,
            "cnpj": "",
            "dominio": dominio,
            "cidade": "",
            "uf": "",
            "segmento": "",
            "braco": "",
            "tier": "",
            "statusComercial": "",
            "decisor": {"nome": comite[0]["nome"], "cargo": comite[0]["cargo"]} if comite else {"nome": "", "cargo": ""},
            "score": 0,
            "tendencia": 0,
            "serie": [0] * 30,
            "composicao": [],
            "comite": comite,
            "historico": [],
        })
    return {
        "geradoEm": __import__("datetime").date.today().isoformat(),
        "contas": contas,
        "sinais": [],
        "fontes": [],
    }


def main() -> None:
    if len(sys.argv) != 2:
        print("uso: python3 scripts/importar_decisores.py caminho/do/export.csv", file=sys.stderr)
        raise SystemExit(1)
    linhas = ler_csv(Path(sys.argv[1]))
    base = montar(linhas)
    destino = RAIZ / "data" / "contas.local.json"
    destino.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    pessoas = sum(len(c["comite"]) for c in base["contas"])
    print(f"{len(linhas)} linhas -> {len(base['contas'])} contas, {pessoas} pessoas no comitê -> {destino}")


if __name__ == "__main__":
    main()
