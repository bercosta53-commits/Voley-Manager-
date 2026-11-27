"""Recalcula VSCS 3.4 localmente, sem rede e sem publicar a base privada.

Uso: python3 -m vscs.recalcular34 --snapshot /caminho/privado/payload.json
     --hoje 2026-11-27 --output /caminho/privado/candidato.json
Os arquivos de entrada/saída devem ficar fora do repositório.
"""
from __future__ import annotations
import argparse, copy, json, hashlib
from datetime import date
from pathlib import Path
from . import motor33, motor34
from .adaptador import nivel_por_fator
from .reconciliar import carregar, eventos_da_conta, modelo_e_revisoes

def recalcular(base, hoje):
    p32,p34=motor34.parametros()
    p32,original_revs,difs,sobras=modelo_e_revisoes(base,p32)
    # Manter parâmetros de produção que não fazem parte da mudança 3.4.
    p33=copy.deepcopy(motor33.parametros()[1])
    model=base.get("scoreModeloDC") or {}
    for k in ("dc","fonte","movimento","lideranca_nomeada","faixa_90","janela_acao_dias","maturacao","adaptador","relacionamento"):
        if isinstance(model.get(k),dict):
            p33[k].update(model[k])
            p34[k].update(model[k])
    staged={str(x["id"]):x for x in (base.get("revisaoPendentesVSCS34") or {}).get("registros",[])}
    # Ranking SQL é hipótese, não evidência causal. Preservar vínculos documentados.
    planos=(base.get("revisaoHorizontesVSCS34") or {}).get("registros",{})
    revs=copy.deepcopy(original_revs)
    blocked=[]
    for sid,x in staged.items():
        status=x.get("status","")
        r=x.get("revisao") or {}
        if status.startswith("confirmado") and r.get("chave") and (r.get("base") or 0)>0:
            patch={k:r[k] for k in ("chave","base","categoria","fonte_fator","data","vinculoAtual","horizontePlano","statusVaga","vinculoCausal") if r.get(k) is not None}
            if "fonte_fator" in patch: patch["fonte_nivel"]=nivel_por_fator(float(patch["fonte_fator"]))
            if status=="confirmado_parcial" and any(t in (r.get("nota") or "").lower() for t in ("não aplicar maturação","não comprova mandato","não ativar maturação")):
                patch["vinculoAtual"]=False
            revs[sid]={**revs.get(sid,{}),**patch,"pontua":True}
        elif status == "contexto_sem_pontuacao_34" and str(x.get("tipo","")).startswith("vaga_"):
            # A exclusão geral de vagas foi revogada. Preserva revisões individuais, inclusive pontua=False,
            # e deixa o classificador avaliar as vagas sem veto individual existente.
            continue
        elif status.startswith("contexto") or status=="identidade_conflitante" or status=="confirmado_parcial":
            revs[sid]={**revs.get(sid,{}),"pontua":False}
            if status=="identidade_conflitante" or status=="confirmado_parcial": blocked.append(sid)
    output=[]
    errors=[]
    signals=base.get("sinais",[])
    for conta in base["contas"]:
        evs=eventos_da_conta(conta,signals)
        candidate=[]
        local_revs=copy.deepcopy(revs)
        for event in evs:
            e=copy.deepcopy(event)
            sid=str(e.get("id",""))
            # Só revisões de horizonte confirmadas explicitamente podem alimentar o motor.
            plano=planos.get(sid,{})
            if plano.get("status")=="confirmado" and isinstance(plano.get("horizontePlano"),dict):
                local_revs.setdefault(sid,{})["horizontePlano"]=plano["horizontePlano"]
            r=staged.get(sid,{}).get("revisao") or {}
            if r.get("vinculoConfirmadoEm"):
                e["vinculoConfirmadoEm"]=r["vinculoConfirmadoEm"]
            candidate.append(e)
        try:
            old=motor33.calcular(evs,hoje,empresa=conta.get("nome",""),p32=p32,p33=p33,interacoes=conta.get("interacoes"),conta=conta,revisoes=original_revs)
            new=motor34.calcular(candidate,hoje,empresa=conta.get("nome",""),p32=p32,p33=p34,interacoes=conta.get("interacoes"),conta=conta,revisoes=local_revs)
            old_score=float(conta.get("score") or 0)
            output.append({"id":conta["id"],"nome":conta.get("nome"),"tier":conta.get("tier"),"scorePublicado":old_score,
                           "score33MesmoDia":old["vscs"],"score34":new["vscs"],"delta":round(new["vscs"]-old_score,2),"v2":new})
        except Exception as exc:
            errors.append({"id":conta["id"],"erro":type(exc).__name__+": "+str(exc)})
    output.sort(key=lambda x:(-x["score34"],x["id"]))
    return {"versao":"vscs-3.4-dc","status":"candidato_nao_publicar","data":hoje.isoformat(),
            "contas":output,"erros":errors,"bloqueados":blocked,"parametrosDif":difs,"parametrosSemCorrespondencia":sobras,
            "resumo":{"contasEsperadas":len(base["contas"]),"contasCalculadas":len(output),"sinais":len(signals),
                      "acima55":sum(x["score34"]>=55 for x in output),"acima70":sum(x["score34"]>=70 for x in output)}}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--snapshot",required=True)
    ap.add_argument("--hoje",required=True)
    ap.add_argument("--output",required=True)
    args=ap.parse_args()
    src,dst=Path(args.snapshot).resolve(),Path(args.output).resolve()
    repo=Path(__file__).resolve().parents[3]
    if src.is_relative_to(repo) or dst.is_relative_to(repo) or src==dst:
        raise SystemExit("Entrada e saída devem ser arquivos distintos, fora do repositório.")
    base=carregar(str(src))
    result=recalcular(base,date.fromisoformat(args.hoje))
    result["sha256Entrada"]=hashlib.sha256(src.read_bytes()).hexdigest()
    with dst.open("x",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
    print(json.dumps(result["resumo"],ensure_ascii=False))
    if result["erros"]: raise SystemExit(1)

if __name__=="__main__": main()
