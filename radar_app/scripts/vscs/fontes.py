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


def _nivel_por_nome(nome: str, ev: dict, f: dict) -> str:
    if nome in f["institucionais"] or ev.get("evento"):
        return "institucional"
    if nome in f["declaracao"] or ev.get("fonteTipo") == "declaracao_executivo":
        return "declaracao_direta"
    if nome in f["reputadas"]:
        return "imprensa_reputada"
    return "secundaria"


def teto_confianca(ev: dict, p33: dict) -> str | None:
    """Limite imposto pela confiança do classificador: None (sem limite), "indicio" ou "descartado"."""
    f = p33["fonte"]
    if "match_confidence" in ev or "classification_confidence" in ev:
        c = min(float(ev.get("match_confidence", 1.0)), float(ev.get("classification_confidence", 1.0)))
        if c < f["confianca_minima"]:
            return "descartado"
        if c < f["confianca_indicio"]:
            return "indicio"
    return None


def classificar_fonte(ev: dict, p33: dict) -> tuple[str, float]:
    """Nível do DOCUMENTO pela sua fonte principal, limitado pela confiança. Não promove por corroboração: isso é
    decidido só em corroborar(), com as regras de independência."""
    f = p33["fonte"]
    if ev.get("interacao"):
        return "institucional", f["institucional"]
    if ev.get("fonteNivelRevisado") in ORDEM:
        n = ev["fonteNivelRevisado"]
        return n, float(ev.get("fonteFatorRevisado", 0.0 if n == "descartado" else f[n]))
    teto = teto_confianca(ev, p33)
    if teto == "descartado" or (teto is None and not ev.get("sinal") and "classification_confidence" not in ev and "match_confidence" not in ev):
        return "descartado", 0.0
    if teto == "indicio":
        return "indicio", f["indicio"]
    n = _nivel_por_nome(ev.get("fonte") or "", ev, f)
    return n, f[n]


def testemunhos(ev: dict, nivel_doc: str, doc_id: str, p33: dict) -> list[tuple[str, str]]:
    """Fontes INDEPENDENTES que o documento traz: (chave de independência, nível). Regras:
    - documento descartado ou só indício (confiança baixa) não testemunha: não serve para corroborar;
    - mesmo domínio conta uma vez;
    - release (`release: true` no documento) ou entradas marcadas `replicado`/`release` colapsam numa só
      testemunha: republicar o mesmo texto não é confirmação independente;
    - a entrada herda o teto de confiança do documento (nunca passa do nível do documento quando ele é revisado)."""
    if nivel_doc in ("descartado", "indicio"):
        return []
    f = p33["fonte"]
    if ev.get("release"):
        return [("release", nivel_doc)]  # todas as cópias do mesmo release, em qualquer veículo, são uma testemunha
    out: dict[str, str] = {}
    principal = _dominio(ev.get("url", "")) or norm(ev.get("fonte", "")) or f"doc:{doc_id}"
    out[principal] = nivel_doc
    for x in ev.get("fontes") or []:
        if not isinstance(x, dict) or not (x.get("url") or x.get("fonte")):
            continue
        if x.get("replicado") or x.get("release"):
            continue  # cópia do mesmo texto: não é testemunha independente
        k = _dominio(x.get("url", "")) or norm(x.get("fonte", ""))
        n = _nivel_por_nome(x.get("fonte") or "", {}, f)
        if ev.get("fonteNivelRevisado"):
            n = min(n, nivel_doc, key=ORDEM.index)
        if k and (k not in out or ORDEM.index(n) > ORDEM.index(out[k])):
            out[k] = n
    return list(out.items())


ORDEM = ["descartado", "indicio", "secundaria", "imprensa_reputada", "secundaria_corroborada", "declaracao_direta", "institucional"]


def corroborar(niveis: list[str], testemunhas: list[tuple[str, str]], p33: dict) -> tuple[str, float]:
    """Vários documentos do MESMO acontecimento. Fica o melhor nível dos documentos; imprensa (secundária ou
    reputada) sobe para "corroborada" só com duas ou mais testemunhas independentes (chaves distintas, cada uma
    com nível de pelo menos secundária). Indício nunca é promovido. Não soma pontos."""
    f = p33["fonte"]
    melhor = max(niveis, key=ORDEM.index)
    chaves = {k for k, n in testemunhas if ORDEM.index(n) >= ORDEM.index("secundaria")}
    if melhor in ("secundaria", "imprensa_reputada") and len(chaves) >= 2:
        return "secundaria_corroborada", f["secundaria_corroborada"]
    return melhor, 0.0 if melhor == "descartado" else f[melhor]
