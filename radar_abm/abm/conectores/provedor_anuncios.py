"""Provedor das bibliotecas de anúncios: SearchAPI (https://www.searchapi.io), uma chave para Google e Meta.

Por que este provedor (pesquisa de 25/09/2026, detalhes em CONECTORES.md):
- Google: o dataset público do BigQuery só traz anunciantes que veicularam na Europa ou na Turquia; não cobre as
  contas brasileiras. Sobram provedores. SerpApi cobra US$ 25 por 1.000 buscas (plano Starter) e só faz Google.
- Meta: a API oficial da Ad Library, no Brasil, só entrega anúncios políticos. Para anúncios comerciais é preciso um
  provedor. O SearchAPI faz Google e Meta com a mesma chave, a US$ 4 por 1.000 buscas (plano Developer, US$ 40/mês,
  10 mil buscas), cobra só busca bem-sucedida e dá 100 buscas grátis para testar.

Cada chamada fica registrada em chamadas_provedor, com o custo estimado (RADAR_ANUNCIOS_CUSTO_BUSCA_USD).
A chave vai no cabeçalho Authorization, nunca no endereço (não aparece em log).

Os formatos de resposta seguem a documentação do SearchAPI. O da tela de detalhes do anúncio do Google (texto e
destino) não tinha exemplo completo na documentação: a leitura é tolerante e deve ser conferida na primeira chamada real.
"""

from __future__ import annotations

from urllib.parse import urlencode

from .. import config
from ..db import agora

BASE = "https://www.searchapi.io/api/v1/search"
PROVEDOR = "searchapi"


class SemChave(Exception):
    pass


class ProvedorAnuncios:
    def __init__(self, conn, http, dry_run: bool = False, conector: str = "anuncios"):
        self.conn = conn
        self.http = http
        self.dry_run = dry_run
        self.conector = conector
        self.chave = config.valor("SEARCHAPI_API_KEY")
        self.custo_busca = float(config.valor("RADAR_ANUNCIOS_CUSTO_BUSCA_USD", "0.004"))
        self.chamadas = 0

    def _get(self, operacao: str, chave_local: str, **params) -> dict:
        if not self.chave and not getattr(self.http, "pasta", None):
            raise SemChave("falta SEARCHAPI_API_KEY no .env (crie a conta em searchapi.io; as 100 primeiras buscas são grátis)")
        url = f"{BASE}?{urlencode({k: v for k, v in params.items() if v not in (None, '')})}"
        self.chamadas += 1
        dados = self.http.get_json(url, headers={"Authorization": f"Bearer {self.chave or ''}"}, chave=chave_local)
        if not self.dry_run:
            self.conn.execute(
                "insert into chamadas_provedor (provedor, conector, operacao, data, custo_usd) values (?, ?, ?, ?, ?)",
                (PROVEDOR, self.conector, operacao, agora(), self.custo_busca),
            )
        if isinstance(dados, dict) and dados.get("error"):
            raise RuntimeError(f"SearchAPI: {dados['error']}")
        return dados

    # ---------------------------------------------------------------- Google Ads Transparency Center

    def google_anunciantes(self, termo: str) -> dict:
        """Anunciantes cujo nome verificado casa com o termo (descoberta de IDs)."""
        return self._get("google_anunciantes", f"google_busca_{_arquivo(termo)}",
                         engine="google_ads_transparency_center_advertiser_search", q=termo, region="BR", num_advertisers=10)

    def google_anuncios(self, advertiser_id: str) -> dict:
        return self._get("google_anuncios", f"google_{advertiser_id}", engine="google_ads_transparency_center",
                         advertiser_id=advertiser_id, region="BR", num=100)

    def google_detalhe(self, advertiser_id: str, creative_id: str) -> dict:
        return self._get("google_detalhe", f"google_detalhe_{creative_id}", engine="google_ads_transparency_center_ad_details",
                         advertiser_id=advertiser_id, creative_id=creative_id)

    # ---------------------------------------------------------------- Meta Ad Library

    def meta_paginas(self, termo: str) -> dict:
        return self._get("meta_paginas", f"meta_busca_{_arquivo(termo)}", engine="meta_ad_library_page_search", q=termo, country="BR")

    def meta_anuncios(self, page_id: str) -> dict:
        return self._get("meta_anuncios", f"meta_{page_id}", engine="meta_ad_library", page_id=page_id, country="BR",
                         sort_by="most_recent")


def _arquivo(termo: str) -> str:
    """Nome de arquivo estável para a resposta salva de uma busca (testes sem internet)."""
    from ..identidade import sem_acentos

    return "".join(c if c.isalnum() else "_" for c in sem_acentos(termo).lower()).strip("_")[:60]


def custo_mensal(conn, desde: str) -> list[dict]:
    """Chamadas e custo estimado por provedor desde a data (AAAA-MM-DD)."""
    return [dict(r) for r in conn.execute(
        """select provedor, count(*) as chamadas, round(sum(custo_usd), 2) as custo_usd from chamadas_provedor
           where substr(data, 1, 10) >= ? group by provedor order by provedor""", (desde,))]
