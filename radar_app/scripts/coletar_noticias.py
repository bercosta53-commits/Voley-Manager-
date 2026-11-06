#!/usr/bin/env python3
"""Conector de notícias: busca cada conta real no Google Notícias e grava sinais em data/contas.local.json.

uso: python3 scripts/coletar_noticias.py [--limite N] [--dormir SEGUNDOS]

Para cada conta, busca o nome da empresa entre aspas no Google Notícias (RSS, sem chave), filtra o que
não parece ser mesmo sobre a empresa, classifica por palavra-chave (troca de liderança, fusão, captação,
lançamento, expansão, parceria — senão cai em "notícia setorial", peso baixo) e grava:
  - itens dos últimos 45 dias → sinais[] (a caixa de Hoje)
  - itens mais antigos → historico[] da própria conta (linha do tempo, não entra na caixa)
Roda de novo por cima é seguro: cada item é identificado pelo link, então não duplica.

É um primeiro passo deliberadamente simples (classificação por palavra-chave, não por IA) — ver
radar/05-conectores-fontes.md, categoria 3.4. A spec descreve resolução de entidade por confiança e
classificação via Claude; aqui a verificação de relevância é um filtro de texto, e o "Classificador (IA)"
continua cadastrado à parte em scripts/gerar_dados.py como uma fonte própria, ainda não implementada.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from email.utils import parsedate_to_datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
JANELA_CAIXA_DIAS = 45  # mais novo que isso -> sinais[] (caixa de Hoje); mais velho -> historico[] direto
MEIA_VIDA_DIAS = 60  # mesmo decaimento usado em gerar_dados.py, pra pontos_em() ficar comparável
MAX_ITENS_POR_CONTA = 5
TIMEOUT_SEGUNDOS = 10
USER_AGENT = "Mozilla/5.0 (compatible; VeloraRadar/1.0; coletor de noticias; uso interno)"


def sem_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn")


def normalizar(texto: str) -> str:
    return sem_acentos(texto or "").lower().strip()


# ---------- classificação por palavra-chave (ver docstring: é um primeiro passo, não é o Classificador IA) ----------

CLASSIFICACAO: list[tuple[str, int, str, list[str]]] = [
    ("troca_lideranca", 9, "Troca de liderança", [
        "novo ceo", "nova ceo", "novo cfo", "nova cfo", "novo cro", "nova cro", "novo cmo", "nova cmo",
        "novo coo", "nova coo", "novo cto", "nova cto", "novo cio", "nova cio", "novo cpo", "nova cpo",
        "novo diretor", "nova diretora", "novo presidente", "nova presidente", "novo vp", "nova vp",
        "novo vice-presidente", "nova vice-presidente", "assume a presidencia", "assume como",
        "e o novo", "e a nova", "nomeado", "nomeada",
        "como chief", "como ceo", "como cfo", "como cro", "como cmo", "como coo", "como cto", "como cio",
        "como diretor", "como diretora", "como presidente", "como novo", "como nova",
    ]),
    ("fusao_aquisicao", 9, "Fusão ou aquisição", [
        "adquire", "aquisicao", "fusao", "compra a", "incorpora", "e comprada", "e adquirida",
    ]),
    ("captacao", 8, "Captação", [
        "capta", "rodada de investimento", "aporte de", "recebe investimento", "rodada serie",
        "serie a", "serie b", "serie c",
    ]),
    ("lancamento_produto", 6, "Lançamento de produto", [
        "lanca", "lancamento", "anuncia novo", "anuncia nova", "apresenta nova", "apresenta novo",
        "nova plataforma", "novo produto",
    ]),
    ("expansao_comercial", 6, "Expansão", [
        "nova unidade", "abre escritorio", "expande operacao", "expande atuacao", "nova sede",
        "chega a", "inaugura",
    ]),
    ("parceria", 5, "Nova parceria", [
        "parceria com", "firma parceria", "anuncia parceria", "fecha parceria",
    ]),
]
# sem palavra-chave: notícia que só cita a empresa. Peso 0 e fora da caixa até o classificador dizer o que é.
PADRAO_TIPO, PADRAO_PESO, PADRAO_ROTULO = "noticia_setorial", 0, "Notícia"


def classificar(titulo: str, descricao: str) -> tuple[str, int, str]:
    texto = normalizar(f"{titulo} {descricao}")
    for tipo, peso, rotulo, palavras in CLASSIFICACAO:
        if any(p in texto for p in palavras):
            return tipo, peso, rotulo
    return PADRAO_TIPO, PADRAO_PESO, PADRAO_ROTULO


def pontos_em(peso: int, fato: date, hoje: date) -> float:
    """Mesmo decaimento de gerar_dados.py: peso x 4, caindo pela metade a cada MEIA_VIDA_DIAS dias."""
    if hoje < fato:
        return 0.0
    return peso * 4 * 0.5 ** ((hoje - fato).days / MEIA_VIDA_DIAS)


# ---------- busca e parsing do RSS ----------


# Conta cujo nome também é de pessoa, filme ou palavra comum ("Holmes" traz Elizabeth Holmes e Sherlock,
# "Assertiva" traz "comunicação assertiva"): depois que o classificador descartar HOMONIMOS_LIMITE notícias
# dela como "não é sobre esta empresa", a busca passa a exigir junto do nome algo que só a empresa tem —
# o site e o nome das pessoas do comitê. Palavra genérica ("empresa", "startup") não serve: Elizabeth
# Holmes também é empresária.
HOMONIMOS_LIMITE = 2
MAX_PESSOAS_NA_BUSCA = 5


def consulta_da_conta(conta: dict) -> str:
    nome = f'"{conta["nome"]}"'
    if conta.get("homonimos", 0) < HOMONIMOS_LIMITE:
        return nome
    termos = [conta["dominio"]] if conta.get("dominio") else []
    termos += [f'"{p["nome"]}"' for p in conta.get("comite", [])[:MAX_PESSOAS_NA_BUSCA] if p.get("nome")]
    return f"{nome} ({' OR '.join(termos)})" if termos else nome


SUFIXOS_NOME = {"junior", "jr", "filho", "neto", "sobrinho", "segundo", "terceiro"}
PARTICULAS = {"de", "da", "do", "das", "dos", "e"}


def variantes_nome(nome: str) -> list[str]:
    """Formas como a imprensa escreve o nome de alguém do comitê: o cadastro traz "Peter Kreslins Junior" ou
    "Eduardo Maia Machado", a matéria diz "Peter Kreslins" ou "Eduardo Machado". Devolve o nome completo e
    primeiro nome + último sobrenome (sem partículas e sem Junior/Filho/Neto). Primeiro + segundo nome fica
    de fora: "Luiz Fernando" sozinho casa com qualquer um."""
    partes = [t for t in nome.split() if normalizar(t) not in PARTICULAS]
    sem_sufixo = [t for t in partes if normalizar(t).strip(".") not in SUFIXOS_NOME]
    variantes = [nome.strip()]
    if len(sem_sufixo) >= 2:
        variantes.append(f"{sem_sufixo[0]} {sem_sufixo[-1]}")
    vistos, saida = set(), []
    for v in variantes:
        if normalizar(v) not in vistos:
            vistos.add(normalizar(v))
            saida.append(v)
    return saida


def buscar_rss(consulta_texto: str) -> str:
    consulta = urllib.parse.quote(consulta_texto)
    url = f"https://news.google.com/rss/search?q={consulta}&hl=pt-BR&gl=BR&ceid=BR:pt-BR"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
        return r.read().decode("utf-8", errors="replace")


def extrair_fonte(titulo: str, descricao_html: str) -> tuple[str, str]:
    """O RSS do Google Notícias sufixa o título com " - Veículo"; separa isso do título de verdade."""
    m = re.match(r"^(.*)\s-\s([^-]+)$", titulo)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    m2 = re.search(r'<font[^>]*>(.*?)</font>', descricao_html)
    return titulo.strip(), (html.unescape(m2.group(1)).strip() if m2 else "Google Notícias")


def parsear_itens(xml_bruto: str) -> list[dict]:
    raiz = ET.fromstring(xml_bruto)
    itens = []
    for item in raiz.findall("./channel/item"):
        titulo_bruto = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_data = (item.findtext("pubDate") or "").strip()
        descricao_html = item.findtext("description") or ""
        if not (titulo_bruto and link and pub_data):
            continue
        titulo, fonte = extrair_fonte(titulo_bruto, descricao_html)
        try:
            data_fato = parsedate_to_datetime(pub_data).date()
        except (TypeError, ValueError):
            continue
        itens.append({"titulo": titulo, "link": link, "data": data_fato.isoformat(), "fonte": fonte, "descricao": descricao_html})
    return itens


NOME_CURTO_LIMITE = 6  # nome (sem espaço) até esse tamanho pode colidir com palavra comum — ver relevante()


def relevante(nome_empresa: str, titulo: str, descricao: str) -> bool:
    """Filtro de relevância simples: o nome precisa aparecer como palavra de verdade (borda de palavra,
    não substring) no título ou na descrição — "ATRA" não casa dentro de "atraso". Nome curto (até
    NOME_CURTO_LIMITE letras) também precisa bater maiúscula/minúscula exatas, porque é mais fácil virar
    uma palavra comum usada em outro sentido (ex.: "Gera" dentro de "a empresa gera receita").
    Isso não é resolução de entidade de verdade — a spec pede confiança + fila de revisão manual para
    isso — só evita o caso óbvio de a busca "entre aspas" do Google trazer algo sem relação nenhuma.
    Mesmo assim, nome curto que também é sobrenome comum (ex. uma pessoa chamada "Ambra") ainda passa:
    é a limitação conhecida de um filtro de texto, não de uma classificação por IA."""
    texto_visivel = re.sub(r"<[^>]+>", " ", html.unescape(f"{titulo} {descricao}"))
    if len(nome_empresa.replace(" ", "")) <= NOME_CURTO_LIMITE:
        padrao = r"\b" + re.escape(nome_empresa) + r"\b"
        return re.search(padrao, texto_visivel) is not None
    padrao = r"\b" + re.escape(normalizar(nome_empresa)) + r"\b"
    return re.search(padrao, normalizar(texto_visivel)) is not None


# ---------- construção do sinal/evento no formato do app ----------


def escolher_abordar(comite: list[dict]) -> dict:
    decisor = next((p for p in comite if p.get("papel") == "decisor"), None)
    pessoa = decisor or (comite[0] if comite else None)
    if not pessoa:
        return {"nome": "", "cargo": "", "papel": "influenciador"}
    return {"nome": pessoa["nome"], "cargo": pessoa.get("cargo", ""), "papel": pessoa.get("papel", "influenciador")}


def id_sinal(conta_id: str, url: str) -> str:
    """sha1 (não o hash() embutido — não é determinístico entre execuções) pra manter o mesmo id entre
    rodadas: o app guarda estado do usuário (adiado, abordado) por id do sinal, no localStorage."""
    return f"{conta_id}-noticia-{hashlib.sha1(url.encode()).hexdigest()[:10]}"


MIN_LETRAS_NOME = 5  # nome (sem espaço) menor que isso: pula a busca, não arrisca publicar sinal errado


def nome_curto_demais(nome: str) -> bool:
    """Nome de até 4 letras colide fácil com sigla, ticker de bolsa ou palavra comum — "ATRA" bateu com
    um avião de testes da Airbus (registro ATRA) e com o ticker da Nasdaq, "Ambra" com o sobrenome de uma
    pessoa pública; nenhum filtro de texto resolve isso com segurança. Melhor pular e sinalizar do que
    publicar um sinal sobre a empresa errada — ver "Decisões em aberto" no relatório final."""
    return len(nome.replace(" ", "")) < MIN_LETRAS_NOME


def coletar_conta(
    conta: dict, sinais_existentes: list[dict], hoje: date, descartados: frozenset[str] = frozenset()
) -> tuple[list[dict], list[dict], int, str | None]:
    """Retorna (novos_sinais, novos_eventos_historico, total_itens_relevantes, erro). O chamador já
    filtrou nome_curto_demais() antes de chegar aqui. `descartados` são links que o classificador já
    marcou como "não é sobre esta empresa" (homônimo): não voltam."""
    nome = conta["nome"]
    try:
        xml_bruto = buscar_rss(consulta_da_conta(conta))
    except (urllib.error.URLError, TimeoutError) as e:
        return [], [], 0, str(e)

    try:
        itens = parsear_itens(xml_bruto)
    except ET.ParseError as e:
        return [], [], 0, f"RSS inválido: {e}"

    links_conhecidos = {s["url"] for s in conta.get("historico", [])}
    links_conhecidos |= {s["url"] for s in sinais_existentes}
    links_conhecidos |= descartados

    sinais, eventos = [], []
    vistos = 0
    for item in sorted(itens, key=lambda i: i["data"], reverse=True):
        if not relevante(nome, item["titulo"], item["descricao"]):
            continue
        if item["link"] in links_conhecidos:
            continue
        if vistos >= MAX_ITENS_POR_CONTA:
            break
        vistos += 1
        links_conhecidos.add(item["link"])
        data_fato = date.fromisoformat(item["data"])
        tipo, peso, rotulo = classificar(item["titulo"], item["descricao"])
        dias_atras = (hoje - data_fato).days

        if dias_atras <= JANELA_CAIXA_DIAS:
            sinais.append({
                "tipo": tipo, "rotulo": rotulo, "peso": peso, "porQueAgora": item["titulo"],
                "fonte": item["fonte"], "data": item["data"], "alertaEm": hoje.isoformat(),
                "url": item["link"], "exemplo": False,
                "abordar": escolher_abordar(conta.get("comite", [])),
                "pontos": round(pontos_em(peso, data_fato, hoje)),
            })
        else:
            eventos.append({
                "tipo": tipo, "rotulo": rotulo, "porQueAgora": item["titulo"], "fonte": item["fonte"],
                "data": item["data"], "url": item["link"], "exemplo": False,
            })
    return sinais, eventos, vistos, None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limite", type=int, default=None, help="só as N primeiras contas (pra testar rápido)")
    ap.add_argument("--dormir", type=float, default=0.4, help="segundos de espera entre buscas (padrão 0.4)")
    ap.add_argument("--so-ambiguas", action="store_true",
                    help="só as contas com homônimo recorrente (refaz a busca delas com site e comitê)")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()

    contas = base["contas"]
    if args.so_ambiguas:
        contas = [c for c in contas if c.get("homonimos", 0) >= HOMONIMOS_LIMITE]
    if args.limite:
        contas = contas[: args.limite]
    sinais_por_conta: dict[str, list[dict]] = {}
    for s in base.get("sinais", []):
        sinais_por_conta.setdefault(s["contaId"], []).append(s)
    descartados = frozenset(base.get("descartados", []))

    total_novos_sinais = total_novos_eventos = total_contas_com_novidade = total_buscadas = 0
    pulados: list[str] = []
    erros: list[tuple[str, str]] = []
    for i, conta in enumerate(contas, 1):
        if nome_curto_demais(conta["nome"]):
            pulados.append(conta["nome"])
        else:
            existentes = sinais_por_conta.get(conta["id"], [])
            novos_sinais, novos_eventos, vistos, erro = coletar_conta(conta, existentes, hoje, descartados)
            total_buscadas += 1

            if erro:
                erros.append((conta["nome"], erro))
            else:
                if novos_sinais:
                    for s in novos_sinais:
                        base["sinais"].append({"id": id_sinal(conta["id"], s["url"]), "contaId": conta["id"], **s})
                    sinais_por_conta.setdefault(conta["id"], []).extend(novos_sinais)
                if novos_eventos:
                    conta.setdefault("historico", []).extend(novos_eventos)
                    conta["historico"].sort(key=lambda h: h["data"], reverse=True)
                if novos_sinais or novos_eventos:
                    total_contas_com_novidade += 1
                total_novos_sinais += len(novos_sinais)
                total_novos_eventos += len(novos_eventos)
            time.sleep(args.dormir)

        if i % 25 == 0 or i == len(contas):
            print(f"  {i}/{len(contas)} contas processadas...", file=sys.stderr)

    base["geradoEm"] = hoje.isoformat()
    base["sinais"].sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{total_buscadas} contas buscadas · {total_contas_com_novidade} com novidade")
    print(f"{total_novos_sinais} sinais novos na caixa · {total_novos_eventos} eventos novos no histórico")
    if pulados:
        print(f"{len(pulados)} pulada(s) por nome curto demais (menos de {MIN_LETRAS_NOME} letras — risco de achar a empresa errada): {', '.join(pulados)}")
    if erros:
        print(f"{len(erros)} erro(s):")
        for nome, msg in erros[:10]:
            print(f"  - {nome}: {msg}")
        if len(erros) > 10:
            print(f"  ... e mais {len(erros) - 10}")


if __name__ == "__main__":
    main()
