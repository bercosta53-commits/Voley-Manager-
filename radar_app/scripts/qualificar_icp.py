#!/usr/bin/env python3
"""Qualifica conta e comitê pelo ICP da Velora: tier A/B/C da conta e papel ABM de cada pessoa.

uso: python3 scripts/qualificar_icp.py

Roda depois de classificar_contas.py (ramo, especialização, modelo, UF) e de coletar_cnpj.py (porte, UF da
Receita), e antes de score_v2.py, que passa a usar o encaixe calculado aqui no fit (spec 06, seção 7.1).

Conta — tier no padrão HubSpot, com as regras de data/icp.json (editáveis):
  A  encaixe ideal: ramo de serviços de tecnologia (lista "ramosPrincipais") e sede confirmada na região-alvo
  B  bom encaixe com uma ressalva: ramo secundário (software/SaaS/produto) ou UF ainda não confirmada
  C  encaixe parcial ou fora: UF fora da região, especialização excluída (martech/adtech), porte abaixo do alvo
     na Receita, produto para consumidor final ou ramo ainda sem classificação
  Cada tier vem com os motivos ("conta.icp.motivos"), para ninguém ter que adivinhar por que caiu ali.

Pessoa — papel no comitê de compra (boas práticas de ABM), pelo cargo:
  assina_cheque  quem aprova o orçamento: CEO, presidente, sócio, fundador, CFO, diretor geral
  decisor        quem decide na área que compra a Velora: CRO, CMO, CCO, VP e diretores de vendas,
                 comercial, marketing, growth, receita, negócios e parcerias
  dono_da_dor    quem vive o problema todo dia e puxa a conversa: heads, gerentes e coordenadores de
                 marketing, growth, vendas, SDR/BDR, inside sales, RevOps, customer success e parcerias
  trava          quem pode barrar ou atrasar: TI (CTO/CIO), compras, jurídico, controladoria, compliance,
                 segurança da informação
  influenciador  o resto (produto, operações, técnicos)
  Relevância (alta/média/baixa) dentro do contexto do ICP: os três primeiros papéis são alta; trava é média;
  influenciador é baixa. Em conta tier C a relevância cai um nível — a pessoa importa menos se a conta não é ICP.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
REGRAS = RAIZ / "data" / "icp.json"


def norm(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


def rx(*partes: str) -> re.Pattern:
    return re.compile(r"\b(" + "|".join(partes) + r")\b")


AREAS_COMERCIAIS = r"(vendas|comercial|marketing|growth|receita|revenue|negocios|business|parcerias|partnerships|alliances|sales|demand|mercado)"
ASSINA = rx(r"ceo", r"chief executive", r"presidente", r"president", r"fundador[a]?", r"co-?fundador[a]?", r"founder", r"co-?founder",
            r"socio[a]?", r"socio-diretor[a]?", r"partner", r"owner", r"proprietari[oa]", r"diretor[a]? (geral|executiv[oa]|presidente)",
            r"managing director", r"general manager", r"country manager", r"cfo", r"chief financial", r"diretor[a]? financeir[oa]",
            r"vp financeir[oa]", r"head of finance")
DECISOR = rx(r"cro", r"cmo", r"cco", r"cso", r"chief (revenue|marketing|commercial|sales|growth|business)",
             r"(vp|vice-presidente|vice presidente|vice president|svp|evp|diretor[a]?|director|superintendente) (de |of )?" + AREAS_COMERCIAIS,
             r"(diretor[a]?|director) (de )?(novos negocios|desenvolvimento de negocios|business development|go-to-market)",
             AREAS_COMERCIAIS + r" (director|diretor[a]?|vp|vice president|officer)")
DONO = rx(r"(head|gerente|manager|coordenador[a]?|coordinator|lider|lead|supervisor[a]?|especialista|specialist|analista senior) (de |of )?" + AREAS_COMERCIAIS,
          r"(head|gerente|manager|lider|lead) (de |of )?(inside sales|sdr|bdr|pre-?vendas|pre-?sales|customer success|cs|revops|revenue operations|crm|canais|channel|demand gen|produto e marketing|product marketing)",
          AREAS_COMERCIAIS + r" (manager|lead|head|coordinator|specialist|director|executive)",
          r"gestor[a]? (de )?(contas|negocios|vendas|marketing|comercial|relacionamento)", r"novos negocios",
          r"sucesso do cliente", r"customer success", r"customer experience",
          r"revops", r"revenue operations", r"sales ops", r"marketing ops", r"growth", r"demand generation", r"key account", r"account manager",
          r"executiv[oa] de (contas|vendas|negocios)", r"account executive", r"business development", r"desenvolvimento de negocios")
TRAVA = rx(r"cto", r"cio", r"ciso", r"chief (technology|information|security)", r"(diretor[a]?|director|head|gerente|manager|vp) (de |of )?(ti|tecnologia|technology|it|infraestrutura|seguranca|security)",
           r"compras", r"procurement", r"suprimentos", r"purchasing", r"juridic[oa]", r"legal", r"advogad[oa]", r"general counsel",
           r"controller", r"controladoria", r"(gerente|manager|coordenador[a]?|head) (administrativ[oa] e )?(financeir[oa]|finance|administrativ[oa])", r"compliance", r"dpo", r"privacidade", r"auditoria")

RELEVANCIA = {"assina_cheque": "alta", "decisor": "alta", "dono_da_dor": "alta", "trava": "media", "influenciador": "baixa"}
ROTULO_PAPEL = {"assina_cheque": "Assina o cheque", "decisor": "Decisor", "dono_da_dor": "Dono da dor", "trava": "Trava",
                "influenciador": "Influenciador"}
UM_NIVEL_ABAIXO = {"alta": "media", "media": "baixa", "baixa": "baixa"}


def papel_abm(pessoa: dict) -> str:
    cargo = norm(pessoa.get("cargo", ""))
    if not cargo:
        return "influenciador"
    # ordem importa: "CEO e cofundador" assina o cheque antes de ser lido como fundador de área;
    # "Diretor Comercial" é decisor antes de "comercial" virar dono da dor
    if ASSINA.search(cargo):
        return "assina_cheque"
    if DECISOR.search(cargo):
        return "decisor"
    if TRAVA.search(cargo):
        return "trava"
    if DONO.search(cargo):
        return "dono_da_dor"
    return "influenciador"


def tier_da_conta(conta: dict, regras: dict) -> tuple[str, list[str], dict]:
    """(tier, motivos, campos de fit para o score v2)."""
    ramo = (conta.get("ramoTI") or {}).get("codigo", "A classificar")
    esp = (conta.get("especializacao") or {}).get("codigo", "GEN")
    uf = (conta.get("uf") or "").upper()
    uf_confirmada = bool(uf) and conta.get("ufFonte") in ("receita", "site")
    porte = (conta.get("porte") or "").strip()
    modelo = conta.get("modeloNegocio")
    fora, ressalvas, ok = [], [], []

    if ramo in regras["ramosPrincipais"] and modelo == "produto":
        # dados, segurança e cloud têm empresa de serviço e empresa de produto: o ICP é serviço
        ressalvas.append("vende produto/SaaS num ramo de serviços (ramo secundário; ver decisão pendente sobre SaaS)")
        sub = 0.7
    elif ramo in regras["ramosPrincipais"]:
        ok.append("serviços de tecnologia (ramo principal)")
        sub = 1.0
    elif ramo in regras["ramosSecundarios"]:
        ressalvas.append("software/produto (ramo secundário; ver decisão pendente sobre SaaS)")
        sub = 0.7
    elif ramo in regras["ramosFora"]:
        fora.append("produto digital para consumidor final")
        sub = 0.0
    else:
        fora.append("ramo ainda sem classificação")
        sub = 0.4

    if esp in regras["especializacoesExcluidas"]:
        fora.append("martech/adtech (critério de exclusão)")
        sub = 0.0

    if uf and uf not in regras["regiao"]:
        fora.append(f"sede em {uf}, fora de {'/'.join(regras['regiao'])}")
    elif uf_confirmada:
        ok.append(f"sede em {uf}")
    elif uf:
        ressalvas.append(f"sede em {uf} a confirmar na Receita")
    else:
        ressalvas.append("UF não identificada")

    porte_fit = None
    if porte and any(norm(porte) == norm(p) for p in regras["portesAbaixo"]):
        fora.append(f"porte {porte} na Receita, abaixo de {regras['faturamentoAlvo'].split(' (')[0]}")
        porte_fit = 0.0
    elif porte:
        porte_fit = 0.5  # "Demais" na Receita: acima de EPP, faturamento ainda a validar
    else:
        ressalvas.append("faturamento não validado")

    tier = "C" if fora else ("A" if not [r for r in ressalvas if "faturamento" not in r] else "B")
    motivos = fora + ressalvas + ok
    fit = {"fitSubsegmento": sub, "fitModeloReceita": {"servico": 1.0, "misto": 0.6, "produto": 0.6}.get(modelo)}
    if porte_fit is not None:
        fit["fitPorte"] = porte_fit
    return tier, motivos, fit


def main() -> None:
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    regras = json.loads(REGRAS.read_text(encoding="utf-8"))
    tiers: dict[str, int] = {}
    papeis: dict[str, int] = {}
    for conta in base["contas"]:
        tier, motivos, fit = tier_da_conta(conta, regras)
        conta["icp"] = {"tier": tier, "motivos": motivos}
        conta["tier"] = tier  # campo que o app já mostra e filtra
        for k, v in fit.items():
            if v is None:
                conta.pop(k, None)
            else:
                conta[k] = v
        tiers[tier] = tiers.get(tier, 0) + 1
        for p in conta.get("comite", []):
            papel = papel_abm(p)
            relev = RELEVANCIA[papel]
            p["papelAbm"] = papel
            p["relevancia"] = UM_NIVEL_ABAIXO[relev] if tier == "C" else relev
            papeis[papel] = papeis.get(papel, 0) + 1
        presentes = {p["papelAbm"] for p in conta.get("comite", [])}
        conta["comiteFaltando"] = [ROTULO_PAPEL[x] for x in ("assina_cheque", "decisor", "dono_da_dor") if x not in presentes]
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print("tiers:", ", ".join(f"{k}: {v}" for k, v in sorted(tiers.items())))
    print("papéis:", ", ".join(f"{ROTULO_PAPEL[k]}: {v}" for k, v in sorted(papeis.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()
