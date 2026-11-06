"""Coletores das fontes brasileiras de alto sinal.

Cada coletor devolve ``ItemBruto``: o que a fonte publicou, com link e texto, sem julgamento. Quem
decide se é sinal é o classificador. O acesso à rede passa por ``buscar`` (URL -> bytes), que os
testes substituem por arquivos de exemplo.

Fontes desta fase: Google News (RSS por empresa), CNPJ na BrasilAPI (quadro societário e capital
social, comparados com a foto anterior), CVM (documentos IPE: fatos relevantes, comunicados e
emissões) e vagas, que chegam como itens importados (Indeed, Gupy e outros vêm pelo agente de
captação, porque não têm API pública estável).
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from typing import Callable, Iterable
from xml.etree import ElementTree

Buscar = Callable[[str], bytes]
AGENTE = "velora-radar/0.1 (+https://veloraconsulting.com.br)"


def buscar_http(url: str, timeout: float = 20.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - URLs fixas das fontes
        return resp.read()


@dataclass
class ItemBruto:
    coletor: str
    chave: str
    fonte: str
    titulo: str
    url: str | None = None
    texto: str = ""
    publicado_em: date | None = None
    tipo_sugerido: str | None = None
    bruto: dict = field(default_factory=dict)


@dataclass
class Conta:
    id: str
    nome: str
    cnpj_raiz: str | None = None
    cnpjs: list[str] = field(default_factory=list)
    dominio: str | None = None


# ---------- Google News ----------


def url_google_news(nome: str) -> str:
    q = urllib.parse.quote(f'"{nome}"')
    return f"https://news.google.com/rss/search?q={q}&hl=pt-BR&gl=BR&ceid=BR:pt-419"


def coletar_noticias(conta: Conta, buscar: Buscar = buscar_http, hoje: date | None = None, janela_dias: int = 30) -> list[ItemBruto]:
    hoje = hoje or date.today()
    raiz = ElementTree.fromstring(buscar(url_google_news(conta.nome)))
    itens = []
    for item in raiz.iter("item"):
        titulo = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        try:
            publicado = parsedate_to_datetime(item.findtext("pubDate") or "").date()
        except (TypeError, ValueError):
            continue  # sem data não dá para saber se é recente
        if not titulo or publicado < hoje - timedelta(days=janela_dias) or publicado > hoje:
            continue
        fonte = item.find("source")
        veiculo = (fonte.text or "").strip() if fonte is not None and fonte.text else "Google News"
        # O título do Google News termina com " - Veículo"; o texto útil é o que vem antes.
        if veiculo and titulo.endswith(f" - {veiculo}"):
            titulo = titulo[: -len(veiculo) - 3].strip()
        itens.append(
            ItemBruto(
                coletor="noticias",
                chave=(item.findtext("guid") or link or titulo)[:500],
                fonte=veiculo,
                titulo=titulo,
                url=link or None,
                texto=_sem_html(item.findtext("description") or ""),
                publicado_em=publicado,
            )
        )
    return itens


def _sem_html(texto: str) -> str:
    import html
    import re

    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", texto))).strip()


# ---------- CNPJ (BrasilAPI) ----------


def url_cnpj(cnpj: str) -> str:
    return f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"


def ler_cnpj(dados: dict) -> dict:
    """Reduz a resposta da BrasilAPI ao que interessa comparar semana a semana."""
    socios = sorted(
        {
            (
                (s.get("nome_socio") or "").strip(),
                (s.get("qualificacao_socio") or "").strip(),
                (s.get("data_entrada_sociedade") or "").strip(),
            )
            for s in dados.get("qsa") or []
            if s.get("nome_socio")
        }
    )
    return {
        "razao_social": dados.get("razao_social"),
        "capital_social": float(dados.get("capital_social") or 0),
        "situacao": dados.get("descricao_situacao_cadastral"),
        "socios": [{"nome": n, "qualificacao": q, "entrada": e} for n, q, e in socios],
    }


def diff_cnpj(conta: Conta, cnpj: str, atual: dict, anterior: dict | None, hoje: date, janela_dias: int = 90) -> list[ItemBruto]:
    """Novos sócios, saídas e aumento de capital desde a última foto.

    Sem foto anterior, só entram sócios com data de entrada recente: a primeira coleta não pode
    tratar o quadro inteiro como novidade.
    """
    link = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
    itens: list[ItemBruto] = []
    nomes_antes = {s["nome"] for s in (anterior or {}).get("socios", [])}
    for s in atual["socios"]:
        entrada = _data_iso(s["entrada"])
        recente = entrada is not None and hoje - timedelta(days=janela_dias) <= entrada <= hoje
        novo = anterior is not None and s["nome"] not in nomes_antes
        if recente or novo:
            itens.append(
                ItemBruto(
                    coletor="cnpj",
                    chave=f"{cnpj}:entrada:{s['nome']}:{s['entrada']}",
                    fonte="Receita Federal (QSA)",
                    titulo=f"{s['nome']} entrou no quadro societário como {s['qualificacao'] or 'sócio'}",
                    url=link,
                    texto=f"Quadro de sócios e administradores de {atual['razao_social']}: {s['nome']}, {s['qualificacao']}, entrada em {s['entrada'] or 'data não informada'}.",
                    publicado_em=entrada if recente else hoje,
                    tipo_sugerido="novos_socios",
                    bruto=s,
                )
            )
    if anterior is not None:
        nomes_agora = {s["nome"] for s in atual["socios"]}
        for s in anterior.get("socios", []):
            if s["nome"] not in nomes_agora:
                itens.append(
                    ItemBruto(
                        coletor="cnpj",
                        chave=f"{cnpj}:saida:{s['nome']}:{hoje.isoformat()}",
                        fonte="Receita Federal (QSA)",
                        titulo=f"{s['nome']} saiu do quadro societário",
                        url=link,
                        texto=f"{s['nome']} ({s['qualificacao']}) não consta mais no QSA de {atual['razao_social']}.",
                        publicado_em=hoje,
                        tipo_sugerido="saida_socio",
                        bruto=s,
                    )
                )
        antes, agora = anterior.get("capital_social") or 0, atual["capital_social"]
        if antes and agora > antes * 1.05:
            itens.append(
                ItemBruto(
                    coletor="cnpj",
                    chave=f"{cnpj}:capital:{agora:.2f}",
                    fonte="Receita Federal",
                    titulo=f"Capital social passou de R$ {antes:,.2f} para R$ {agora:,.2f}",
                    url=link,
                    texto=f"Aumento de capital social de {atual['razao_social']}: de {antes:,.2f} para {agora:,.2f}.",
                    publicado_em=hoje,
                    tipo_sugerido="aumento_capital",
                    bruto={"antes": antes, "agora": agora},
                )
            )
    return itens


def _data_iso(valor: str) -> date | None:
    try:
        return date.fromisoformat(valor[:10])
    except (TypeError, ValueError):
        return None


# ---------- CVM (documentos IPE) ----------

CATEGORIAS_CVM = {"Fato Relevante", "Comunicado ao Mercado", "Aviso aos Acionistas", "Valores Mobiliários"}


def url_cvm_ipe(ano: int) -> str:
    return f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{ano}.zip"


def ler_cvm_ipe(conteudo_zip: bytes) -> Iterable[dict]:
    with zipfile.ZipFile(io.BytesIO(conteudo_zip)) as z:
        for nome in z.namelist():
            if nome.endswith(".csv"):
                texto = z.read(nome).decode("latin-1")
                yield from csv.DictReader(io.StringIO(texto), delimiter=";")


def coletar_cvm(contas: list[Conta], buscar: Buscar = buscar_http, hoje: date | None = None, janela_dias: int = 30) -> dict[str, list[ItemBruto]]:
    """Baixa o arquivo do ano uma vez e distribui os documentos pelas contas, casando pela raiz do CNPJ."""
    hoje = hoje or date.today()
    por_raiz = {c.cnpj_raiz: c for c in contas if c.cnpj_raiz}
    saida: dict[str, list[ItemBruto]] = {c.id: [] for c in contas}
    anos = {hoje.year, (hoje - timedelta(days=janela_dias)).year}
    for ano in sorted(anos):
        for linha in ler_cvm_ipe(buscar(url_cvm_ipe(ano))):
            raiz = "".join(ch for ch in linha.get("CNPJ_Companhia", "") if ch.isdigit())[:8]
            conta = por_raiz.get(raiz)
            entrega = _data_iso(linha.get("Data_Entrega", ""))
            if not conta or not entrega or not (hoje - timedelta(days=janela_dias) <= entrega <= hoje):
                continue
            categoria = linha.get("Categoria", "").strip()
            assunto = (linha.get("Assunto") or "").strip()
            if categoria not in CATEGORIAS_CVM and "emiss" not in assunto.lower():
                continue
            sugerido = "emissao_titulos" if ("emiss" in assunto.lower() or "debênt" in assunto.lower()) else "fato_relevante"
            saida[conta.id].append(
                ItemBruto(
                    coletor="cvm",
                    chave=linha.get("Protocolo_Entrega") or f"{raiz}:{entrega}:{assunto}",
                    fonte=f"CVM ({categoria})",
                    titulo=assunto or categoria,
                    url=linha.get("Link_Download") or None,
                    texto=f"{linha.get('Nome_Companhia', '')}: {categoria} / {linha.get('Tipo', '')} / {linha.get('Especie', '')} - {assunto}".strip(),
                    publicado_em=entrega,
                    tipo_sugerido=sugerido,
                    bruto={k: v for k, v in linha.items() if v},
                )
            )
    return saida


# ---------- Vagas e outros itens importados ----------


def itens_importados(dados: list[dict], coletor: str = "vagas") -> list[tuple[str, ItemBruto]]:
    """Itens trazidos pelo agente de captação (Indeed, Glassdoor, Gupy...) em JSON.

    Formato: [{conta_id, titulo, url, fonte, texto?, publicado_em?, tipo_sugerido?}].
    """
    saida = []
    for d in dados:
        if not d.get("conta_id") or not d.get("titulo"):
            continue
        saida.append(
            (
                str(d["conta_id"]),
                ItemBruto(
                    coletor=coletor,
                    chave=(d.get("url") or f"{d['conta_id']}:{d['titulo']}")[:500],
                    fonte=d.get("fonte") or coletor,
                    titulo=str(d["titulo"])[:500],
                    url=d.get("url"),
                    texto=str(d.get("texto") or ""),
                    publicado_em=_data_iso(str(d.get("publicado_em") or "")),
                    tipo_sugerido=d.get("tipo_sugerido"),
                    bruto={k: v for k, v in d.items() if k != "conta_id"},
                ),
            )
        )
    return saida


def json_de(conteudo: bytes) -> dict:
    return json.loads(conteudo.decode("utf-8"))
