#!/usr/bin/env python3
"""Pontuação ABM por sinais — VSCS 3.0 (Radar Velora, 06/11/2026), sobre o serviço do score v2 (spec 06).

uso: python3 scripts/score_v2.py [--exibir] [--relatorio caminho.md]

Cada sinal: s = score_base × fonte × 0.5^(idade/meia-vida) × correlação (2º da mesma categoria 0.7, 3º+ 0.5).
Cada conta: VSCS = 100 × [1 − Π(1 − 0.5·s/100)] + bônus de convergência (+5 com 2 categorias, +8 com 3+, s ≥ 40,
janela de 45 dias). Status: monitoramento < 40 ≤ atenção < 55 ≤ oportunidade emergente < 70 ≤ alta < 85 ≤ máxima.
A ação vem da matriz ICP × VSCS; intenção direta (fonte primária, base ≥ 75, até 30 dias) é via rápida, fora do
score. O ICP não altera o VSCS.

Saída em conta["v2"]: vscs, vscs_base, bônus, status, ação, via rápida, fit, access, engagement, proximity, anel,
contribuições (cada fator de cada sinal) e a frase de explicação. Com --exibir, o VSCS vira o score do app
(score, série de 90 dias, tendência de 30 dias e composição).

Como os tipos do radar viram tipos do modelo: a taxonomia dos coletores é a do classificador (executivo_chegou,
captacao, expansao_mercado...). Detalhes que o classificador ainda não grava em campo próprio (cargo de quem
chegou, estágio da rodada, se a expansão já aconteceu ou é declaração) são decididos por regra de texto em
nivelar(). Cada regra está anotada.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
VERSAO = "vscs-3.0"

# ---------------------------------------------------------------- parâmetros (VSCS 3.0, seções 2 e 3) — editáveis


@dataclass(frozen=True)
class Param:
    tipo: str  # tipo do spec 06 (rótulo da composição e chave da avaliação 1/2/3 no app)
    categoria: str  # categoria do VSCS: define meia-vida, correlação e convergência
    base: int  # score_base 0–100: força do fato para growth, vendas ou GTM COM A VELORA (âncoras da seção 2.1)
    antes: int = 0  # dias ANTES do fato em que já conta (evento futuro: feira, palestra)

    @property
    def nivel(self) -> str:  # cor e ordem na caixa de Hoje
        return "A" if self.base >= 75 else "B" if self.base >= 50 else "C"


# seção 2.3. "contexto" é extensão nossa: presença em evento, palestra e prêmio não estão nas seis categorias do
# modelo, mas a base tem esses fatos — entram com score_base baixo e meia-vida curta, como contexto.
MEIA_VIDA = {"lideranca": 60, "expansao": 90, "gtm": 60, "contratacao": 45, "estrategia": 60, "intencao": 15, "contexto": 30,
             "negativo": 90}
CATEGORIA_ROTULO = {"lideranca": "Mudança de liderança", "expansao": "Expansão e investimento",
                    "gtm": "Transformação comercial", "contratacao": "Contratações estratégicas",
                    "estrategia": "Movimentos estratégicos", "intencao": "Intenção e engajamento", "contexto": "Contexto",
                    "negativo": "Sinal negativo"}

P = {
    # mudança de liderança (70–95): CMO/CRO ~95, diretor/head comercial ~85, gerente de marketing ~70
    "troca_lideranca_cxo": Param("troca_lideranca", "lideranca", 95),
    "troca_lideranca_owner": Param("troca_lideranca", "lideranca", 85),
    "troca_lideranca_ceo": Param("troca_lideranca", "lideranca", 70),
    "troca_lideranca_clevel": Param("troca_lideranca", "lideranca", 50),  # CFO/CTO: abaixo da faixa, conta pela força real
    # expansão e investimento (75–90): rodada com plano de expansão ~90, filial em região já atendida ~75
    "captacao_a": Param("captacao", "expansao", 90),
    "captacao_seed": Param("captacao", "expansao", 70),
    "expansao_comercial": Param("expansao_comercial", "expansao", 85),
    "nova_filial": Param("nova_filial", "expansao", 75),
    "declaracao_meta": Param("declaracao_expansao", "expansao", 65),  # promessa com número/prazo: ainda não é fato
    "declaracao_especifica": Param("declaracao_expansao", "expansao", 55),
    "declaracao_generica": Param("declaracao_expansao", "expansao", 30),
    # contratações estratégicas (65–85): Head de Growth/Vendas ou formação de time ~85, 1 vaga de SDR ~65
    "vaga_lideranca_growth": Param("vaga_lideranca_alvo", "contratacao", 85),
    "vaga_lideranca_alvo": Param("vaga_lideranca_alvo", "contratacao", 80),
    "vaga_area_time": Param("vaga_area_alvo", "contratacao", 75),  # 5+ vagas na área: formação de time
    "vaga_area_alvo": Param("vaga_area_alvo", "contratacao", 65),
    # movimentos estratégicos (65–85): aquisição/reposicionamento ~85, produto em linha existente ~65
    # M&A separado em três (pedido de 2026-11-06): comprar é movimento estratégico; ser comprada é NEGATIVO
    # (decisão sobe para a controladora, orçamento congela na integração); fusão fica no meio
    "aquisicao_feita": Param("aquisicao_feita", "estrategia", 85),
    "aquisicao_planejada": Param("aquisicao_feita", "estrategia", 65),
    "fusao": Param("fusao", "estrategia", 70),
    "foi_adquirida": Param("foi_adquirida", "negativo", 30),  # base = pontos que tira do VSCS no dia do fato
    "lancamento_novo_vertical": Param("lancamento_produto", "estrategia", 75),
    "lancamento_comum": Param("lancamento_produto", "estrategia", 65),
    "nova_parceria": Param("nova_parceria", "estrategia", 50),
    "reestruturacao": Param("reestruturacao", "estrategia", 40),  # demissões/saída de executivo: não é GTM
    # contexto
    "presenca_patrocinador": Param("presenca_evento", "contexto", 45, 30),
    "presenca_expositor": Param("presenca_evento", "contexto", 40, 30),
    "presenca_startup": Param("presenca_evento", "contexto", 25, 30),
    "palestra_lideranca": Param("palestra_lideranca", "contexto", 35, 30),
    "premio": Param("premio", "contexto", 20),
    "noticia_setorial": Param("noticia_setorial", "contexto", 0),
    # intenção e engajamento (75–100): interação recorrente ~75, pedido de diagnóstico/reunião ~100
    "intencao_diagnostico": Param("intencao", "intencao", 100),
    "intencao_download": Param("intencao", "intencao", 80),
    "intencao_servicos": Param("intencao", "intencao", 75),
    "intencao_linkedin": Param("intencao", "intencao", 60),
    "intencao_site": Param("intencao", "intencao", 50),
    "intencao_email": Param("intencao", "intencao", 50),
}
INTERACAO_CHAVE = {"pedido_diagnostico": "intencao_diagnostico", "pedido_reuniao": "intencao_diagnostico",
                   "download": "intencao_download", "visita_servicos": "intencao_servicos",
                   "conexao_linkedin": "intencao_linkedin", "visita_site": "intencao_site", "clique_email": "intencao_email"}

# sinais negativos (extensão nossa): não entram no produto do VSCS; o mais forte é subtraído do resultado
CATEGORIAS_NEGATIVAS = {"negativo"}
K = 0.5  # seção 3.1: um sinal sozinho vale no máximo 100 × K
CORRELACAO = (1.0, 0.7)  # 3º em diante na mesma categoria: 0.5
CORRELACAO_RESTO = 0.5
JANELA_CONVERGENCIA = 45
S_MINIMO_CONVERGENCIA = 40
BONUS_CONVERGENCIA = {2: 5, 3: 8}  # 3+ categorias = 8
FAIXAS = ((85, "Prioridade máxima"), (70, "Alta prioridade"), (55, "Oportunidade emergente"), (40, "Atenção"),
          (0, "Monitoramento"))
# seção 6: ação = ICP × status (índice da faixa: 0 monitoramento … 4 máxima)
MATRIZ = {
    "A": ("Monitorar", "Ampliar pesquisa", "Abordagem contextualizada", "ABM personalizado", "1:1 executivo"),
    "B": ("Monitorar", "Monitorar", "Ampliar pesquisa", "Abordagem contextualizada", "ABM personalizado"),
    "C": ("Ignorar", "Monitorar", "Monitorar", "Revisar ICP da conta", "Revisar ICP da conta"),
}
ACOES_DE_ABORDAGEM = {"Abordagem contextualizada", "ABM personalizado", "1:1 executivo"}
# seção 2.2: vaga publicada, site oficial, perfil do executivo, página do evento = primária
FONTES_PRIMARIAS = {"Página de carreiras", "Indeed", "Site da empresa", "Comunicado", "Página do evento"}
FONTE_PRIMARIA, FONTE_SECUNDARIA, FONTE_INDICIO = 1.0, 0.85, 0.60
CONFIANCA_MINIMA = 0.6
UFS_ALVO = {"SP", "PR", "SC", "RS"}
LIMIAR_FIT = 0.6


# ---------------------------------------------------------------- texto


def norm(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


INTENCAO = re.compile(r"\b(mira|miram|planeja|quer|preve|projeta|projetam|meta|vai|vao|busca|pretende|espera|aposta|plano|prepara|estrategias)\b")
NUMERO_OU_PRAZO = re.compile(r"\d")
CARGO_OWNER = re.compile(
    r"\b(cmo|cro|cco|cso|chief (revenue|marketing|commercial|sales)|head (de |of )?(marketing|vendas|growth|receita|comercial|parcerias|negocios)"
    r"|diretor[a]? (executivo )?(de )?(marketing|comercial|vendas|growth|receita|negocios|parcerias)|vp (de )?(marketing|vendas|growth|receita|comercial)"
    r"|vice-presidente (de )?(marketing|vendas|comercial|negocios)|lider(anca)?s? (de |para )?(marketing|comercial|receita|growth)|gerente (de )?marketing|marketing)\b")
FOI_ADQUIRIDA = re.compile(r"\b(adquirida|comprada|comprado|vendida|passou a integrar|passou para o controle|entrou no grupo"
                           r"|capital comprado|compra concluida|aquisicao concluida|acquired by)\b")
FUSAO = re.compile(r"\b(fusao|funde|fundem|fundiu|merge|merger)\b")
AQUISICAO_PLANEJADA = re.compile(r"\b(reservad[oa]|planeja|pretende|mira|busca)\b.{0,40}\baquisic")
COMPRADORA = re.compile(r"(?:adquirida|comprada|vendida|controle|integrar o?|entrou no|concluida) (?:pel[ao]s?|por|para|da|do|grupo)?\s*"
                        r"(?:italiana |canadense |grupo |fundo )?([a-z0-9][a-z0-9.&-]{1,})")
CARGO_CXO = re.compile(r"\b(cmo|cro|cco|cso|chief (revenue|marketing|commercial|sales|growth))\b")
CARGO_CEO = re.compile(r"\b(ceo|presidente|socio|socia|socio-diretor|socia-diretora|fundador|diretor executivo|diretora executiva)\b")
CARGO_CLEVEL = re.compile(r"\b(cfo|cto|coo|cio|ciso|cpo|chief|vp|vice-presidente|diretor|diretora)\b")
SEED = re.compile(r"\b(seed|pre-seed|anjo|anjos|angel|aceleracao)\b")
SERIE = re.compile(r"\bserie [a-z]\b|\bipo\b")
VALOR = re.compile(r"(r\$|us\$|€)\s*([\d.,]+)\s*(mil|mi|milhoes|milhao|bi|bilhao|bilhoes)?")
NOVO_VERTICAL = re.compile(r"\b(novo vertical|entra(da)? no mercado|entrou no mercado|novo mercado|estreia no mercado|entrada no)\b")
CHEGADA = re.compile(r"\b(chega|chegou|chegada|entrada|entra|entrou|expande|expandiu|amplia|ampliou|abre|abriu|inaugura|inaugurou|nova operacao)\b")


def valor_em_milhoes_reais(texto: str) -> float | None:
    m = VALOR.search(texto)
    if not m:
        return None
    moeda, numero, escala = m.groups()
    try:
        v = float(numero.replace(".", "").replace(",", "."))
    except ValueError:
        return None
    if escala in ("bi", "bilhao", "bilhoes"):
        v *= 1000
    elif escala == "mil":
        v /= 1000
    elif escala is None:
        v /= 1_000_000
    return v * (5.5 if moeda in ("us$", "€") else 1.0)


def nivelar(ev: dict) -> str | None:
    """Tipo do radar + texto → chave de P (ou None: não pontua). Regras do spec 2.2 e 2.4."""
    tipo = ev["tipo"]
    texto = norm(f'{ev.get("sinal", "")} {ev.get("porQueAgora", "")}')
    if tipo == "executivo_chegou":
        if CARGO_CXO.search(texto):
            return "troca_lideranca_cxo"
        if CARGO_OWNER.search(texto):
            return "troca_lideranca_owner"
        if CARGO_CEO.search(texto):
            return "troca_lideranca_ceo"
        if CARGO_CLEVEL.search(texto):
            return "troca_lideranca_clevel"
        return None  # "demais cargos: não pontua"
    if tipo == "captacao":
        if SEED.search(texto):
            return "captacao_seed"
        if SERIE.search(texto):
            return "captacao_a"
        v = valor_em_milhoes_reais(texto)
        # sem estágio declarado: R$ 10 mi ou mais é tratado como Série A ou maior
        return "captacao_a" if v is not None and v >= 10 else "captacao_seed"
    if tipo in ("expansao_mercado", "nova_unidade", "resultados_crescimento"):
        if INTENCAO.search(texto):
            return "declaracao_meta" if NUMERO_OU_PRAZO.search(texto) else "declaracao_especifica"
        if tipo == "resultados_crescimento":
            return "declaracao_generica"  # crescimento já realizado: otimismo/contexto, não gatilho
        if tipo == "nova_unidade" and not CHEGADA.search(texto):
            return "nova_filial"
        return "expansao_comercial" if tipo == "expansao_mercado" or "chega" in texto else "nova_filial"
    if tipo == "vaga_expansao_comercial":
        return "expansao_comercial"
    if tipo == "vaga_lideranca_alvo":
        if ev.get("focoGrowthRevenue") or re.search(r"\b(growth|revenue|receita|revops|demand|aquisicao|gtm)\b", texto):
            return "vaga_lideranca_growth"
        return "vaga_lideranca_alvo"
    if tipo == "vaga_area_alvo":
        return "vaga_area_time" if (ev.get("qtdVagas") or 1) >= 5 else "vaga_area_alvo"
    if tipo == "fusao_aquisicao":
        if FOI_ADQUIRIDA.search(texto):
            return "foi_adquirida"
        if FUSAO.search(texto):
            return "fusao"
        if AQUISICAO_PLANEJADA.search(texto):
            return "aquisicao_planejada"
        return "aquisicao_feita"
    if tipo in ("lancamento_produto", "lancamento_servico", "lancamento_ia"):
        return "lancamento_novo_vertical" if NOVO_VERTICAL.search(texto) else "lancamento_comum"
    if tipo == "parceria":
        return "nova_parceria"
    if tipo == "presenca_evento":
        papel = (ev.get("evento") or {}).get("papel", "expositor")
        return {"patrocinador": "presenca_patrocinador", "startup": "presenca_startup"}.get(papel, "presenca_expositor")
    if tipo in ("palestra_lideranca", "palestra_evento"):
        return "palestra_lideranca"
    if tipo in ("layoffs", "executivo_saiu"):
        return "reestruturacao"
    if tipo == "premio":
        return "premio"
    if tipo == "noticia_setorial":
        return "noticia_setorial"
    return None


# ---------------------------------------------------------------- sinal: fonte × tempo × correlação (seção 2)


def fator_temporal(p: Param, dias: int) -> float:
    """dias = hoje - data do fato (negativo = evento futuro). 0.5^(idade/meia-vida), zero depois de 3 meias-vidas."""
    if dias < 0:
        return 1.0 if -dias <= p.antes else 0.0
    mv = MEIA_VIDA[p.categoria]
    if dias > 3 * mv:
        return 0.0
    return 0.5 ** (dias / mv)


def fator_fonte(ev: dict) -> float:
    """Seção 2.2. Sem classificação (sem "sinal") = sem leitura verificada do fato: não conta. Com campos de
    confiança de match/classificação, confiança abaixo de 0.6 não conta e até 0.85 é indício (0.6)."""
    if ev.get("interacao"):
        return FONTE_PRIMARIA
    if "match_confidence" in ev or "classification_confidence" in ev:
        c = min(ev.get("match_confidence", 1.0), ev.get("classification_confidence", 1.0))
        if c < CONFIANCA_MINIMA:
            return 0.0
        if c < 0.85:
            return FONTE_INDICIO
    elif not ev.get("sinal"):
        return 0.0
    if ev.get("fonte") in FONTES_PRIMARIAS or ev.get("evento"):
        return FONTE_PRIMARIA
    return FONTE_SECUNDARIA


@dataclass
class Contribuicao:
    chave: str
    tipo: str
    categoria: str
    nivel: str
    base: int
    fonte: float
    tempo: float
    correlacao: float
    s: float  # 0–100, o que entra na fórmula da conta
    data: str
    texto: str
    id: str = ""
    marginal: float = 0.0  # quanto este sinal somou ao VSCS_base (na ordem do mais forte para o mais fraco)

    @property
    def pre(self) -> float:
        return self.base * self.fonte * self.tempo


def contribuicoes(eventos: list[dict], hoje: date, interacoes: list[dict] | None = None) -> list[Contribuicao]:
    """Um registro por acontecimento (a melhor evidência), com o fator de correlação da categoria."""
    evs = list(eventos) + [{"tipo": i["tipo"], "data": i["data"], "interacao": True, "sinal": i.get("rotulo") or i["tipo"],
                            "id": f'int-{i["tipo"]}-{i["data"]}'} for i in (interacoes or [])]
    por_evento: dict[str, Contribuicao] = {}
    for ev in evs:
        chave = INTERACAO_CHAVE.get(ev["tipo"]) if ev.get("interacao") else nivelar(ev)
        if not chave:
            continue
        p = P[chave]
        c = Contribuicao(chave, p.tipo, p.categoria, p.nivel, p.base, fator_fonte(ev),
                         round(fator_temporal(p, (hoje - date.fromisoformat(ev["data"])).days), 4), 1.0, 0.0, ev["data"],
                         ev.get("sinal") or ev.get("porQueAgora", ""), ev.get("id") or ev.get("url", ""))
        if c.pre <= 0:
            continue
        # event_group_id: o grupo gravado pelo remover_duplicatas, senão a URL (a mesma matéria no inbox e no histórico)
        grupo = ev.get("grupo") or ev.get("url") or c.id or f"{chave}-{c.data}"
        if grupo not in por_evento or c.pre > por_evento[grupo].pre:
            por_evento[grupo] = c
    # o mesmo fato com URLs diferentes (inbox × histórico, duas matérias): mesmo tipo e mesmo texto = um evento
    por_texto: dict[tuple[str, str], Contribuicao] = {}
    for c in por_evento.values():
        k = (c.chave, norm(c.texto) or c.id)
        if k not in por_texto or c.pre > por_texto[k].pre:
            por_texto[k] = c
    contrs = list(por_texto.values())
    # declaração encerrada quando o fato correspondente chega ("promessa cumprida": é o mesmo acontecimento)
    fatos = [c for c in contrs if c.categoria == "expansao" and c.tipo != "declaracao_expansao" or c.tipo == "vaga_lideranca_alvo"]
    contrs = [c for c in contrs if not (c.tipo == "declaracao_expansao" and any(f.data >= c.data for f in fatos))]
    # aporte da própria compradora é o mesmo negócio da aquisição (V8.TECH: "adquirida pela TIM" + "aporte da TIM")
    compradoras = {m.group(1) for c in contrs if c.chave == "foi_adquirida" for m in [COMPRADORA.search(norm(c.texto))] if m}
    contrs = [c for c in contrs if not (c.tipo == "captacao" and any(re.search(rf"\b{re.escape(x)}\b", norm(c.texto)) for x in compradoras))]
    # seção 2.4: dentro da categoria, 1º = 1.0, 2º = 0.7, 3º em diante = 0.5
    por_cat: dict[str, list[Contribuicao]] = {}
    for c in contrs:
        por_cat.setdefault(c.categoria, []).append(c)
    for itens in por_cat.values():
        itens.sort(key=lambda x: -x.pre)
        for i, c in enumerate(itens):
            c.correlacao = CORRELACAO[i] if i < len(CORRELACAO) else CORRELACAO_RESTO
            c.s = min(100.0, c.pre * c.correlacao)
    contrs = sorted((c for c in contrs if c.s > 0), key=lambda c: -c.s)
    resto = 1.0
    for c in contrs:
        if c.categoria in CATEGORIAS_NEGATIVAS:
            continue
        c.marginal = 100 * resto * K * c.s / 100
        resto *= 1 - K * c.s / 100
    return contrs


def noisy_or(valores: list[float]) -> float:
    r = 1.0
    for v in valores:
        r *= 1 - v
    return 1 - r


def vscs_base(contrs: list[Contribuicao]) -> float:
    """Seção 3.1: 100 × [1 − Π(1 − K·s/100)] — todos os sinais contam, cada um soma menos que o anterior."""
    return 100 * noisy_or([K * c.s / 100 for c in contrs if c.categoria not in CATEGORIAS_NEGATIVAS])


def bonus_convergencia(contrs: list[Contribuicao]) -> int:
    """Seção 3.2: categorias distintas com s ≥ 40 numa janela móvel de 45 dias."""
    fortes = [c for c in contrs if c.s >= S_MINIMO_CONVERGENCIA and c.categoria not in CATEGORIAS_NEGATIVAS]
    maximo = 0
    for ancora in fortes:
        d0 = date.fromisoformat(ancora.data)
        cats = {c.categoria for c in fortes if 0 <= (date.fromisoformat(c.data) - d0).days <= JANELA_CONVERGENCIA}
        maximo = max(maximo, len(cats))
    return BONUS_CONVERGENCIA[3] if maximo >= 3 else BONUS_CONVERGENCIA.get(maximo, 0)


def penalidade(contrs: list[Contribuicao]) -> float:
    """O sinal negativo mais forte (ex.: foi adquirida) sai do VSCS: base × fonte × tempo pontos."""
    return max((c.s for c in contrs if c.categoria in CATEGORIAS_NEGATIVAS), default=0.0)


def vscs(contrs: list[Contribuicao]) -> float:
    return round(max(0.0, min(100.0, vscs_base(contrs) + bonus_convergencia(contrs)) - penalidade(contrs)), 2)


def faixa(v: float) -> int:
    """Índice da faixa (0 monitoramento … 4 prioridade máxima)."""
    return next(4 - i for i, (piso, _) in enumerate(FAIXAS) if v >= piso)


def status_vscs(v: float) -> str:
    return FAIXAS[4 - faixa(v)][1]


def via_rapida(contrs: list[Contribuicao], hoje: date) -> bool:
    """Seção 5: intenção direta, fonte primária, base ≥ 75, até 30 dias — vai pro comercial em 48h."""
    return any(c.categoria == "intencao" and c.fonte == FONTE_PRIMARIA and c.base >= 75
               and (hoje - date.fromisoformat(c.data)).days <= 30 for c in contrs)



# ---------------------------------------------------------------- fit, access, engagement (spec 4 e 7)


def fit(conta: dict, pendentes: list[str]) -> float:
    """0.40 subsegmento + 0.30 porte + 0.20 modelo de receita + 0.10 maturidade de GTM. Os quatro critérios
    dependem de decisões da Velora (spec 10) e de dados que a base ainda não tem: enquanto isso, valor neutro
    marcado como default_pendente."""
    sub = conta.get("fitSubsegmento")
    if sub is None:
        sub = 0.7
        pendentes.append("fit.subsegmento")
    porte = conta.get("fitPorte")
    if porte is None:
        porte = 0.5
        pendentes.append("fit.porte")
    modelo = conta.get("fitModeloReceita")
    if modelo is None:
        modelo = 0.6
        pendentes.append("fit.modelo_receita")
    maturidade = conta.get("fitMaturidadeGtm")
    if maturidade is None:
        maturidade = 0.7
        pendentes.append("fit.maturidade_gtm")
    valor = 0.40 * sub + 0.30 * porte + 0.20 * modelo + 0.10 * maturidade
    uf = (conta.get("uf") or "").upper()
    if uf and uf not in UFS_ALVO:
        return 0.0
    cnae = (conta.get("cnae") or "")[:2]
    if cnae and cnae not in ("62", "63") and not conta.get("tiConfirmadoManual"):
        valor = min(valor, 0.3)
    if (conta.get("icp") or {}).get("tier") == "C":  # fora do ICP (qualificar_icp.py): não passa do anel 4
        valor = min(valor, 0.5)
    return round(valor, 3)


OWNER_AREAS = {"marketing", "comercial"}
PAYER_AREAS = {"executivo", "financeiro"}


def contato_ativavel(conta: dict) -> tuple[dict | None, dict | None]:
    """(pessoa owner/payer com canal verificado, pessoa owner/payer sem canal). E-mail vindo do Snov conta
    como canal verificado (é de onde vem a validação na base atual)."""
    com, sem = None, None
    prioridade = {"decisor": 0, "assina_cheque": 1, "dono_da_dor": 2}
    for p in sorted(conta.get("comite", []), key=lambda x: prioridade.get(x.get("papelAbm", ""), 3)):
        if "papelAbm" in p:  # qualificar_icp.py: quem assina o cheque, decide ou é dono da dor
            if p["papelAbm"] not in ("assina_cheque", "decisor", "dono_da_dor"):
                continue
        elif p.get("papel") != "decisor" or p.get("area") not in OWNER_AREAS | PAYER_AREAS:
            continue
        if p.get("email") or p.get("linkedin"):
            com = com or p
        else:
            sem = sem or p
    return com, sem


def access(conta: dict) -> float:
    com, sem = contato_ativavel(conta)
    mapeado = 1.0 if (com or sem) else 0.0
    canal = 1.0 if com else 0.0
    caminho_quente = 0.0  # spec 7.2: zero até existir o upload de conexões dos sócios
    return 0.4 * mapeado + 0.3 * canal + 0.3 * caminho_quente


VALOR_INTERACAO = {"visita_site": (0.4, 14), "visita_servicos": (0.6, 14), "download": (0.7, 21),
                   "conexao_linkedin": (0.4, 21), "clique_email": (0.3, 14), "abertura_email": (0.0, 14)}


def engagement(interacoes: list[dict], hoje: date) -> float:
    vals = []
    for i in interacoes:
        valor, meia = VALOR_INTERACAO.get(i["tipo"], (0.0, 14))
        dias = (hoje - date.fromisoformat(i["data"])).days
        if 0 <= dias <= 30 and valor:
            vals.append(valor * 0.5 ** (dias / meia))
    return noisy_or(vals)


# ---------------------------------------------------------------- supressões e anéis (spec 5 e 6)


def supressao(conta: dict, contrs: list[Contribuicao], hoje: date) -> tuple[str | None, bool]:
    """(motivo para sair do radar, bloqueia anel 1?). conta["supressoes"] vem do CRM/Snov quando ligados."""
    s = conta.get("supressoes") or {}
    if s.get("opt_out"):
        return "pediu para não ser contatada", True
    if s.get("cliente_ativo"):
        return "cliente ativo da Velora", True
    if s.get("convertida"):
        return "reunião marcada / oportunidade aberta", True
    if (conta.get("situacaoCadastral") or "").upper() in ("BAIXADA", "INAPTA"):
        return "empresa baixada ou inapta na Receita", True
    bloqueia = False
    if s.get("negocio_perdido_em") and (hoje - date.fromisoformat(s["negocio_perdido_em"])).days < 90:
        bloqueia = True
    fim = s.get("cadencia_sem_resposta_em")
    if fim and (hoje - date.fromisoformat(fim)).days < 60:
        # só reabre com gatilho novo: evento A/B posterior ao fim da cadência
        if not any(c.nivel in ("A", "B") and c.data > fim for c in contrs):
            bloqueia = True
    return None, bloqueia


@dataclass
class Resultado:
    versao: str
    vscs: float
    vscs_base: float
    bonus_convergencia: int
    penalidade: float
    status: str
    acao: str  # matriz ICP × VSCS (seção 6)
    tier: str
    via_rapida: bool
    sinais_contados: int
    categorias: int
    fit: float
    timing: float  # = VSCS / 100 (dimensão do radar)
    access: float
    engagement: float
    proximity: float
    anel: int | None
    sinal_ativo: bool
    contribuicoes: list[dict]
    frase: str
    fora_do_radar: str | None = None
    janela_dupla: bool = False
    pendentes: list[str] = field(default_factory=list)


def tier_da_conta(conta: dict, f: float) -> str:
    uf = (conta.get("uf") or "").upper()
    if uf and uf not in UFS_ALVO:
        return "C"
    return (conta.get("icp") or {}).get("tier") or ("B" if f >= LIMIAR_FIT else "C")


def calcular(conta: dict, eventos: list[dict], hoje: date, interacoes: list[dict] | None = None,
             anterior: dict | None = None) -> Resultado:
    pendentes: list[str] = []
    contrs = contribuicoes(eventos, hoje, interacoes)
    base, bonus, menos = vscs_base(contrs), bonus_convergencia(contrs), penalidade(contrs)
    v = round(max(0.0, min(100.0, base + bonus) - menos), 2)
    for c in contrs:  # o negativo aparece na composição com o que tirou
        if c.categoria in CATEGORIAS_NEGATIVAS:
            c.marginal = -c.s if c.s == menos else 0.0
    e = engagement(interacoes or [], hoje)
    if not interacoes:
        pendentes.append("engagement.sem_fonte")
    f = fit(conta, pendentes)
    a = access(conta)
    tier = tier_da_conta(conta, f)
    acao = MATRIZ[tier][faixa(v)]
    rapida = via_rapida(contrs, hoje)
    com, sem = contato_ativavel(conta)
    fora, bloqueia = supressao(conta, contrs, hoje)
    abordar = acao in ACOES_DE_ABORDAGEM or rapida

    # anéis: 1 = ação de abordagem e decisor com canal; 2 = abordagem sem canal (ou em espera) ou "ampliar pesquisa";
    # 3 = monitorar; 4 = fora do ICP (ignorar / revisar ICP)
    if fora:
        anel = None
    elif acao in ("Ignorar", "Revisar ICP da conta") and not rapida:
        anel = 4
    elif abordar and com and not bloqueia:
        anel = 1
    elif abordar or acao == "Ampliar pesquisa":
        anel = 2
    else:
        anel = 3

    prox = 0.30 * f + 0.30 * v / 100 + 0.25 * a + 0.15 * e
    if anterior and "proximity" in anterior:
        prox = 0.7 * prox + 0.3 * anterior["proximity"]

    return Resultado(
        versao=VERSAO, vscs=v, vscs_base=round(base, 2), bonus_convergencia=bonus, penalidade=round(menos, 2), status=status_vscs(v), acao=acao,
        tier=tier, via_rapida=rapida, sinais_contados=len(contrs), categorias=len({c.categoria for c in contrs if c.categoria not in CATEGORIAS_NEGATIVAS}),
        fit=f, timing=round(v / 100, 4), access=round(a, 3), engagement=round(e, 3), proximity=round(prox, 3),
        anel=anel, sinal_ativo=abordar,
        contribuicoes=[{"id": c.id, "chave": c.chave, "tipo": c.tipo, "categoria": c.categoria, "nivel": c.nivel, "base": c.base,
                        "fonte": c.fonte, "tempo": c.tempo, "correlacao": c.correlacao, "s": round(c.s, 2),
                        "valor": round(c.s / 100, 4), "pontos": round(c.marginal, 2), "data": c.data, "texto": c.texto}
                       for c in contrs],
        frase=frase(contrs, anel, acao, rapida, com, sem, bloqueia, fora), fora_do_radar=fora,
        janela_dupla=bonus > 0, pendentes=pendentes,
    )


def frase(contrs: list[Contribuicao], anel: int | None, acao: str, rapida: bool, com: dict | None, sem: dict | None,
          bloqueia: bool, fora: str | None) -> str:
    """Dois maiores fatos + o que fazer agora (matriz ICP × VSCS)."""
    if fora:
        return f"Fora do radar: {fora}."
    partes = [c.texto.rstrip(".") for c in contrs if c.texto and c.tipo != "noticia_setorial"][:2]
    inicio = (" e ".join(partes) + ".") if partes else "Nenhum sinal ativo."
    if rapida:
        inicio = f"Intenção direta: comercial em até 48h. {inicio}"
    if acao == "Revisar ICP da conta":
        falta = "Score alto fora do ICP: revisar o ICP da conta."
    elif anel == 4:
        falta = "Fora do ICP."
    elif bloqueia:
        falta = "Em espera: cooldown ou negócio perdido recente."
    elif anel == 3:
        falta = "Monitorar e pesquisar novos eventos."
    elif not (com or sem):
        falta = f"{acao}: falta mapear o decisor."
    elif acao == "Ampliar pesquisa":
        falta = "Ampliar a pesquisa: um segundo fato próximo no tempo abre a abordagem."
    elif not com:
        falta = f"{acao}: falta validar o canal de {sem['nome'].split()[0]}."
    else:
        falta = f"{acao} com {com['nome']}."
    return f"{inicio} {falta}"



# ---------------------------------------------------------------- base inteira + relatório de migração


def eventos_da_conta(conta: dict, sinais: list[dict]) -> list[dict]:
    return [s for s in sinais if s["contaId"] == conta["id"] and not s.get("exemplo")] + \
           [h for h in conta.get("historico", []) if not h.get("exemplo")]


def relatorio(base: dict) -> str:
    contas = base["contas"]
    por_anel: dict = {}
    for c in contas:
        por_anel.setdefault(c["v2"]["anel"], []).append(c)
    nomes = {1: "Pronta para ativar", 2: "Ponto de contato à vista", 3: "Em observação", 4: "Horizonte", None: "Fora do radar"}
    linhas = [f"# Score {VERSAO} ({date.today().isoformat()})", "",
              f"{len(contas)} contas recalculadas. O app continua mostrando o v1 até a aprovação.", "",
              "## Distribuição por anel", "", "| Anel | Contas |", "|---|---|"]
    for k in (1, 2, 3, 4, None):
        linhas.append(f"| {k if k else '—'} · {nomes[k]} | {len(por_anel.get(k, []))} |")

    quentes_v1 = sorted([c for c in contas if c.get("score", 0) > 0], key=lambda c: -c["score"])
    linhas += ["", "## Contas com score v1 e onde caem no v2", "",
               "| Conta | v1 | Timing v2 | Anel v2 | Por quê |", "|---|---|---|---|---|"]
    for c in quentes_v1[:40]:
        v = c["v2"]
        linhas.append(f"| {c['nome']} | {c['score']} | {v['timing']:.2f} | {v['anel']} | {v['frase']} |")

    so_contexto = [c for c in quentes_v1 if c["v2"]["contribuicoes"] and all(x["nivel"] == "C" for x in c["v2"]["contribuicoes"])]
    linhas += ["", f"## Quentes no v1 só por contexto (nível C) — saem do anel 1/2 no v2: {len(so_contexto)}", ""]
    linhas += [f"- {c['nome']} (v1 {c['score']}): {', '.join(x['texto'] for x in c['v2']['contribuicoes'][:3])}" for c in so_contexto[:30]]

    sem_v1 = [c for c in contas if c.get("score", 0) == 0 and c["v2"]["anel"] in (1, 2)]
    linhas += ["", f"## Sem score no v1 e com sinal ativo no v2: {len(sem_v1)}", ""]
    linhas += [f"- {c['nome']}: {c['v2']['frase']}" for c in sem_v1[:30]]

    dupla = [c for c in contas if c["v2"].get("janela_dupla")]
    linhas += ["", f"## Janela dupla (dois gatilhos A): {len(dupla)}", ""]
    linhas += [f"- {c['nome']}: {c['v2']['frase']}" for c in dupla]

    linhas += ["", "## Divergências e decisões para aprovar", "",
               "- **Spec 11 × tabela 2.2:** o teste pede troca de CMO valendo ~0.25 no dia 120, mas platô 60 + meia-vida 45 "
               "dá 0.40 no dia 120 (0.25 só no dia 150). Com meia-vida 30, os dois batem. Implementado como a tabela.",
               "- **Sem anel 2 nem 4 hoje:** o fit usa valores neutros (0.62) até a Velora decidir subsegmentos e faixa de "
               "porte (spec 10), e quase toda conta tem decisor com e-mail do Snov — então quem tem sinal ativo vai direto "
               "pro anel 1.",
               "- **Campos que o classificador ainda não grava** (cargo de quem chegou, estágio da rodada, expansão "
               "consumada × declarada, porta-voz, tom): decididos por regra de texto em `nivelar()`. O próximo passo é o "
               "classificador gravar esses campos.",
               "- **Prêmio** não está na tabela 2.2: tratado como contexto (C, 0.05).",
               "- **Confiança:** sem campos de match/classificação na base, usa 0.9 para notícia classificada, 1.0 para vaga e "
               "evento lidos na página da própria conta, +0.05 por fonte extra.",
               "- **Engagement:** sem fonte ligada (Snov, visitantes do site), fica 0 para todas as contas."]
    pend = sorted({p for c in contas for p in c["v2"]["pendentes"]})
    linhas += ["", "## Valores padrão em uso (default_pendente)", ""] + [f"- `{p}`" for p in pend]
    return "\n".join(linhas) + "\n"


ROTULO_TIPO = {
    "troca_lideranca": "Troca de liderança", "captacao": "Captação", "expansao_comercial": "Expansão comercial",
    "vaga_lideranca_alvo": "Vaga de liderança", "fusao_aquisicao": "Fusão ou aquisição",
    "declaracao_expansao": "Declaração de expansão", "vaga_area_alvo": "Vagas na área-alvo",
    "lancamento_produto": "Lançamento", "nova_parceria": "Parceria", "presenca_evento": "Presença em evento",
    "palestra_lideranca": "Palestra", "nova_filial": "Nova unidade", "reestruturacao": "Reestruturação",
    "premio": "Prêmio", "noticia_setorial": "Notícia do setor", "intencao": "Intenção direta",
    "aquisicao_feita": "Aquisição feita", "fusao": "Fusão", "foi_adquirida": "Foi adquirida",
}
# rótulo do sinal por chave: o tipo do fato sempre explícito — fusão × aquisição × investimento × função de quem chegou
ROTULO_CHAVE = {
    "troca_lideranca_cxo": "Nova função: C-level de receita/marketing", "troca_lideranca_owner": "Nova função: liderança comercial/marketing",
    "troca_lideranca_ceo": "Nova função: CEO", "troca_lideranca_clevel": "Nova função: C-level fora da área",
    "captacao_a": "Investimento: rodada Série A+", "captacao_seed": "Investimento: seed/anjo",
    "aquisicao_feita": "Aquisição: comprou empresa", "aquisicao_planejada": "Aquisição: plano de comprar",
    "fusao": "Fusão", "foi_adquirida": "Foi adquirida · sinal negativo",
    "vaga_lideranca_growth": "Vaga de liderança Growth/Revenue", "vaga_lideranca_alvo": "Vaga de liderança comercial",
    "vaga_area_time": "Formação de time comercial", "vaga_area_alvo": "Vagas na área comercial",
}


def pontos_inteiros(valores: list[float]) -> list[int]:
    """Arredonda pela soma acumulada: os pontos inteiros somam o mesmo que o total arredondado."""
    out, acc, anterior = [], 0.0, 0
    for v in valores:
        acc += v
        out.append(round(acc) - anterior)
        anterior = round(acc)
    return out


def exibir(base: dict, hoje: date) -> None:
    """Grava o VSCS 3.0 como o score que o app mostra: score = VSCS, tendência = VSCS hoje − VSCS 30 dias atrás
    (vscs_delta_30d), série de 90 dias (um ponto a cada 3), composição = quanto cada sinal somou (retornos
    decrescentes, do mais forte para o mais fraco) + bônus de convergência, pontos de cada sinal = essa parte."""
    sinais_por_conta: dict[str, list[dict]] = {}
    for sn in base.get("sinais", []):
        sinais_por_conta.setdefault(sn["contaId"], []).append(sn)
    contrib_por_sinal: dict[str, dict] = {}
    for conta in base["contas"]:
        evs = eventos_da_conta(conta, sinais_por_conta.get(conta["id"], []))
        interacoes = conta.get("interacoes")
        v2 = conta["v2"]

        def score_em(dia: date) -> int:
            return round(vscs(contribuicoes(evs, dia, interacoes)))

        conta["score"] = round(v2["vscs"])
        conta["vscsStatus"] = v2["status"]
        conta["acaoRecomendada"] = v2["acao"]
        conta["tendencia"] = conta["score"] - score_em(hoje - timedelta(days=30))
        conta["serie"] = [score_em(hoje - timedelta(days=3 * (30 - i))) for i in range(31)]
        cs = v2["contribuicoes"]
        bonus = v2["bonus_convergencia"]
        inteiros = pontos_inteiros([c["pontos"] for c in cs] + [bonus])
        comp = []
        for c, pts in zip(cs, inteiros):
            contrib_por_sinal[c["id"]] = {**c, "pontosInteiros": pts}
            if pts != 0:
                comp.append({"rotulo": ROTULO_CHAVE.get(c.get("chave", ""), ROTULO_TIPO.get(c["tipo"], c["tipo"])),
                             "detalhe": c["texto"], "pontos": pts, "data": c["data"]})
        if bonus:
            comp.append({"rotulo": "Convergência", "detalhe": f"Fatos de categorias diferentes em até {JANELA_CONVERGENCIA} dias",
                         "pontos": inteiros[-1]})
        conta["composicao"] = comp
    # status comercial sugerido pelo anel, só onde ninguém definiu um à mão (statusComercialAuto marca o nosso)
    for conta in base["contas"]:
        if conta.get("statusComercial") and not conta.get("statusComercialAuto"):
            continue
        a = conta["v2"]["anel"]
        conta["statusComercial"] = "ATIVAR" if a == 1 else "NUTRIR" if a in (2, 3) else "NÃO ABORDAR"
        conta["statusComercialAuto"] = True
    anel = {c["id"]: (c["v2"]["anel"] or 9, -c["v2"]["vscs"]) for c in base["contas"]}
    ordem_nivel = {"A": 0, "B": 1, "C": 2, None: 3}
    for sn in base.get("sinais", []):
        chave = nivelar(sn)
        p = P.get(chave) if chave else None
        c = contrib_por_sinal.get(sn["id"])
        sn["nivel"] = p.nivel if p else None
        sn["tipoSpec"] = p.tipo if p else None  # o app recalcula o score com a avaliação 1/2/3 da pessoa (lib/avaliacao.ts)
        sn["categoria"] = p.categoria if p else None
        if chave in ROTULO_CHAVE:
            sn["rotulo"] = ROTULO_CHAVE[chave]
        sn["pontos"] = c["pontosInteiros"] if c else 0  # o que o sinal soma de fato ao VSCS da conta
        sn["valor"] = c["valor"] if c else 0.0  # s / 100: força ajustada (fonte × tempo × correlação)
        sn.pop("demandaDireta", None)
    base["sinais"].sort(key=lambda sn: (anel.get(sn["contaId"], (9, 0)), ordem_nivel[sn["nivel"]],
                                        -date.fromisoformat(sn["data"]).toordinal()))
    base["scoreVersao"] = VERSAO
    from registrar_fontes import registrar  # tela Fontes: o que cada coletor trouxe de fato
    base["fontes"] = registrar(base, hoje)



def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--relatorio", type=Path, help="grava o relatório de migração v1 → v2 nesse arquivo")
    ap.add_argument("--exibir", action="store_true", help="grava o VSCS como score exibido no app (score, série, composição)")
    args = ap.parse_args()
    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()
    # contas tiradas do radar a pedido (data/contas-removidas.json) não voltam quando a base é regerada
    removidas = RAIZ / "data" / "contas-removidas.json"
    if removidas.exists():
        dominios = json.loads(removidas.read_text(encoding="utf-8")).get("dominios", {})
        fora = {c["id"] for c in base["contas"] if c.get("dominio") in dominios}
        base["contas"] = [c for c in base["contas"] if c["id"] not in fora]
        base["sinais"] = [s for s in base.get("sinais", []) if s["contaId"] not in fora]
    for conta in base["contas"]:
        anterior = conta.get("v2") or {}
        # histerese e suavização usam o resultado do ÚLTIMO DIA anterior; rodar duas vezes no mesmo dia
        # não pode suavizar em cima de si mesmo
        if anterior.get("versao") != VERSAO:
            referencia = None  # calibração nova: anel e proximity antigos não seguram a conta (histerese)
        elif anterior.get("calculadoEm") == hoje.isoformat():
            referencia = anterior.get("referencia")
        else:
            referencia = {"anel": anterior["anel"], "proximity": anterior["proximity"]} if anterior else None
        r = calcular(conta, eventos_da_conta(conta, base.get("sinais", [])), hoje, conta.get("interacoes"), referencia)
        conta["v2"] = r.__dict__ | {"calculadoEm": hoje.isoformat(), "referencia": referencia}
    if args.exibir:
        exibir(base, hoje)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    cont = {}
    for c in base["contas"]:
        cont[c["v2"]["anel"]] = cont.get(c["v2"]["anel"], 0) + 1
    print(f"{len(base['contas'])} contas · anéis: " + ", ".join(f"{k}: {v}" for k, v in sorted(cont.items(), key=lambda x: (x[0] is None, x[0]))))
    if args.relatorio:
        args.relatorio.write_text(relatorio(base), encoding="utf-8")
        print(f"relatório em {args.relatorio}")


if __name__ == "__main__":
    main()
