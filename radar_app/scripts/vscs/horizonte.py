"""Curva por horizonte declarado (VSCS 3.4). Não infere prazos de textos livres.
Metadados de revisão com evidência explícita; sem horizonte válido, o motor usa o tempo convencional.
"""
from datetime import date

TIPOS = {"meta_anual","investimento_futuro","orcamento_aprovado","plano_gtm","programa_plurianual"}
STATUS = {"anunciado","aprovado","em_execucao","revisado","a_revalidar","concluido","cancelado","substituido"}
ENCERRADOS = {"concluido","cancelado","substituido"}

def _dia(valor):
    if not isinstance(valor,str) or len(valor)!=10:
        raise ValueError("data ISO exata necessária")
    return date.fromisoformat(valor)

def avaliar(h, anuncio, hoje, cfg):
    """Retorna metadados calculados ou None. Mudanças futuras não afetam o passado."""
    if not isinstance(h,dict) or h.get("tipo") not in TIPOS or h.get("status") not in STATUS:
        return None
    if not h.get("fonte") or not h.get("justificativa"):
        return None
    try:
        a,i,f = (_dia(h[k]) for k in ("dataAnuncio","inicio","fim"))
        if a != anuncio or f < i or f < a:
            return None
        conf = _dia(h.get("ultimaConfirmacaoEm") or h["dataAnuncio"])
        if conf < a:
            return None
        mudanca = _dia(h["dataMudanca"]) if h.get("dataMudanca") else None
        if mudanca and mudanca < a:
            return None
        if h["status"] in ENCERRADOS and not mudanca:
            return None
    except (KeyError,TypeError,ValueError):
        return None
    i=max(i,a)
    fi=2**(-((i-a).days)/cfg["meia_vida_pre_execucao_dias"])
    ff=fi*cfg["fator_fim_execucao"]
    if hoje < a:
        fase,fator="futuro",0.
    elif h["status"] in ENCERRADOS and mudanca <= hoje:
        fase,fator=h["status"],0.
    elif hoje < i:
        fase,fator="pre_execucao",2**(-((hoje-a).days)/cfg["meia_vida_pre_execucao_dias"])
    elif hoje <= f:
        progresso=(hoje-i).days/max(1,(f-i).days)
        fase,fator="periodo_alvo",fi*(1-(1-cfg["fator_fim_execucao"])*progresso)
    elif (hoje-f).days <= cfg["expiracao_residual_dias"]:
        fase,fator="residual",ff*2**(-((hoje-f).days)/cfg["meia_vida_residual_dias"])
        if i==f:
            fator=fi*2**(-((hoje-f).days)/cfg["meia_vida_residual_dias"])
    else:
        fase,fator="expirado",0.
    confirmada = conf if conf <= hoje else a
    idade = max(0,(hoje-confirmada).days)
    return {**h,"fase":fase,"fator":fator,"ultimaConfirmacaoConsiderada":confirmada.isoformat(),
            "revalidar":fator>0 and idade>=cfg["revisao_dias"],
            "a_revalidar":fator>0 and idade>=cfg["limite_sem_revalidacao_dias"],
            "vigente":fase in ("pre_execucao","periodo_alvo") and fator>0,
            "statusConsiderado":h["status"] if not mudanca or mudanca<=hoje else "anunciado"}

def do_acontecimento(ac, hoje, cfg):
    # Não prolongar cargo, vaga, resultado passado ou negativo por plano mencionado no texto.
    if ac.cl.get("vaga") or ac.cl.get("nomeacao") or ac.cl.get("categoria") in ("negativo","contexto","vaga_aberta"):
        return None
    # Revisão estruturada sobre um fato positivo; em caso de horizontes conflitantes, não adivinhar.
    candidatos=[]
    for d in ac.docs:
        h=d.ev.get("horizontePlano")
        r=avaliar(h,ac.data,hoje,cfg)
        if r is not None:
            candidatos.append(r)
    if not candidatos:
        return None
    if len({(r["tipo"],r["inicio"],r["fim"],r.get("movimentoId")) for r in candidatos})>1:
        return None
    return max(candidatos,key=lambda r:(r.get("dataMudanca") or r["dataAnuncio"],r["ultimaConfirmacaoConsiderada"]))
