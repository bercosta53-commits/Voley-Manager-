"""Agrupamento causal da 3.3: documento → acontecimento → movimento estratégico.

  documento      uma matéria, um post, um anúncio de vaga
  acontecimento  o fato no mundo ("Fulana assumiu como CRO"). Vários documentos do mesmo fato são CORROBORAÇÃO
                 DOCUMENTAL: sobem a confiança da fonte, nunca o número de gatilhos.
  movimento      a decisão estratégica que gera vários acontecimentos ("expandir para o México": declaração +
                 escritório + vagas locais + parceria). Acontecimentos do mesmo movimento são EXECUÇÃO: reforçam a
                 materialidade com peso pequeno, mas contam como UM gatilho.
  convergência comercial = movimentos INDEPENDENTES na mesma conta. Só ela soma como corroboração no DC.

Regras de vínculo (todas registradas com o nome da regra, para auditoria). Campos explícitos do classificador
(acontecimentoId, movimentoId) sempre valem sobre as heurísticas.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from .classificar import LIDERANCA, norm

PALAVRAS_VAZIAS = set("""a o as os de da do das dos e em no na nos nas para por com sem um uma uns umas que se sua seu suas seus
ao aos à às como mais novo nova novos novas sobre entre após apos até ate pela pelo pelas pelos the and of for""".split())

LUGARES = set("""acre alagoas amapa amazonas bahia ceara distrito federal espirito santo goias maranhao mato grosso minas gerais para
paraiba parana pernambuco piaui rio de janeiro grande do norte sul rondonia roraima santa catarina sao paulo sergipe tocantins
curitiba florianopolis joinville blumenau porto alegre campinas belo horizonte recife fortaleza salvador brasilia manaus goiania
mexico eua estados unidos argentina chile colombia peru uruguai paraguai portugal espanha europa latam america latina canada""".split())
LUGARES_COMPOSTOS = ["rio de janeiro", "sao paulo", "santa catarina", "rio grande do sul", "rio grande do norte", "minas gerais",
                     "espirito santo", "mato grosso", "distrito federal", "porto alegre", "belo horizonte", "estados unidos",
                     "america latina"]
CAPITAL = re.compile(r"\b(aporte|rodada|investimento recebido|capital levantado|recursos da (rodada|captacao)|com o (aporte|investimento))\b")
EXPANSAO_TIPOS = {"expansao_comercial", "nova_filial", "declaracao_expansao", "nova_parceria"}
MA_COMPRA = {"aquisicao_feita", "fusao"}  # foi_adquirida é negativo e fica fora dos vínculos positivos


@dataclass
class Documento:
    id: str
    ev: dict
    cl: dict
    data: date
    fonte_nivel: str
    fonte_fator: float
    dominios: set[str]


@dataclass
class Acontecimento:
    id: str
    docs: list[Documento]
    cl: dict
    data: date
    fonte_nivel: str = ""
    fonte_fator: float = 0.0
    superado_por: str | None = None
    s: float = 0.0
    tempo: float = 0.0
    janela: str | None = None

    @property
    def texto(self) -> str:
        d = self.docs[0].ev
        return f'{d.get("sinal", "")} {d.get("porQueAgora", "")} {d.get("titulo", "")}'


@dataclass
class Movimento:
    id: str
    acontecimentos: list[Acontecimento]
    vinculos: list[tuple[str, str, str]] = field(default_factory=list)  # (a, b, regra)
    s: float = 0.0
    categoria: str = ""


def _tokens(t: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", norm(t)) if len(w) > 2 and w not in PALAVRAS_VAZIAS}


def _lugares(t: str) -> set[str]:
    n = norm(t)
    achados = {l for l in LUGARES_COMPOSTOS if l in n}
    for w in re.findall(r"[a-z]+", n):
        if w in LUGARES and not any(w in l.split() for l in achados):
            achados.add(w)
    return achados - {"para", "sul", "norte", "grande", "rio", "de", "do"}


def _nomes_proprios(t: str, empresa: str) -> set[str]:
    """Nomes de produto/marca: palavras com maiúscula que não abrem a frase, fora o nome da empresa."""
    vazio = _tokens(empresa)
    nomes = set()
    for frase in re.split(r"[.!?:;]\s+", t or ""):
        palavras = frase.split()
        for w in palavras[1:]:
            w2 = re.sub(r"[^\wÀ-ÿ-]", "", w)
            if len(w2) >= 3 and (w2[0].isupper() or w2.isupper()) and norm(w2) not in PALAVRAS_VAZIAS and norm(w2) not in vazio \
                    and norm(w2) not in LUGARES:
                nomes.add(norm(w2))
    return nomes


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def acontecimentos(docs: list[Documento], janela_dias: int, janela_longa: int = 180) -> list[Acontecimento]:
    """Junta documentos do mesmo fato. Critério: id explícito, mesmo grupo/URL, ou mesmo tipo em até `janela_dias`
    com a mesma pessoa, o mesmo cargo (nível + área) ou texto parecido (Jaccard ≥ 0,5); texto quase igual
    (Jaccard ≥ 0,8) junta até `janela_longa` dias (republicação)."""
    grupos: list[list[Documento]] = []
    for d in sorted(docs, key=lambda x: x.data):
        alvo = None
        for g in grupos:
            r = g[0]
            if d.ev.get("acontecimentoId") and d.ev.get("acontecimentoId") == r.ev.get("acontecimentoId"):
                alvo = g
                break
            mesma_url = d.ev.get("grupo") and d.ev.get("grupo") == r.ev.get("grupo") or d.ev.get("url") and d.ev.get("url") == r.ev.get("url")
            if mesma_url:
                alvo = g
                break
            if d.cl["tipo"] != r.cl["tipo"]:
                continue
            sim = _jaccard(_tokens(d.ev.get("sinal", "") + " " + d.ev.get("porQueAgora", "")),
                           _tokens(r.ev.get("sinal", "") + " " + r.ev.get("porQueAgora", "")))
            # o mesmo texto meses depois é o mesmo fato republicado (não renova a data), até a janela de vínculo
            if sim >= 0.8 and abs((d.data - r.data).days) <= janela_longa:
                alvo = g
                break
            if abs((d.data - r.data).days) > janela_dias:
                continue
            pessoa = norm(d.ev.get("pessoa", "")) and norm(d.ev.get("pessoa", "")) == norm(r.ev.get("pessoa", ""))
            cargo = d.cl.get("nivel") and d.cl.get("nivel") == r.cl.get("nivel") and d.cl.get("familia") == r.cl.get("familia") \
                and (d.cl.get("nomeacao") or d.cl.get("vaga")) and d.cl.get("nivel") != "bloco"
            texto = _jaccard(_tokens(d.ev.get("sinal", "") + " " + d.ev.get("porQueAgora", "")),
                             _tokens(r.ev.get("sinal", "") + " " + r.ev.get("porQueAgora", ""))) >= 0.5
            if pessoa or cargo or texto:
                alvo = g
                break
        if alvo is None:
            grupos.append([d])
        else:
            alvo.append(d)
    out = []
    for g in grupos:
        principal = max(g, key=lambda x: x.cl["base"])
        # republicação não renova a data: o acontecimento fica com a data do primeiro documento
        out.append(Acontecimento(id=g[0].id, docs=g, cl=principal.cl, data=min(x.data for x in g)))
    return out


def movimentos(acs: list[Acontecimento], empresa: str, janela_dias: int) -> tuple[list[Movimento], list[tuple[str, str, str]]]:
    """Liga acontecimentos da mesma decisão estratégica (union-find). Devolve os movimentos e os "possíveis vínculos"
    (ligações plausíveis que a heurística não confirma; bloqueiam a faixa 90+)."""
    pai = {a.id: a.id for a in acs}

    def raiz(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x

    vinculos, possiveis = [], []

    def ligar(a, b, regra):
        vinculos.append((a.id, b.id, regra))
        pai[raiz(a.id)] = raiz(b.id)

    ordem = sorted(acs, key=lambda a: a.data)
    for i, a in enumerate(ordem):
        for b in ordem[i + 1:]:
            dias = (b.data - a.data).days
            if dias > janela_dias:
                break
            ta, tb = a.cl["tipo"], b.cl["tipo"]
            ea, eb = a.docs[0].ev, b.docs[0].ev
            # sinal negativo nunca entra num movimento positivo: a penalidade não pode sumir dentro de um grupo
            if (a.cl["categoria"] == "negativo") != (b.cl["categoria"] == "negativo"):
                continue
            if ea.get("movimentoId") and ea.get("movimentoId") == eb.get("movimentoId"):
                ligar(a, b, "explicito")
                continue
            # R1 vaga de liderança → nomeação da mesma área: a contratação concluída
            if a.cl.get("vaga") and a.cl.get("nivel") in LIDERANCA and b.cl.get("nomeacao") and a.cl.get("familia") == b.cl.get("familia"):
                ligar(a, b, "vaga_concluida")
                a.superado_por = b.id
                continue
            # R2 nomeação → vagas da área do líder: estruturação do time
            if a.cl.get("nomeacao") and a.cl.get("nivel") in LIDERANCA and b.cl.get("vaga") and a.cl.get("familia") in (b.cl.get("familia"), "receita"):
                ligar(a, b, "estruturacao_da_area")
                continue
            # R3 declaração → execução da mesma frente
            par = {ta, tb}
            if "declaracao_expansao" in par and par & {"expansao_comercial", "nova_filial"}:
                ligar(a, b, "declaracao_executada")
                continue
            # R4 mesmo lugar: expansão, filial, parceria e vagas que citam a mesma praça
            if (ta in EXPANSAO_TIPOS or a.cl.get("vaga")) and (tb in EXPANSAO_TIPOS or b.cl.get("vaga")) and (ta in EXPANSAO_TIPOS or tb in EXPANSAO_TIPOS):
                if _lugares(a.texto) & _lugares(b.texto):
                    ligar(a, b, "mesma_praca")
                    continue
            # R5 mesmo produto: lançamento + parceria/vaga/lançamento que citam o mesmo nome
            if "lancamento_produto" in par and par <= {"lancamento_produto", "nova_parceria", "vaga_area_alvo", "vaga_lideranca_alvo"}:
                if _nomes_proprios(" ".join(d.ev.get("sinal", "") + ". " + d.ev.get("porQueAgora", "") for d in a.docs), empresa) & \
                        _nomes_proprios(" ".join(d.ev.get("sinal", "") + ". " + d.ev.get("porQueAgora", "") for d in b.docs), empresa):
                    ligar(a, b, "mesmo_produto")
                    continue
            # R6 aquisição/fusão feita pela conta + reestruturação/integração
            if (ta in MA_COMPRA and (tb == "reestruturacao" or tb in MA_COMPRA)) or (tb in MA_COMPRA and ta == "reestruturacao"):
                ligar(a, b, "integracao_societaria")
                continue
            # R7 capital: só liga quando o texto cita o dinheiro; senão é possível vínculo
            if "captacao" in par:
                outro = b if ta == "captacao" else a
                if CAPITAL.search(norm(outro.texto)):
                    ligar(a, b, "uso_do_capital")
                elif outro.cl["categoria"] in ("expansao", "contratacao"):
                    possiveis.append((a.id, b.id, "capital_possivel"))
    por_raiz: dict[str, list[Acontecimento]] = {}
    for a in acs:
        por_raiz.setdefault(raiz(a.id), []).append(a)
    movs = []
    for r, itens in por_raiz.items():
        ids = {x.id for x in itens}
        movs.append(Movimento(id=r, acontecimentos=itens, vinculos=[v for v in vinculos if v[0] in ids]))
    return movs, possiveis
