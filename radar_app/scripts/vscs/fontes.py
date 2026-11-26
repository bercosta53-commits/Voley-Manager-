"""Taxonomia de fonte da 3.3: quanto o Radar confia que o fato aconteceu como descrito.

Ordem (fator multiplica a base do sinal):
  institucional          1,00  site/comunicado/RI da empresa, página de carreiras, registro público, página do evento
  declaracao_direta      0,95  o próprio executivo, com nome e cargo, em entrevista ou post (vale para o que ELE diz)
  secundaria_corroborada 0,95  dois ou mais veículos independentes (domínios diferentes, não republicação do mesmo release)
  imprensa_reputada      0,90  veículo da lista curada
  secundaria             0,80  outros veículos, blogs setoriais, agregadores
  indicio                0,60  confiança de classificação entre 0,60 e 0,85, ou inferência
  (descartado)           0,00  confiança abaixo de 0,60 ou sem leitura do fato

Confiança (do classificador) e fonte (do veículo) são coisas diferentes: a confiança limita o teto (indício), a fonte
dá o nível. Corroboração documental só sobe o nível da fonte de UM acontecimento; nunca vira um segundo gatilho.
"""
from __future__ import annotations

from urllib.parse import urlparse

from .classificar import norm


def _dominio(url: str) -> str:
    try:
        h = urlparse(url or "").netloc.lower()
    except ValueError:
        return ""
    return h[4:] if h.startswith("www.") else h


def classificar_fonte(ev: dict, p33: dict) -> tuple[str, float]:
    f = p33["fonte"]
    if ev.get("interacao"):
        return "institucional", f["institucional"]
    if "match_confidence" in ev or "classification_confidence" in ev:
        c = min(float(ev.get("match_confidence", 1.0)), float(ev.get("classification_confidence", 1.0)))
        if c < f["confianca_minima"]:
            return "descartado", 0.0
        if c < f["confianca_indicio"]:
            return "indicio", f["indicio"]
    elif not ev.get("sinal"):
        return "descartado", 0.0
    if ev.get("fonteTipo") == "declaracao_executivo":
        return "declaracao_direta", f["declaracao_direta"]
    nome = ev.get("fonte") or ""
    if nome in f["institucionais"] or ev.get("evento"):
        return "institucional", f["institucional"]
    if nome in f["declaracao"]:
        return "declaracao_direta", f["declaracao_direta"]
    veiculos = {_dominio(x.get("url", "")) or norm(x.get("fonte", "")) for x in (ev.get("fontes") or []) if x.get("url") or x.get("fonte")}
    veiculos.discard("")
    if len(veiculos) >= 2 and not ev.get("release"):
        return "secundaria_corroborada", f["secundaria_corroborada"]
    if nome in f["reputadas"]:
        return "imprensa_reputada", f["imprensa_reputada"]
    return "secundaria", f["secundaria"]


ORDEM = ["descartado", "indicio", "secundaria", "imprensa_reputada", "secundaria_corroborada", "declaracao_direta", "institucional"]


def corroborar(niveis: list[str], dominios: set[str], p33: dict) -> tuple[str, float]:
    """Vários documentos do MESMO acontecimento: fica o melhor nível; dois veículos independentes sobem a imprensa
    para "corroborada". Não soma pontos."""
    f = p33["fonte"]
    melhor = max(niveis, key=ORDEM.index)
    if melhor in ("secundaria", "imprensa_reputada") and len(dominios) >= 2:
        return "secundaria_corroborada", f["secundaria_corroborada"]
    return melhor, 0.0 if melhor == "descartado" else f[melhor]
