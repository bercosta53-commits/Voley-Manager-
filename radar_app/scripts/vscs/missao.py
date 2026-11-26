"""Mandato declarado: atributo do acontecimento, nunca documento ou movimento adicional."""
from __future__ import annotations
import re
from datetime import date
from .classificar import norm

TIPOS = {
    "grandes_contas": ("ABM + Outbound otimizado", "Contas-alvo e pipeline enterprise nos primeiros 90 dias"),
    "expansao_geografica": ("GTM + ICP e mapeamento de mercado", "ICP e primeiras contas na nova praça"),
    "conversao_eficiencia": ("RevOps + Growth + Mentorias", "Gargalos, conversão e previsibilidade no trimestre"),
    "novo_mercado": ("ICP + Inteligência de mercado", "Validar o ICP da vertical antes de escalar"),
    "estruturar_time_canal": ("Growth Leader as a Service + Mentorias", "Estruturar a operação e acelerar produtividade"),
    "lancamento_produto": ("GTM + Aquisição", "Converter o lançamento em pipeline"),
    "transformacao_comercial": ("RevOps + Estratégia comercial", "Transformar processos, dados e governança de receita"),
    "escala_aquisicao_digital": ("Growth + Performance + CRO", "Escalar aquisição com eficiência"),
    "diversificacao_receita": ("Inteligência de mercado + GTM", "Validar novas fontes de receita"),
    "recuperacao_crescimento": ("Diagnóstico + Estratégia de Growth", "Identificar gargalos e recuperar tração"),
    "generica": (None, None),
}
ELEGIVEIS = {"coordenacao", "gerencia", "head", "diretoria_receita", "clevel_receita"}
FATORES = {"generica": 1.0, "especifica": 1.15, "meta_praca": 1.20}

# Fallback restrito a texto explicitamente literal do anúncio. Resumos internos
# podem orientar revisão, mas não são aspas da fonte nem liberam pontos.
PADRAO = re.compile(r"\b(?:com a missão de|com a missao de|responsável por|responsavel por|para)\s+([^.;\n]{8,120})", re.I)
ALVOS = (
    ("grandes_contas", r"\b(grandes contas|enterprise|key accounts)\b"),
    ("conversao_eficiencia", r"\b(conversao|previsibilidade|eficiencia do funil|cac)\b"),
    ("escala_aquisicao_digital", r"\b(aquisicao digital|aquisicao de clientes|performance marketing)\b"),
    ("estruturar_time_canal", r"\b(montar (o |um )?time (comercial|de vendas|de growth)|estruturar canais|criar a area comercial)\b"),
    ("lancamento_produto", r"\b(lancar (o |um )?produto|go-to-market do lancamento)\b"),
)
VERBO = re.compile(r"\b(abrir|dobrar|triplicar|ampliar|aumentar|reduzir|melhorar|estruturar|montar|criar|escalar|recuperar|lancar|expandir|entrar|conquistar|acelerar|transformar|diversificar|fortalecer|liderar a entrada|desenvolver|executar|construir|negociar|gerar|implementar|aprofundar|conectar|otimizar|reunir|reunindo|ampliacao|expansao|fortalecimento)\b")
META = re.compile(r"\b(dobrar|triplicar|quadruplicar)\b|\d+(?:[.,]\d+)?\s*(?:%|por cento|milhoes|bilhoes|vezes)\b|\b\d+(?:[.,]\d+)?%")

