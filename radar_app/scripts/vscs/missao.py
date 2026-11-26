"""Missão declarada da nova liderança (VSCS 3.3, pesos aprovados em 26/11).

"Novo CRO" diz que alguém chegou; "novo CRO para abrir grandes contas na América do Norte" diz a prioridade, o
horizonte e a oferta que encaixa. A missão é atributo da nomeação, não um sinal novo: multiplica a força da
nomeação (×1,00 genérica, ×1,15 específica, ×1,20 específica com meta ou praça), não conta como corroboração e não
ajuda a chegar à faixa 90+. Na dúvida, ×1,00.

Vale só para o anúncio: só os documentos do dia do anúncio são lidos. Vaga com missão não pesa. Não há tabela
missão → oferta: a missão aparece pelo trecho literal e a oferta decorre dela.

Fonte da missão, em ordem: revisão (`_revisao.missao`) → campo `missao` gravado pelo classificador → leitura
conservadora do título e do contexto, só em construções de mandato ("para abrir…", "com a missão de…",
"responsável por expandir…"). O texto devolvido é sempre o trecho literal, nunca paráfrase.
"""
from __future__ import annotations

import re

from .classificar import norm

TIPOS = ("grandes_contas", "expansao_geografica", "conversao_eficiencia", "novo_mercado", "estruturar_time_canal", "lancamento_produto")

VERBO = r"(?:abrir|expandir|ampliar|acelerar|aumentar|dobrar|triplicar|liderar|levar|estruturar|montar|criar|construir|conquistar|entrar|consolidar|reduzir|melhorar)"
MANDATO = re.compile(
    r"\b(?:com a missao de|tera a missao de|cuja missao e|missao de|com o objetivo de|com o desafio de|tera o desafio de|para|responsavel por|"
    r"com foco em|focad[oa] em|vai|ira)\s+(?P<missao>" + VERBO + r"\b[^.;()]{3,110})")

PRACA = re.compile(r"\b(america do norte|america latina|latam|estados unidos|eua|mexico|europa|portugal|argentina|chile|colombia|"
                   r"nordeste|norte|sul|sudeste|centro-oeste|interior|internacional|exterior|novos paises|novo pais|nova regiao|"
                   r"(?:estado|regiao|praca|mercado) (?:de|do|da) [a-z]+(?: [a-z]+)?)\b")
META = re.compile(r"(\d+[.,]?\d*\s*(%|x|vezes|milh(ao|oes)|bilh(ao|oes)|mil\b)|\b(dobrar|triplicar|duplicar)\b|\bate (o fim de )?20[2-3]\d\b|\bem 20[2-3]\d\b)")
TIPO_RX = [
    ("expansao_geografica", re.compile(r"\b(internacionaliza\w*|america do norte|america latina|latam|estados unidos|eua|mexico|europa|internacional|exterior|regiao|regional|pais|paises|praca|nordeste)\b")),
    ("grandes_contas", re.compile(r"\b(grandes contas|enterprise|key accounts?|contas estrategicas|contas-chave|grandes empresas|corporate)\b")),
    ("conversao_eficiencia", re.compile(r"\b(conversao|previsibilidade|previsivel|recorrente|eficiencia|funil|cac|churn|ticket medio|produtividade|forecast|pipeline)\b")),
    ("lancamento_produto", re.compile(r"\b(lancamento|novo produto|nova solucao|go-to-market d[oa])\b")),
    ("novo_mercado", re.compile(r"\b(mercado de|vertical|novo segmento|novos segmentos|setor de|segmento de)\b")),
    ("estruturar_time_canal", re.compile(r"\b(montar o time|montar a equipe|estruturar (o|a|os|as)? ?(time|equipe|area|canais?|parcerias)|criar a area|canais|parcerias|parceiros|aliancas|revenda|ecossistema)\b")),
]
GENERICA = re.compile(r"^(?:liderar|acelerar|ampliar|aumentar|fortalecer|consolidar|impulsionar)\s+(?:o |a )?(?:crescimento|resultados?|vendas|receita|area comercial|negocio|empresa|operacao)\b(?:\s+da empresa)?\s*$")


def ler_do_texto(texto: str) -> dict | None:
    """Missão a partir do texto, ou None. Só construções de mandato; corta no primeiro ponto, ponto e vírgula ou parêntese."""
    t = norm(texto)
    m = MANDATO.search(t)
    if not m:
        return None
    trecho = re.split(r"\s+(?:e |que |apos |segundo |conforme |informou|disse)", m.group("missao"))[0].strip(" ,")
    tipo = next((nome for nome, rx in TIPO_RX if rx.search(trecho)), "generica")
    praca = PRACA.search(trecho)
    meta = META.search(trecho)
    especifica = tipo != "generica" and not GENERICA.match(trecho)
    return {"tipo": tipo if especifica else "generica", "texto": trecho[:120], "especifica": especifica,
            "meta": meta.group(0) if (especifica and meta) else None,
            "praca": praca.group(0) if (especifica and praca and tipo == "expansao_geografica") else None,
            "confianca": 0.7 if especifica else 0.5, "origem": "texto"}


def fator(m: dict | None, cfg: dict) -> float:
    if not m or not m.get("especifica") or m.get("tipo") in (None, "generica"):
        return 1.0
    if float(m.get("confianca", 1.0) or 0) < cfg.get("confianca_minima", 0.6):
        return 1.0
    f = cfg["fatores"]
    return float(f["especifica_com_meta_ou_praca"] if (m.get("meta") or m.get("praca")) else f["especifica"])


def missao(cl: dict, docs: list[dict], cfg: dict) -> dict | None:
    """Missão do acontecimento: {tipo, texto, fator, origem} ou None quando não se aplica ou não há missão."""
    if not cfg or not cl.get("nomeacao") or cl.get("nivel") not in cfg.get("niveis", []):
        return None
    # válida só para o anúncio (decisão de 26/11): lê apenas os documentos do dia do anúncio; notícia posterior
    # sobre a mesma nomeação não cria nem muda a missão
    datas = [str(ev.get("data") or "")[:10] for ev in docs if ev.get("data")]
    if datas:
        docs = [ev for ev in docs if str(ev.get("data") or "")[:10] == min(datas)]
    achada = None
    for ev in docs:
        for fonte, m in (("revisao", (ev.get("_revisao") or {}).get("missao")), ("registro", ev.get("missao"))):
            if isinstance(m, dict) and m.get("tipo"):
                achada = dict(m, origem=fonte)
                break
        if achada:
            break
    if not achada:
        for ev in docs:
            achada = ler_do_texto(f'{ev.get("sinal") or ""}. {ev.get("porQueAgora") or ""}')
            if achada:
                break
    if not achada:
        return None
    return {"tipo": achada.get("tipo"), "texto": achada.get("texto"), "fator": fator(achada, cfg), "origem": achada.get("origem")}
