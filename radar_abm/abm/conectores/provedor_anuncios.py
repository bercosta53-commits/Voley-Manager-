"""Provedores das bibliotecas de anúncios. O conector e a descoberta não sabem de qual provedor vem o dado: aqui cada
resposta é convertida para um formato só (o do SearchAPI, que foi o primeiro a ser implementado).

Caminho escolhido (RADAR_ANUNCIOS_PROVEDOR=gratuito, o padrão), decidido em 25/09/2026:
- Google: SerpApi, plano gratuito, 250 buscas por mês (chave SERPAPI_API_KEY). O SerpApi só aceita a chave no
  endereço; ela é mascarada em qualquer mensagem de erro.
- Meta: Apify, ator curious_coder/facebook-ads-library-scraper, US$ 0,75 por 1.000 anúncios; o plano gratuito do Apify dá
  US$ 5 de crédito por mês (token APIFY_TOKEN, enviado no cabeçalho).
- Trava de orçamento: antes de cada chamada, confere o gasto do mês (tabela chamadas_provedor). Passou de
  RADAR_SERPAPI_LIMITE_MES buscas ou de RADAR_APIFY_LIMITE_USD_MES dólares, a chamada não sai e o conector para com aviso.

Alternativa paga (RADAR_ANUNCIOS_PROVEDOR=searchapi): SearchAPI, Google e Meta com a mesma chave (SEARCHAPI_API_KEY),
US$ 40/mês por 10 mil buscas.

Por que não os outros: o dataset público do BigQuery só traz anunciantes que veicularam na Europa ou na Turquia, e a API
oficial da Meta, no Brasil, só entrega anúncios políticos. Detalhes e custos em CONECTORES.md.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from urllib.parse import quote, urlencode

from .. import config
from ..db import agora

SEARCHAPI = "https://www.searchapi.io/api/v1/search"
SERPAPI = "https://serpapi.com/search.json"
APIFY_ATOR = "curious_coder~facebook-ads-library-scraper"
APIFY = f"https://api.apify.com/v2/acts/{APIFY_ATOR}/run-sync-get-dataset-items"
REGIAO_BRASIL_SERPAPI = "2076"


class SemChave(Exception):
    pass


class LimiteMensal(Exception):
    """O orçamento do mês do provedor acabou: a chamada não foi feita."""


def _iso(valor) -> str | None:
    """Data em ISO a partir de texto ISO ou de segundos desde 1970 (o formato do SerpApi e da Meta)."""
    if valor in (None, ""):
        return None
    if isinstance(valor, (int, float)) or (isinstance(valor, str) and valor.isdigit()):
        return datetime.fromtimestamp(int(valor), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(valor)


def _arquivo(termo: str) -> str:
    """Nome de arquivo estável para a resposta salva de uma busca (testes sem internet)."""
    from ..identidade import sem_acentos

    return "".join(c if c.isalnum() else "_" for c in sem_acentos(termo).lower()).strip("_")[:60]


def url_biblioteca_meta(page_id: str | None = None, termo: str | None = None) -> str:
    base = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&media_type=all"
    if page_id:
        return f"{base}&search_type=page&view_all_page_id={page_id}"
    return f"{base}&search_type=keyword_unordered&q={quote(termo or '')}"


class ProvedorAnuncios:
    def __init__(self, conn, http, dry_run: bool = False, conector: str = "anuncios", tipo: str | None = None):
        self.conn = conn
        self.http = http
        self.dry_run = dry_run
        self.conector = conector
        self.tipo = tipo or config.valor("RADAR_ANUNCIOS_PROVEDOR", "gratuito")
        self.local = bool(getattr(http, "pasta", None))
        self.chamadas = 0
        self._paginas_vistas: dict[str, list] = {}  # anúncios já trazidos na busca de páginas (descoberta)
        if self.tipo == "searchapi":
            self.provedor_google = self.provedor_meta = "searchapi"
            self.custo_busca = float(config.valor("RADAR_ANUNCIOS_CUSTO_BUSCA_USD", "0.004"))
        else:
            self.provedor_google, self.provedor_meta = "serpapi", "apify"
            self.custo_busca = 0.0  # SerpApi gratuito; o custo do Apify é por anúncio
        self.custo_anuncio_apify = float(config.valor("RADAR_APIFY_CUSTO_ANUNCIO_USD", "0.00075"))
        self.limite_serpapi = int(config.valor("RADAR_SERPAPI_LIMITE_MES", "250"))
        self.limite_apify = float(config.valor("RADAR_APIFY_LIMITE_USD_MES", "5"))
        self.max_anuncios_pagina = int(config.valor("RADAR_APIFY_MAX_ANUNCIOS_PAGINA", "30"))

    # ------------------------------------------------------------------ orçamento e registro

    def uso_do_mes(self, provedor: str) -> tuple[int, float]:
        inicio = date.today().replace(day=1).isoformat()
        r = self.conn.execute("select count(*), coalesce(sum(custo_usd), 0) from chamadas_provedor where provedor = ? and substr(data, 1, 10) >= ?",
                              (provedor, inicio)).fetchone()
        return int(r[0]), float(r[1])

    def _conferir_orcamento(self, provedor: str) -> None:
        if self.local:
            return
        n, custo = self.uso_do_mes(provedor)
        if provedor == "serpapi" and n >= self.limite_serpapi:
            raise LimiteMensal(f"SerpApi: {n} buscas este mês, limite gratuito de {self.limite_serpapi}; o Google volta no mês que vem")
        if provedor == "apify" and custo >= self.limite_apify:
            raise LimiteMensal(f"Apify: US$ {custo:.2f} gastos este mês, limite de US$ {self.limite_apify:.2f}; o Meta volta no mês que vem")

    def _registrar(self, provedor: str, operacao: str, custo: float) -> None:
        if not self.dry_run:
            self.conn.execute(
                "insert into chamadas_provedor (provedor, conector, operacao, data, custo_usd) values (?, ?, ?, ?, ?)",
                (provedor, self.conector, operacao, agora(), custo))

    def _chave(self, variavel: str, onde: str) -> str:
        valor = config.valor(variavel)
        if not valor and not self.local:
            raise SemChave(f"falta {variavel} no ambiente ({onde})")
        return valor or ""

    # ------------------------------------------------------------------ chamadas por provedor

    def _searchapi(self, operacao: str, chave_local: str, **params) -> dict:
        chave = self._chave("SEARCHAPI_API_KEY", "conta em searchapi.io; as 100 primeiras buscas são grátis")
        url = f"{SEARCHAPI}?{urlencode({k: v for k, v in params.items() if v not in (None, '')})}"
        self.chamadas += 1
        dados = self.http.get_json(url, headers={"Authorization": f"Bearer {chave}"}, chave=chave_local)
        self._registrar("searchapi", operacao, self.custo_busca)
        if isinstance(dados, dict) and dados.get("error"):
            raise RuntimeError(f"SearchAPI: {dados['error']}")
        return dados

    def _serpapi(self, operacao: str, chave_local: str, **params) -> dict:
        chave = self._chave("SERPAPI_API_KEY", "conta gratuita em serpapi.com, 250 buscas por mês")
        self._conferir_orcamento("serpapi")
        publico = {k: v for k, v in params.items() if v not in (None, "")}
        url = f"{SERPAPI}?{urlencode({**publico, 'api_key': chave})}"
        self.chamadas += 1
        try:
            dados = self.http.get_json(url, chave=chave_local)
        except Exception as e:  # a chave vai no endereço: nunca deixa ela aparecer numa mensagem
            raise RuntimeError(str(e).replace(chave, "***") if chave else str(e)) from None
        self._registrar("serpapi", operacao, 0.0)
        if isinstance(dados, dict) and dados.get("error"):
            erro = str(dados["error"])
            if "hasn't returned any results" in erro or "no results" in erro.lower():
                return {}
            raise RuntimeError(f"SerpApi: {erro}")
        return dados

    def _apify(self, operacao: str, chave_local: str, url_biblioteca: str) -> list[dict]:
        token = self._chave("APIFY_TOKEN", "conta gratuita em apify.com, US$ 5 de crédito por mês")
        self._conferir_orcamento("apify")
        corpo = {"urls": [{"url": url_biblioteca}], "count": self.max_anuncios_pagina,
                 "limitPerSource": self.max_anuncios_pagina, "scrapeAdDetails": False,
                 "scrapePageAds.activeStatus": "all", "scrapePageAds.sortBy": "most_recent",
                 "scrapePageAds.countryCode": "BR"}
        self.chamadas += 1
        itens = self.http.post_json(APIFY, corpo, headers={"Authorization": f"Bearer {token}"}, chave=chave_local)
        itens = itens if isinstance(itens, list) else (itens or {}).get("items") or []
        self._registrar("apify", operacao, round(len(itens) * self.custo_anuncio_apify, 4))
        return itens

    # ------------------------------------------------------------------ Google

    def google_anunciantes(self, termo: str) -> dict:
        """Anunciantes cujo nome casa com o termo: {"advertisers": [{"id", "name", "region", "ads_count"}]}."""
        if self.provedor_google == "searchapi":
            return self._searchapi("google_anunciantes", f"google_busca_{_arquivo(termo)}",
                                   engine="google_ads_transparency_center_advertiser_search", q=termo, region="BR",
                                   num_advertisers=10)
        dados = self._serpapi("google_anunciantes", f"google_busca_{_arquivo(termo)}", engine="google_ads_transparency_center",
                              text=termo, region=REGIAO_BRASIL_SERPAPI, num=100)
        grupos: dict[str, dict] = {}
        for c in dados.get("ad_creatives") or []:
            aid = c.get("advertiser_id")
            if aid:
                g = grupos.setdefault(aid, {"id": aid, "name": c.get("advertiser") or "", "region": "BR", "ads_count": 0})
                g["ads_count"] += 1
        return {"advertisers": list(grupos.values())}

    def google_anuncios(self, advertiser_id: str) -> dict:
        """{"ad_creatives": [{"id", "advertiser": {"id", "name"}, "first_shown_datetime", "last_shown_datetime", "format", "target_domain"}]}"""
        if self.provedor_google == "searchapi":
            return self._searchapi("google_anuncios", f"google_{advertiser_id}", engine="google_ads_transparency_center",
                                   advertiser_id=advertiser_id, region="BR", num=100)
        dados = self._serpapi("google_anuncios", f"google_{advertiser_id}", engine="google_ads_transparency_center",
                              advertiser_id=advertiser_id, region=REGIAO_BRASIL_SERPAPI, num=100)
        return {"ad_creatives": [{
            "id": c.get("ad_creative_id"), "advertiser": {"id": c.get("advertiser_id"), "name": c.get("advertiser")},
            "first_shown_datetime": _iso(c.get("first_shown")), "last_shown_datetime": _iso(c.get("last_shown")),
            "format": c.get("format") or "", "target_domain": c.get("target_domain") or "",
            "details_link": c.get("details_link") or ""} for c in dados.get("ad_creatives") or []]}

    def google_detalhe(self, advertiser_id: str, creative_id: str) -> dict:
        if self.provedor_google == "searchapi":
            return self._searchapi("google_detalhe", f"google_detalhe_{creative_id}", engine="google_ads_transparency_center_ad_details",
                                   advertiser_id=advertiser_id, creative_id=creative_id)
        return self._serpapi("google_detalhe", f"google_detalhe_{creative_id}", engine="google_ads_transparency_center_ad_details",
                             advertiser_id=advertiser_id, creative_id=creative_id, region=REGIAO_BRASIL_SERPAPI)

    # ------------------------------------------------------------------ Meta

    def meta_paginas(self, termo: str) -> dict:
        """Páginas que anunciam com o termo: {"page_results": [{"page_id", "name"}]}."""
        if self.provedor_meta == "searchapi":
            return self._searchapi("meta_paginas", f"meta_busca_{_arquivo(termo)}", engine="meta_ad_library_page_search",
                                   q=termo, country="BR")
        # No Apify, a busca por palavra já traz os anúncios: as páginas saem deles, e os anúncios ficam guardados para a
        # conferência de domínio não precisar de outra rodada paga.
        itens = [ler_item_apify(i) for i in self._apify("meta_paginas", f"meta_busca_{_arquivo(termo)}", url_biblioteca_meta(termo=termo))]
        paginas: dict[str, dict] = {}
        for a in itens:
            pid = a["page_id"]
            if pid:
                paginas.setdefault(pid, {"page_id": pid, "name": a["snapshot"].get("page_name") or "", "ads": 0})["ads"] += 1
                self._paginas_vistas.setdefault(pid, []).append(a)
        return {"page_results": list(paginas.values())}

    def meta_anuncios(self, page_id: str) -> dict:
        """{"ads": [{"ad_archive_id", "page_id", "is_active", "start_date", "end_date", "snapshot": {...}}]}"""
        if self.provedor_meta == "searchapi":
            return self._searchapi("meta_anuncios", f"meta_{page_id}", engine="meta_ad_library", page_id=page_id, country="BR",
                                   sort_by="most_recent")
        if page_id in self._paginas_vistas:
            return {"ads": self._paginas_vistas[page_id]}
        return {"ads": [ler_item_apify(i) for i in self._apify("meta_anuncios", f"meta_{page_id}", url_biblioteca_meta(page_id=page_id))]}


def _campo(item: dict, *nomes, padrao=None):
    for n in nomes:
        if item.get(n) not in (None, ""):
            return item[n]
    return padrao


def ler_item_apify(i: dict) -> dict:
    """Um anúncio do ator do Apify no formato comum. O ator devolve o JSON da própria biblioteca da Meta (snake_case);
    alguns campos podem vir em camelCase, e as datas em segundos desde 1970."""
    s = dict(_campo(i, "snapshot", padrao={}) or {})
    corpo = s.get("body")
    if isinstance(corpo, str):
        s["body"] = {"text": corpo}
    elif isinstance(corpo, dict) and "markup" in corpo and "text" not in corpo:
        s["body"] = {"text": re.sub(r"<[^>]+>", " ", str((corpo.get("markup") or {}).get("__html", "")))}
    s.setdefault("page_name", _campo(i, "page_name", "pageName", padrao=""))
    return {"ad_archive_id": str(_campo(i, "ad_archive_id", "adArchiveID", "adArchiveId", "ad_id", padrao="")),
            "page_id": str(_campo(i, "page_id", "pageID", "pageId", padrao="") or s.get("page_id") or ""),
            "is_active": bool(_campo(i, "is_active", "isActive", padrao=False)),
            "start_date": _iso(_campo(i, "start_date", "startDate")), "end_date": _iso(_campo(i, "end_date", "endDate")),
            "snapshot": s}


def custo_mensal(conn, desde: str) -> list[dict]:
    """Chamadas e custo estimado por provedor desde a data (AAAA-MM-DD)."""
    return [dict(r) for r in conn.execute(
        """select provedor, count(*) as chamadas, round(sum(custo_usd), 2) as custo_usd from chamadas_provedor
           where substr(data, 1, 10) >= ? group by provedor order by provedor""", (desde,))]
