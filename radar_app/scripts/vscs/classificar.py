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
# contribuidor individual com título de gerente: hunter, farmer, gerente de contas/relacionamento, "executivo/gerente".
# Gerência só vale com mandato de gestão; título sozinho não promove (decisão de 26/11).
CONTRIBUIDOR_INDIVIDUAL = re.compile(r"\b(hunter|farmer|closer|gerente de (contas|relacionamento|negocios regionais)|executiv[oa]\s*/\s*gerente"
                                     r"|gerente\s*/\s*executiv[oa]|gerente comercial (pj|autonomo|externo)|representante)\b")

REGRAS_CARGO: list[tuple[str, re.Pattern]] = [
    ("clevel_receita", re.compile(r"\b(cro|cmo|cco|cso|c-level|chief (revenue|marketing|commercial|sales|growth) officer|chief (revenue|marketing|commercial|sales|growth))\b")),
    # VP de receita é diretoria executiva (85), salvo evidência de responsabilidade C-level (decisão de 26/11)
    ("diretoria_receita", re.compile(r"\bdiret(or|ora|oria)\s+(executiv[oa]\s+)?(de\s+|of\s+)?" + AREA_RECEITA + r"\b|\b" + AREA_RECEITA + r"\s+director\b"
                                     r"|\b(vp|vice-presidente|vice presidente|vice-president|vice president)\s+(de\s+|of\s+)?" + AREA_RECEITA + r"\b")),
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
    if CONTRIBUIDOR_INDIVIDUAL.search(t) and not re.search(r"\b(head|diretor|diretora|vp|cro|cmo)\b", t):
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


# ---------------------------------------------------------------- cargo do ocupante ou da vaga

# o cargo vem do PAPEL do fato, não de qualquer palavra do texto: "ex-CRO da Y assume como gerente de parcerias" é gerência
GATILHO_NOMEACAO = re.compile(
    r"\b(?:assume|assumiu|assumira|assumir|nomead[oa]|promovid[oa]|contratad[oa]|anunciad[oa]|empossad[oa]|eleit[oa]|chega|chegou"
    r"|e o novo|e a nova|e o nova|o novo|a nova|novo|nova)\s+(?:como\s+|o cargo de\s+|a posicao de\s+|a cadeira de\s+|para\s+(?:o cargo de\s+|a\s+)?|a\s+)?"
    r"(?P<cargo>[a-z0-9&/ -]{2,80}?)(?=$|[,;.(]|\s+(?:da|do|na|no|em|para|apos|com|e|que|a partir)\s)")
PREFIXO_VAGA = re.compile(r"^(?:vaga[s]?\s+(?:de|para)\s+|abre\s+vaga[s]?\s+(?:de|para)\s+|contrata(?:ndo)?\s+|procura\s+)")
VERBO_FINAL = re.compile(r"(\s+(assume|assumiu|assumira|chega|chegou|e anunciad[oa]|e nomead[oa]|toma posse|estreia))+\s*$")
CAMPOS_CARGO = ("cargo", "cargoOcupante", "cargoVaga", "cargo_ocupante", "cargo_vaga")


def cargo_do_evento(ev: dict) -> tuple[str, str]:
    """(cargo, origem). Ordem: revisão registrada → campo explícito → título da vaga → cargo após o gatilho da
    nomeação no título curto (sinal) → o título curto inteiro. Nunca o texto de contexto (porQueAgora), que cita
    outros cargos ("reporta ao CRO", "ex-VP da Oracle")."""
    rev = ev.get("_revisao") or {}
    if rev.get("cargo"):
        return norm(rev["cargo"]), "revisao"
    for k in CAMPOS_CARGO:
        if ev.get(k):
            return norm(ev[k]), k
    for k in ("executivo", "vaga"):
        if isinstance(ev.get(k), dict) and (ev[k].get("cargo") or ev[k].get("titulo")):
            return norm(ev[k].get("cargo") or ev[k].get("titulo")), f"{k}.cargo"
    titulo = norm(ev.get("sinal") or ev.get("titulo") or "")
    if ev.get("tipo", "").startswith("vaga"):
        return PREFIXO_VAGA.sub("", titulo).strip(), "titulo_da_vaga"
    m = GATILHO_NOMEACAO.search(titulo)
    if m:
        return VERBO_FINAL.sub("", m.group("cargo")).strip(), "apos_gatilho"
    return titulo, "titulo"


def evidencia_clevel(ev: dict) -> bool:
    rev = ev.get("_revisao") or {}
    return bool(rev.get("responsabilidadeClevel") or ev.get("responsabilidadeClevel"))


# ---------------------------------------------------------------- chaves legadas e semântica de fatos

# chaves de revisões e contribuições antigas → chave da 3.2 (tipo e categoria vêm da chave nova)
LEGADO = {
    "troca_lideranca_head": "nomeacao_head",
    "troca_lideranca_owner": "nomeacao_diretoria_receita",
    "troca_lideranca_cxo": "nomeacao_clevel_receita",
    "vaga_lideranca_growth": "vaga_head",
    "vaga_lideranca_alvo": "vaga_head",
    "vaga_area_time": "vaga_bloco",
}


def chave_canonica(chave: str) -> str:
    return LEGADO.get(chave, chave)


GENERICAS_EMPRESA = {"empresa", "grupo", "sistemas", "sistema", "software", "softwares", "tecnologia", "tecnologias", "solutions", "solucoes",
                     "servicos", "brasil", "ltda", "s.a", "informatica", "digital", "consultoria", "the", "group", "company", "tech"}
ADQUIRE = r"(adquire|adquiriu|adquirira|compra|comprou|incorpora|incorporou|assume o controle d[ae]|anuncia a? ?(aquisicao|compra) d[ae]|conclui a? ?(aquisicao|compra) d[ae]|aquisicao d[ae]|compra d[ae])"


def papel_na_aquisicao(texto: str, empresa: str) -> str | None:
    """'sofrida' quando a conta é o OBJETO da compra ("Grupo Beta adquire a Conta X"), 'realizada' quando é o
    sujeito ("Conta X adquire a Y"). None quando o texto não permite dizer (fica a regra antiga)."""
    t, e = norm(texto), norm(empresa)
    if not e:
        return None
    distintas = [w for w in re.findall(r"[a-z0-9]+", e) if len(w) >= 3 and w not in GENERICAS_EMPRESA]
    nucleo = re.escape(distintas[0] if distintas else e)
    if re.search(ADQUIRE + r"\s+(a |o |da |do |de )?" + nucleo, t) or re.search(nucleo + r"[\w\s.]{0,30}\b(e |foi |sera )?(adquirida|comprada|vendida|incorporada)\b", t):
        return "sofrida"
    if re.search(nucleo + r"[\w\s.]{0,30}\b" + ADQUIRE, t):
        return "realizada"
    return None


PASSADO = re.compile(r"\b(atingiu|alcancou|fechou|registrou|cresceu|faturou|bateu|superou|encerrou|obteve|teve crescimento|chegou a)\b")
FUTURO = re.compile(r"\b(projeta|projetam|preve|planeja|pretende|meta de|metas?|vai|vao|quer|mira|miram|espera|busca|almeja|objetivo|ate 20[2-3][0-9]|em 20(2[7-9]|3[0-9]))\b")


def marco_historico(texto: str) -> bool:
    """Número que descreve resultado passado (marco), não meta futura: não vale 65."""
    t = norm(texto)
    return bool(PASSADO.search(t)) and not FUTURO.search(t)