def _normalizar(ev: dict, bruto: dict) -> dict | None:
    tipo = bruto.get("tipo")
    texto = bruto.get("texto")
    confianca = bruto.get("confianca")
    if tipo not in TIPOS or not isinstance(texto, str) or not 0 < len(texto.strip()) <= 120:
        return None
    if not isinstance(confianca, (int, float)) or isinstance(confianca, bool) or not 0 <= confianca <= 1:
        return None
    if bruto.get("ativa") is False or bruto.get("substituidaEm"):
        return None
    url = bruto.get("fonteUrl") or ev.get("url")
    literal = ev.get("trechoLiteral") or ev.get("tituloOriginal")
    if literal and texto not in literal:
        return None
    generico = re.fullmatch(r"(?:liderar|fortalecer|acelerar|aumentar|ampliar|impulsionar|estruturar)\s+(?:o |a |os |as )?(?:crescimento|area comercial|negocios|vendas|receita|presenca)(?:\s+da (?:empresa|companhia))?", norm(texto).strip(" ."))
    especifica = bruto.get("especifica") is True and tipo != "generica" and bool(VERBO.search(norm(texto))) and not generico
    meta = bruto.get("meta")
    praca = bruto.get("praca")
    # Prazo isolado não é meta. Meta/praca precisam estar no trecho, não em inferência.
    meta = meta if isinstance(meta, str) and meta.strip() and norm(meta) in norm(texto) and META.search(norm(meta)) else None
    praca = praca if isinstance(praca, str) and praca.strip() and norm(praca) in norm(texto) else None
    fator = 1.0
    if especifica and confianca >= .6 and isinstance(url, str) and url.startswith(("https://", "http://")):
        fator = 1.20 if meta or praca else 1.15
    if (ev.get("missaoRevisao") or {}).get("status") == "confirmada_pendente_elegibilidade":
        fator = 1.0
    oferta, angulo = TIPOS[tipo]
    return {"tipo": tipo, "texto": texto, "especifica": especifica, "meta": meta, "praca": praca,
            "confianca": confianca, "fonteUrl": url, "fator": fator, "oferta": oferta if especifica and confianca >= .6 else None,
            "angulo": angulo if especifica and confianca >= .6 else None, "origem": "classificador",
            "tensaoExecucao": bruto.get("tensaoExecucao"), "aderenciaVelora": bruto.get("aderenciaVelora")}

def extrair(ev: dict) -> dict | None:
    if "missao" in ev:  # um campo explícito inválido/baixo nunca pode ser promovido pelo fallback
        bruto = ev["missao"]
        return _normalizar(ev, bruto) if isinstance(bruto, dict) else None
    for literal in (ev.get("tituloOriginal"), ev.get("trechoLiteral")):
        if not isinstance(literal, str):
            continue
        for m in PADRAO.finditer(literal):
            trecho = m.group(1).strip()
            if not VERBO.search(norm(trecho)):
                continue
            tipos = [tipo for tipo, rx in ALVOS if re.search(rx, norm(trecho))]
            if len(tipos) != 1:
                continue
            res = _normalizar(ev, {"tipo": tipos[0], "texto": trecho, "especifica": True,
                                   "meta": None, "praca": None, "confianca": .65})
            if res:
                res["origem"] = "fallback_literal"
                return res
    return None

def ingresso_confirmado(ev: dict, hoje: date) -> bool:
    """Confirmação da entrada efetiva, não mera intenção de contratar ou anúncio futuro."""
    if ev.get("ingressoConfirmado") is not True:
        return False
    url = ev.get("ingressoFonteUrl")
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        return False
    if ev.get("ingressoEm"):
        try:
            if date.fromisoformat(str(ev["ingressoEm"])[:10]) > hoje:
                return False
        except ValueError:
            return False
    return True

def selecionar(ac, habilitado: bool, hoje: date) -> dict | None:
    if not habilitado or ac.cl.get("nivel") not in ELEGIVEIS or not ac.cl.get("nomeacao") or ac.cl.get("vaga"):
        return None
    # Só documentos de nomeação, nunca o anúncio de vaga agrupado ao mesmo fato.
    docs = [d for d in ac.docs if d.cl.get("nomeacao") and not d.cl.get("vaga")]
    if not any(ingresso_confirmado(d.ev, hoje) for d in docs):
        return None
    candidatos = [m for d in docs if (m := extrair(d.ev)) is not None]
    if not candidatos:
        return None
    # Nunca acumular mandatos. Empate: evidência mais confiável e ordenação determinística.
    return dict(max(candidatos, key=lambda x: (x["fator"], x["confianca"], x["texto"])))
