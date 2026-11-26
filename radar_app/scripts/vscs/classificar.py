"""Classificação 3.2 de cargos de receita (vagas e nomeações) e blocos de vagas operacionais.

Regra da 3.2 (documento de 26/11, seção 6): o peso vem da senioridade do cargo na área de receita
(marketing, vendas, growth, parcerias, RevOps). Diretor técnico ou financeiro não é diretor de receita; account
manager não é liderança; nomeação não é vaga (a 3.3 trata o tempo de cada um de forma diferente).
"""
from __future__ import annotations

import re
import unicodedata


def norm(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


AREA_RECEITA = r"(marketing|vendas|comercial|growth|receita|revenue|negocios|parcerias|aliancas|revops|demand|demanda|gtm|go-to-market|sales|customer success|cs)"

# ordem importa: do mais sênior ao mais operacional; o primeiro que casa decide
# títulos operacionais que contêm "manager": decididos antes da gerência
OPERACIONAL_COM_MANAGER = re.compile(r"\b(customer success manager|account manager|key account manager|success manager|csm|kam)\b")

REGRAS_CARGO: list[tuple[str, re.Pattern]] = [
    ("clevel_receita", re.compile(r"\b(cro|cmo|cco|cso|chief (revenue|marketing|commercial|sales|growth) officer|chief (revenue|marketing|commercial|sales|growth))\b"
                                  r"|\b(vp|vice-presidente|vice presidente)\s+(de\s+|of\s+)?" + AREA_RECEITA + r"\b")),
    ("diretoria_receita", re.compile(r"\bdiret(or|ora|oria)\s+(executiv[oa]\s+)?(de\s+|of\s+)?" + AREA_RECEITA + r"\b|\b" + AREA_RECEITA + r"\s+director\b")),
    ("head", re.compile(r"\bhead\s+(de\s+|of\s+)?" + AREA_RECEITA + r"\b")),
    ("gerencia", re.compile(r"\b(gerente|gerencia|manager)\b(?!\s+de\s+contas)(?!.*\baccount manager\b)")),
    ("coordenacao", re.compile(r"\b(coordenador|coordenadora|coordenacao|coordinator|supervisor|supervisora|lider de equipe|team lead)\b")),
    ("especialista_gtm", re.compile(r"\b(revops|revenue operations|sales ops|marketing ops|operacoes de (vendas|marketing|receita)|especialista (em )?(gtm|growth|crm|automacao)|analista de (growth|crm|automacao|revops))\b")),
    ("sdr_bdr", re.compile(r"\b(sdr|bdr|ldr|pre-?vendas|inside sales|executiv[oa] de (vendas|contas|negocios)|account (executive|manager)|vendedor|vendedora|representante comercial|consultor[a]? comercial|customer success|csm|analista (comercial|de marketing|de vendas)|assistente comercial)\b")),
]
LIDERANCA = {"clevel_receita", "diretoria_receita", "head", "gerencia", "coordenacao"}
OPERACIONAL = {"sdr_bdr", "especialista_gtm"}
FORA_DE_RECEITA = re.compile(r"\b(cfo|cto|cio|ciso|coo|financeir[oa]|tecnologia|engenharia|juridic[oa]|rh|recursos humanos|pessoas|people|ti\b|produto|product|dados|data)\b")


def nivel_cargo(texto: str) -> str | None:
    """Senioridade do cargo de receita citado no texto, ou None quando não é cargo de receita."""
    t = norm(texto)
    if OPERACIONAL_COM_MANAGER.search(t) and not re.search(r"\b(head|diretor|diretora|vp|gerente)\b", t):
        return "sdr_bdr"
    for nivel, rx in REGRAS_CARGO:
        if rx.search(t):
            if nivel in ("gerencia", "coordenacao") and not re.search(AREA_RECEITA, t):
                return None  # gerente de TI, coordenador financeiro: não é receita
            if nivel in LIDERANCA and FORA_DE_RECEITA.search(t) and not re.search(AREA_RECEITA, t):
                return None
            return nivel
    return None


def familia_cargo(texto: str) -> str:
    """Área do cargo (para ligar vaga e nomeação do mesmo lugar): marketing, vendas ou receita."""
    t = norm(texto)
    if re.search(r"\b(marketing|growth|demand|demanda|cmo)\b", t):
        return "marketing"
    if re.search(r"\b(vendas|comercial|sales|negocios|cro|cco|cso|sdr|bdr|pre-?vendas|executiv[oa] de)\b", t):
        return "vendas"
    if re.search(r"\b(parcerias|aliancas|canais)\b", t):
        return "parcerias"
    return "receita"


def base_bloco(qtd: int, p: dict) -> int:
    """Bloco de vagas operacionais distintas numa janela de 30 dias: substitui (não soma) as vagas que o formam."""
    b = p["blocos_operacionais"]
    if qtd >= 5:
        return b["cinco_ou_mais"]
    if qtd >= 3:
        return b["tres_a_quatro"]
    if qtd == 2:
        return b["duas"]
    return b["uma"]
