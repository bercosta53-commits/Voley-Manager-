#!/usr/bin/env python3
"""Conector de veículos de TI: lê o RSS dos principais veículos e grava o que cita uma conta (ou alguém do comitê).

uso: python3 scripts/coletar_veiculos.py [--dias N]

Complementa o Google Notícias (coletar_noticias.py, que busca conta por conta): aqui é o contrário — lê
tudo o que os veículos de TI e negócios publicaram e procura, em cada matéria, o nome de cada conta, a
razão social e o nome completo das pessoas do comitê (ver 05-conectores-fontes.md, categoria 3.4). O nome
de pessoa pega o que o nome da empresa sozinho perde: "Fulana assume como CMO", sem a empresa no título.

Feeds validados em 2026-11-06 (todos públicos; guarda só título, link, data, veículo — o resumo próprio
vem do classificador, nunca o texto integral). Feed que não responder entra no relatório de erros e a
rodada segue. RSS de veículo só traz as últimas 10 a 30 matérias, então o conector rende rodando todo dia.

Como no Google Notícias, a matéria entra com tipo "noticia_setorial" e peso 0 (fora da caixa de Hoje) até
o classificador (scripts/classificar_sinais.py) dizer o que ela é — inclusive "irrelevante", que manda o
link pra base["descartados"]. Idempotente: cada link entra uma vez por conta.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from email.utils import parsedate_to_datetime
from pathlib import Path

from coletar_noticias import (HOMONIMOS_LIMITE, JANELA_CAIXA_DIAS, escolher_abordar, nome_curto_demais,
                              normalizar, variantes_nome)

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
TIMEOUT_SEGUNDOS = 15
USER_AGENT = "Mozilla/5.0 (compatible; VeloraRadar/1.0; coletor de veiculos; uso interno)"

# (nome do veículo, url do feed) — validados em 2026-11-06. Computerworld e CRN Brasil não responderam
# nesse dia (timeout); ficam de fora até alguém confirmar o endereço novo.
FEEDS: list[tuple[str, str]] = [
    ("Baguete", "https://www.baguete.com.br/rss"),
    ("Startups", "https://startups.com.br/feed/"),
    ("Startupi", "https://startupi.com.br/feed/"),
    ("NeoFeed", "https://neofeed.com.br/feed/"),
    ("Brazil Journal", "https://braziljournal.com/feed/"),
    ("IT Forum", "https://itforum.com.br/feed/"),
    ("Convergência Digital", "https://convergenciadigital.com.br/feed/"),
    ("TI Inside", "https://tiinside.com.br/feed/"),
    ("Mobile Time", "https://www.mobiletime.com.br/feed/"),
    ("Exame", "https://exame.com/feed/"),
    ("Meio & Mensagem", "https://www.meioemensagem.com.br/feed"),
]

MIN_LETRAS_RAZAO = 8  # razão social curta ("Gera Ltda") colide fácil; só usa a partir disso
SUFIXOS_RAZAO = re.compile(r"\b(ltda|s\.?a\.?|s/a|eireli|me|epp|sociedade|limitada|tecnologia|sistemas|software|informatica)\b\.?", re.I)


def buscar(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
        return r.read().decode("utf-8", errors="replace")


def texto_puro(trecho: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(trecho or ""))).strip()


def parsear(xml_bruto: str) -> list[dict]:
    raiz = ET.fromstring(xml_bruto)
    itens = []
    for item in raiz.iter("item"):
        titulo = texto_puro(item.findtext("title"))
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        if not (titulo and link and pub):
            continue
        try:
            data_fato = parsedate_to_datetime(pub).date()
        except (TypeError, ValueError):
            continue
        descricao = texto_puro(item.findtext("description"))[:600]
        itens.append({"titulo": titulo, "descricao": descricao, "link": link, "data": data_fato.isoformat()})
    return itens


def razao_util(conta: dict) -> str | None:
    """Razão social sem o sufixo jurídico, se for diferente do nome e longa o bastante pra não colidir."""
    razao = SUFIXOS_RAZAO.sub("", conta.get("razaoSocial") or "").strip(" .,-")
    if len(razao.replace(" ", "")) < MIN_LETRAS_RAZAO or normalizar(razao) == normalizar(conta["nome"]):
        return None
    return razao


def padroes_da_conta(conta: dict) -> list[tuple[str, re.Pattern, bool]]:
    """(motivo, padrão, sensível a maiúsculas). Conta com homônimo recorrente não casa pelo nome sozinho:
    só pela razão social ou por alguém do comitê."""
    padroes = []
    ambigua = conta.get("homonimos", 0) >= HOMONIMOS_LIMITE
    if not ambigua and not nome_curto_demais(conta["nome"]):
        curto = len(conta["nome"].replace(" ", "")) <= 6
        alvo = conta["nome"] if curto else normalizar(conta["nome"])
        padroes.append(("nome", re.compile(r"\b" + re.escape(alvo) + r"\b"), curto))
    razao = razao_util(conta)
    if razao:
        padroes.append(("razão social", re.compile(r"\b" + re.escape(normalizar(razao)) + r"\b"), False))
    for p in conta.get("comite", []):
        nome = (p.get("nome") or "").strip()
        if len(nome.split()) >= 2:  # nome e sobrenome; primeiro nome sozinho casa com qualquer um
            alternativas = "|".join(re.escape(normalizar(n)) for n in variantes_nome(nome))
            padroes.append((f"pessoa:{nome}", re.compile(r"\b(" + alternativas + r")\b"), False))
    return padroes


# Nome de pessoa sozinho colide ("Ricardo Azevedo" é nome comum): só vale com a conta citada junto ou com
# cara de movimentação de cargo na mesma matéria.
MOVIMENTO_CARGO = re.compile(
    r"\b(assume|assumiu|nomeia|nomeado|nomeada|contrata|contratou|chega|anuncia|promove|promovido|promovida|"
    r"novo|nova|deixa|ceo|cfo|cmo|cro|cto|coo|diretor|diretora|head|vp|vice-presidente|presidente|socio|socia)\b")


def casa(padroes: list[tuple[str, re.Pattern, bool]], texto: str) -> str | None:
    normal = normalizar(texto)
    achados = [motivo for motivo, padrao, sensivel in padroes if padrao.search(texto if sensivel else normal)]
    empresa = next((m for m in achados if not m.startswith("pessoa:")), None)
    pessoa = next((m for m in achados if m.startswith("pessoa:")), None)
    if pessoa and (empresa or MOVIMENTO_CARGO.search(normal)):
        return pessoa
    return empresa


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dias", type=int, default=JANELA_CAIXA_DIAS, help="ignora matérias mais velhas que isso")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()

    materias, erros = [], []
    for veiculo, url in FEEDS:
        try:
            itens = parsear(buscar(url))
        except (urllib.error.URLError, TimeoutError, ET.ParseError, ConnectionError) as e:
            erros.append((veiculo, str(e)))
            continue
        materias += [{**i, "fonte": veiculo} for i in itens if (hoje - date.fromisoformat(i["data"])).days <= args.dias]

    conhecidos = set(base.get("descartados", []))
    conhecidos |= {s["url"] for s in base.get("sinais", [])}
    for c in base["contas"]:
        conhecidos |= {h["url"] for h in c.get("historico", [])}

    novos, por_motivo = 0, {"nome": 0, "razão social": 0, "pessoa": 0}
    for conta in base["contas"]:
        padroes = padroes_da_conta(conta)
        if not padroes:
            continue
        for m in materias:
            if m["link"] in conhecidos:
                continue
            motivo = casa(padroes, f'{m["titulo"]} {m["descricao"]}')
            if not motivo:
                continue
            conhecidos.add(m["link"])
            sinal = {
                "id": f'{conta["id"]}-veiculo-{hashlib.sha1(m["link"].encode()).hexdigest()[:10]}',
                "contaId": conta["id"], "tipo": "noticia_setorial", "rotulo": "Notícia", "peso": 0,
                "porQueAgora": m["titulo"], "fonte": m["fonte"], "data": m["data"], "alertaEm": hoje.isoformat(),
                "url": m["link"], "exemplo": False, "abordar": escolher_abordar(conta.get("comite", [])), "pontos": 0,
            }
            if motivo.startswith("pessoa:"):
                sinal["pessoa"] = motivo.split(":", 1)[1]
                pessoa = next((p for p in conta["comite"] if p["nome"] == sinal["pessoa"]), None)
                if pessoa:  # a matéria é sobre essa pessoa: é com ela que se fala
                    sinal["abordar"] = {"nome": pessoa["nome"], "cargo": pessoa.get("cargo", ""), "papel": pessoa.get("papel", "influenciador")}
            base["sinais"].append(sinal)
            novos += 1
            por_motivo["pessoa" if motivo.startswith("pessoa:") else motivo] += 1

    base["sinais"].sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(FEEDS) - len(erros)} de {len(FEEDS)} feeds lidos · {len(materias)} matérias dos últimos {args.dias} dias")
    print(f"{novos} matérias citando contas (por nome: {por_motivo['nome']}, razão social: {por_motivo['razão social']}, "
          f"pessoa do comitê: {por_motivo['pessoa']}) — rode o classificador em seguida")
    for veiculo, msg in erros:
        print(f"  - {veiculo}: {msg}")


if __name__ == "__main__":
    main()
