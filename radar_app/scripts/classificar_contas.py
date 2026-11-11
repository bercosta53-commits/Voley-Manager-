#!/usr/bin/env python3
"""Classifica cada conta na taxonomia de TI da Velora: ramo (28), especialização (20), modelo e UF.

uso: python3 scripts/classificar_contas.py --exportar itens.json      # lê o site de cada conta e grava o que classificar
     python3 scripts/classificar_contas.py --respostas respostas.json # aplica a classificação pronta
     python3 scripts/classificar_contas.py --tudo ...                 # inclui contas já classificadas

A taxonomia é a da aba "Mestre · Regras" da planilha Radar Velora (05/11/2026): 28 ramos de TI em seis
famílias (SW software, SV serviços, IN infraestrutura, DA dados/IA, SE segurança, EN engenharia) e 20
especializações de mercado (ESP01 Fintech … ESP20 Foodtech). Ramo e especialização são campos diferentes:
uma fábrica de software que só atende hospitais é ramo SW01 + especialização ESP03 Healthtech; uma
consultoria que atende qualquer setor é especialização "Generalista / Multissetorial".

Para cada conta, a exportação junta o que dá pra ler sem custo: título, descrição e primeiro título do site
(home), CNAE da Receita quando o coletor de CNPJ já achou, e o endereço do rodapé (CEP + "Cidade - UF"),
que vira a UF quando a Receita não respondeu. A classificação em si (resposta) traz:
  {"chave": id da conta, "ramo": "SV10", "especializacao": "ESP03" | "GEN", "modelo": "servico" | "produto" |
   "misto", "uf": "SC" (opcional), "evidencia": "frase curta do que a empresa faz"}
Nada é inventado: sem evidência, ramo "A classificar" e UF "UF a validar".
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
USER_AGENT = "Mozilla/5.0 (compatible; VeloraRadar/1.0; classificador de contas; uso interno)"

RAMOS = {
    "SW01": "Desenvolvimento de Software", "SW02": "Sistemas de Gestão Empresarial", "SW03": "Software Especializado",
    "SW04": "SaaS B2B", "SW05": "Aplicativos e Produtos Digitais", "SW06": "Tecnologia para E-commerce",
    "SV07": "Consultoria em Tecnologia", "SV08": "Integração de Sistemas", "SV09": "Implantação de Sistemas",
    "SV10": "Outsourcing de Tecnologia", "SV11": "Serviços Gerenciados de TI",
    "IN12": "Cloud Computing", "IN13": "Data Centers e Hosting", "IN14": "Infraestrutura e Redes",
    "IN15": "Telecomunicações B2B", "IN16": "Hardware e Equipamentos de TI",
    "DA17": "Engenharia de Dados", "DA18": "Business Intelligence e Analytics", "DA19": "Inteligência Artificial",
    "DA20": "Automação de Processos",
    "SE21": "Cibersegurança", "SE22": "Identidade e Controle de Acesso", "SE23": "Segurança e Privacidade de Dados",
    "SE24": "Backup e Continuidade de Negócios",
    "EN25": "DevOps e Qualidade de Software", "EN26": "Observabilidade e Monitoramento",
    "EN27": "Internet das Coisas (IoT)", "EN28": "Automação Industrial",
}
FAMILIAS = {"SW": "Software e Plataformas", "SV": "Serviços e Integração", "IN": "Infraestrutura e Conectividade",
            "DA": "Dados, IA e Automação", "SE": "Segurança e Resiliência", "EN": "Engenharia e Tecnologias Especializadas"}
ESPECIALIZACOES = {
    "ESP01": "Fintech", "ESP02": "Insurtech", "ESP03": "Healthtech", "ESP04": "Edtech", "ESP05": "Agtech",
    "ESP06": "Retailtech", "ESP07": "Logtech", "ESP08": "Legaltech", "ESP09": "Govtech", "ESP10": "HR Tech",
    "ESP11": "Indústria 4.0", "ESP12": "Construtech", "ESP13": "Proptech", "ESP14": "Energytech", "ESP15": "Regtech",
    "ESP16": "Martech", "ESP17": "Adtech", "ESP18": "Mobilitytech", "ESP19": "Traveltech", "ESP20": "Foodtech",
    "GEN": "Generalista / Multissetorial",
}
MODELOS = {"servico", "produto", "misto"}
UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}


# ---------------------------------------------------------------- leitura do site


def buscar(url: str) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read(800_000).decode("utf-8", errors="replace")
    except Exception:  # site fora do ar, TLS antigo, bloqueio: fica sem descrição, não derruba a rodada
        return None


def meta(bruto: str, nome: str) -> str:
    m = re.search(rf'<meta[^>]+(?:name|property)=["\']{nome}["\'][^>]*content=["\']([^"\']+)', bruto, re.I) or \
        re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:name|property)=["\']{nome}["\']', bruto, re.I)
    return html.unescape(m.group(1)).strip() if m else ""


def limpar(trecho: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", trecho or ""))).strip()


UF_ENDERECO = re.compile(r"\b(?:[A-ZÀ-Ú][\wÀ-ú.' ]{2,40}?)\s*[-/–,]\s*(" + "|".join(sorted(UFS)) + r")\b(?=[\s,.\-|/]|$)")
CEP = re.compile(r"\b\d{5}-?\d{3}\b")


def uf_do_endereco(texto: str) -> str | None:
    """UF no rodapé: só aceita quando aparece perto de um CEP (evita "TI - SP" de título ou de lista de filiais).
    Se o rodapé tem endereços em mais de uma UF, devolve None: a sede fica pra Receita decidir."""
    achadas = set()
    for m in CEP.finditer(texto):
        janela = texto[max(0, m.start() - 160): m.end() + 80]
        achadas |= {u.group(1) for u in UF_ENDERECO.finditer(janela)}
    return achadas.pop() if len(achadas) == 1 else None


def ler_site(conta: dict) -> dict:
    bruto = None
    for prefixo in ("https://", "https://www."):
        bruto = buscar(prefixo + conta["dominio"])
        if bruto:
            break
    if not bruto:
        return {"site": "não respondeu"}
    sem_codigo = re.sub(r"<(script|style|noscript|svg)\b.*?</\1>", " ", bruto, flags=re.S | re.I)
    titulo = limpar((re.search(r"<title[^>]*>(.*?)</title>", sem_codigo, re.S | re.I) or [None, ""])[1])
    h1 = limpar((re.search(r"<h1[^>]*>(.*?)</h1>", sem_codigo, re.S | re.I) or [None, ""])[1])
    texto = limpar(sem_codigo)
    return {
        "titulo": titulo[:160], "descricao": (meta(bruto, "description") or meta(bruto, "og:description"))[:300],
        "h1": h1[:160], "trecho": texto[:400], "ufSite": uf_do_endereco(texto[-6000:]) or uf_do_endereco(texto),
    }


# ---------------------------------------------------------------- aplicar


def validar(bruto: list[dict]) -> dict[str, dict]:
    saida = {}
    for r in bruto:
        chave = r.get("chave")
        ramo = r.get("ramo")
        esp = r.get("especializacao") or "GEN"
        if not chave or (ramo not in RAMOS and ramo != "A classificar") or esp not in ESPECIALIZACOES:
            continue
        modelo = r.get("modelo") if r.get("modelo") in MODELOS else None
        uf = (r.get("uf") or "").upper() or None
        saida[chave] = {"ramo": ramo, "especializacao": esp, "modelo": modelo, "uf": uf if uf in UFS else None,
                        "ufFonte": r.get("ufFonte") or "site", "evidencia": (r.get("evidencia") or "").strip()[:200]}
    return saida


def aplicar(base: dict, respostas: dict[str, dict]) -> int:
    n = 0
    for conta in base["contas"]:
        r = respostas.get(conta["id"])
        if not r:
            continue
        ramo = r["ramo"]
        conta["ramoTI"] = {"codigo": ramo, "nome": RAMOS.get(ramo, "A classificar"),
                           "familia": FAMILIAS.get(ramo[:2], "") if ramo in RAMOS else ""}
        conta["especializacao"] = {"codigo": r["especializacao"], "nome": ESPECIALIZACOES[r["especializacao"]]}
        if r["modelo"]:
            conta["modeloNegocio"] = r["modelo"]
        if r["evidencia"]:
            conta["oQueFaz"] = r["evidencia"]
        # UF: a Receita (coletar_cnpj.py) manda; a classificação só preenche quando a Receita não achou.
        # "site" = endereço no rodapé do site; "pesquisa" = sede conhecida, ainda a validar na Receita.
        if conta.get("cnpj") and conta.get("uf"):
            conta["ufFonte"] = "receita"
        elif r["uf"]:
            conta["uf"] = r["uf"]
            conta["ufFonte"] = r["ufFonte"]
        # o app filtra por "segmento": passa a ser o ramo, legível (antes ficava vazio ou com o CNAE)
        conta["segmento"] = conta["ramoTI"]["nome"] if ramo in RAMOS else conta.get("segmento", "")
        n += 1
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exportar", type=Path, help="lê o site de cada conta e grava os itens a classificar")
    ap.add_argument("--respostas", type=Path, help="aplica a classificação pronta")
    ap.add_argument("--tudo", action="store_true", help="inclui contas que já têm ramo")
    args = ap.parse_args()
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    contas = [c for c in base["contas"] if args.tudo or not c.get("ramoTI")]

    if args.exportar:
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
            sites = list(ex.map(ler_site, contas))
        itens = [{"chave": c["id"], "empresa": c["nome"], "dominio": c["dominio"], "razaoSocial": c.get("razaoSocial", ""),
                  "cnae": c.get("cnae", ""), "uf": c.get("uf", ""), **s} for c, s in zip(contas, sites)]
        args.exportar.write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(itens)} contas exportadas · {sum(1 for s in sites if s.get('site') == 'não respondeu')} sites sem resposta "
              f"· {sum(1 for s in sites if s.get('ufSite'))} com UF no endereço do site")
        return
    if args.respostas:
        respostas = validar(json.loads(args.respostas.read_text(encoding="utf-8")))
        n = aplicar(base, respostas)
        DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(respostas)} respostas válidas · {n} contas classificadas")
        return
    sys.exit("use --exportar ou --respostas (ver --help)")


if __name__ == "__main__":
    main()
