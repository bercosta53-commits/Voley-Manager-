#!/usr/bin/env python3
"""Score de sinais v2.1 (spec 06-score-sinais.md): serviço único, puro e testável.

uso: python3 scripts/score_v2.py [--relatorio caminho.md]

Entrada por conta: atributos (fit), eventos (sinais[] + historico[] já classificados), comitê (access),
interações (engagement) e supressões. Saída gravada em conta["v2"]: fit, timing, access, engagement,
proximity, anel, contribuições, frase de explicação, itens com valor padrão pendente e a versão dos pesos.

NÃO troca o score exibido (spec, seção 11: "pare depois da migração com o relatório e espere aprovação").
O app continua mostrando conta["score"] (v1, scripts/calcular_score.py) até a aprovação.

Como os tipos do radar viram os tipos do spec — a taxonomia gravada pelos coletores é a do classificador
(executivo_chegou, captacao, expansao_mercado...). O spec separa por nível (A gatilho forte, B médio, C
contexto) usando detalhes que o classificador ainda não grava em campo próprio (cargo de quem chegou,
estágio da rodada, se a expansão já aconteceu ou é declaração). Até o classificador gravar esses campos,
regras de texto sobre o sinal e o porQueAgora decidem — ver nivelar(). Cada regra está anotada.
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
VERSAO = "2.1"

# ---------------------------------------------------------------- parâmetros (spec 2.2) — editáveis


@dataclass(frozen=True)
class Param:
    tipo: str  # tipo do spec
    nivel: str  # A, B ou C
    peso: float
    plato: int  # dias com curva 1.0 depois do fato (até_fechar = igual à janela)
    meia_vida: int
    janela: int  # dias depois do fato em que ainda conta
    antes: int = 0  # dias ANTES do fato em que já conta (eventos futuros)


P = {
    # nível A — gatilho forte
    "troca_lideranca_owner": Param("troca_lideranca", "A", 1.00, 60, 45, 150),
    "captacao_a": Param("captacao", "A", 0.90, 90, 45, 180),
    "expansao_comercial": Param("expansao_comercial", "A", 0.80, 30, 45, 120),
    "vaga_lideranca_alvo": Param("vaga_lideranca_alvo", "A", 0.80, 90, 1, 90),
    "troca_lideranca_ceo": Param("troca_lideranca", "A", 0.70, 60, 45, 150),
    "fusao_aquisicao": Param("fusao_aquisicao", "A", 0.70, 30, 60, 180),
    # nível B — gatilho médio
    "declaracao_meta": Param("declaracao_expansao", "B", 0.55, 15, 30, 90),
    "declaracao_especifica": Param("declaracao_expansao", "B", 0.45, 15, 30, 90),
    "captacao_seed": Param("captacao", "B", 0.50, 60, 45, 150),
    "vaga_area_alvo": Param("vaga_area_alvo", "B", 0.40, 60, 1, 60),
    "lancamento_novo_vertical": Param("lancamento_produto", "B", 0.40, 0, 30, 60),
    "troca_lideranca_clevel": Param("troca_lideranca", "B", 0.40, 30, 45, 120),
    # nível C — contexto (meia-vida 21 d, sem platô; soma limitada a 0.25)
    "lancamento_comum": Param("lancamento_produto", "C", 0.20, 0, 21, 60),
    "nova_parceria": Param("nova_parceria", "C", 0.20, 0, 21, 90),
    "presenca_patrocinador": Param("presenca_evento", "C", 0.15, 0, 21, 45, 30),
    "presenca_expositor": Param("presenca_evento", "C", 0.10, 0, 21, 45, 30),
    "presenca_startup": Param("presenca_evento", "C", 0.05, 0, 21, 45, 30),
    "declaracao_generica": Param("declaracao_expansao", "C", 0.15, 0, 21, 60),
    "palestra_lideranca": Param("palestra_lideranca", "C", 0.10, 0, 21, 30, 30),
    "nova_filial": Param("nova_filial", "C", 0.15, 0, 21, 120),
    "reestruturacao": Param("reestruturacao", "C", 0.10, 0, 21, 60),
    "premio": Param("premio", "C", 0.05, 0, 21, 60),  # fora da tabela do spec: tratado como notícia de contexto
    "noticia_setorial": Param("noticia_setorial", "C", 0.05, 0, 21, 30),
}
TETO_CONTEXTO = 0.25
CONFIANCA_MINIMA = 0.6
UFS_ALVO = {"SP", "PR", "SC", "RS"}
LIMIAR_SINAL = 0.5
LIMIAR_SAIDA_ANEL1 = 0.4  # histerese (6.1)
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
        return "vaga_lideranca_alvo"
    if tipo == "vaga_area_alvo":
        return "vaga_area_alvo"
    if tipo == "fusao_aquisicao":
        return "fusao_aquisicao"
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


# ---------------------------------------------------------------- curva e confiança (spec 2 e 2.1)


def curva(p: Param, dias: int) -> float:
    """dias = hoje - data do fato (negativo = evento futuro)."""
    if dias < 0:
        return 1.0 if -dias <= p.antes else 0.0
    if dias > p.janela:
        return 0.0
    if dias <= p.plato:
        return 1.0
    return 0.5 ** ((dias - p.plato) / p.meia_vida)


def confianca(ev: dict) -> float:
    """min(match, classificação). Ainda não há campos próprios: classificado (tem "sinal") = 0.9 de
    classificação; sem classificar = 0.5 (não pontua). Match: vaga e evento lidos no site/página da própria
    conta = 1.0; notícia = 0.85. Cada fonte extra que confirmou o fato soma 0.05 (spec 2.3)."""
    if "match_confidence" in ev or "classification_confidence" in ev:
        return min(ev.get("match_confidence", 1.0), ev.get("classification_confidence", 1.0))
    classificacao = 0.9 if ev.get("sinal") else 0.5
    origem_propria = ev.get("fonte") == "Página de carreiras" or bool(ev.get("evento"))
    match = 1.0 if origem_propria else 0.85
    extras = max(0, len(ev.get("fontes") or []) - 1)
    return min(1.0, min(match, classificacao) + 0.05 * extras)


@dataclass
class Contribuicao:
    chave: str
    tipo: str
    nivel: str
    peso: float
    curva: float
    confianca: float
    valor: float
    data: str
    texto: str


def contribuicoes(eventos: list[dict], hoje: date) -> list[Contribuicao]:
    """Uma contribuição por tipo do spec por conta (a mais forte — spec 2.3)."""
    melhores: dict[str, Contribuicao] = {}
    for ev in eventos:
        chave = nivelar(ev)
        if not chave:
            continue
        p = P[chave]
        conf = confianca(ev)
        if conf < CONFIANCA_MINIMA:
            continue
        c = curva(p, (hoje - date.fromisoformat(ev["data"])).days)
        valor = p.peso * conf * c
        if valor <= 0:
            continue
        atual = melhores.get(p.tipo)
        if atual is None or valor > atual.valor:
            melhores[p.tipo] = Contribuicao(chave, p.tipo, p.nivel, p.peso, round(c, 3), round(conf, 2), valor, ev["data"],
                                            ev.get("sinal") or ev.get("porQueAgora", ""))
    # declaração encerrada quando o fato correspondente chega (2.4: "promessa cumprida")
    decl = melhores.get("declaracao_expansao")
    if decl:
        for t in ("expansao_comercial", "nova_filial", "captacao", "vaga_lideranca_alvo", "lancamento_produto"):
            fato = melhores.get(t)
            if fato and fato.data >= decl.data and fato.nivel != "C":
                del melhores["declaracao_expansao"]
                break
    return sorted(melhores.values(), key=lambda c: -c.valor)


def noisy_or(valores: list[float]) -> float:
    r = 1.0
    for v in valores:
        r *= 1 - v
    return 1 - r


def timing(contrs: list[Contribuicao]) -> float:
    gatilhos = noisy_or([c.valor for c in contrs if c.nivel in ("A", "B")])
    contexto = min(TETO_CONTEXTO, noisy_or([c.valor for c in contrs if c.nivel == "C"]))
    return 1 - (1 - gatilhos) * (1 - contexto)


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
    return round(valor, 3)


OWNER_AREAS = {"marketing", "comercial"}
PAYER_AREAS = {"executivo", "financeiro"}


def contato_ativavel(conta: dict) -> tuple[dict | None, dict | None]:
    """(pessoa owner/payer com canal verificado, pessoa owner/payer sem canal). E-mail vindo do Snov conta
    como canal verificado (é de onde vem a validação na base atual)."""
    com, sem = None, None
    for p in conta.get("comite", []):
        if p.get("papel") != "decisor" or p.get("area") not in OWNER_AREAS | PAYER_AREAS:
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
    fit: float
    timing: float
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


def calcular(conta: dict, eventos: list[dict], hoje: date, interacoes: list[dict] | None = None,
             anterior: dict | None = None) -> Resultado:
    pendentes: list[str] = []
    contrs = contribuicoes(eventos, hoje)
    t = timing(contrs)
    e = engagement(interacoes or [], hoje)
    if not interacoes:
        pendentes.append("engagement.sem_fonte")
    f = fit(conta, pendentes)
    a = access(conta)
    tem_gatilho = any(c.nivel in ("A", "B") for c in contrs)
    limiar = LIMIAR_SAIDA_ANEL1 if (anterior or {}).get("anel") == 1 else LIMIAR_SINAL  # histerese
    sinal_ativo = (t >= limiar and tem_gatilho) or e >= 0.5
    com, sem = contato_ativavel(conta)
    fora, bloqueia = supressao(conta, contrs, hoje)

    if fora:
        anel = None
    elif f < LIMIAR_FIT:
        anel = 4
    elif sinal_ativo and com and not bloqueia:
        anel = 1
    elif sinal_ativo or (bloqueia and tem_gatilho):
        anel = 2
    else:
        anel = 3

    prox = 0.30 * f + 0.30 * t + 0.25 * a + 0.15 * e
    if anterior and "proximity" in anterior:
        prox = 0.7 * prox + 0.3 * anterior["proximity"]

    return Resultado(
        versao=VERSAO, fit=f, timing=round(t, 3), access=round(a, 3), engagement=round(e, 3), proximity=round(prox, 3),
        anel=anel, sinal_ativo=sinal_ativo,
        contribuicoes=[{"tipo": c.tipo, "nivel": c.nivel, "peso": c.peso, "curva": c.curva, "confianca": c.confianca,
                        "valor": round(c.valor, 3), "data": c.data, "texto": c.texto} for c in contrs],
        frase=frase(contrs, anel, com, sem, bloqueia, fora), fora_do_radar=fora,
        janela_dupla=sum(1 for c in contrs if c.nivel == "A") >= 2, pendentes=pendentes,
    )


def frase(contrs: list[Contribuicao], anel: int | None, com: dict | None, sem: dict | None, bloqueia: bool,
          fora: str | None) -> str:
    """Duas maiores contribuições + a peça que falta (spec 8)."""
    if fora:
        return f"Fora do radar: {fora}."
    partes = [c.texto.rstrip(".") for c in contrs[:2] if c.texto]
    inicio = (" e ".join(partes) + ".") if partes else "Nenhum sinal ativo."
    if anel == 4:
        falta = "Falta confirmar o encaixe no ICP."
    elif bloqueia:
        falta = "Em espera: cooldown ou negócio perdido recente."
    elif not (com or sem):
        falta = "Falta mapear o decisor."
    elif not com:
        falta = f"Falta validar o canal de {sem['nome'].split()[0]}."
    elif anel == 3:
        falta = f"Contato pronto ({com['nome'].split()[0]}); falta um gatilho."
    else:
        falta = f"Falar com {com['nome']}."
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
    linhas = [f"# Migração do score v1 → v2.{VERSAO.split('.')[1]} ({date.today().isoformat()})", "",
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

    pend = sorted({p for c in contas for p in c["v2"]["pendentes"]})
    linhas += ["", "## Valores padrão em uso (default_pendente)", ""] + [f"- `{p}`" for p in pend]
    return "\n".join(linhas) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--relatorio", type=Path, help="grava o relatório de migração v1 → v2 nesse arquivo")
    args = ap.parse_args()
    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()
    for conta in base["contas"]:
        anterior = conta.get("v2") or {}
        # histerese e suavização usam o resultado do ÚLTIMO DIA anterior; rodar duas vezes no mesmo dia
        # não pode suavizar em cima de si mesmo
        if anterior.get("calculadoEm") == hoje.isoformat():
            referencia = anterior.get("referencia")
        else:
            referencia = {"anel": anterior["anel"], "proximity": anterior["proximity"]} if anterior else None
        r = calcular(conta, eventos_da_conta(conta, base.get("sinais", [])), hoje, conta.get("interacoes"), referencia)
        conta["v2"] = r.__dict__ | {"calculadoEm": hoje.isoformat(), "referencia": referencia}
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
