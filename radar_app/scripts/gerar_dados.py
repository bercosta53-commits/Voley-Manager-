"""Gera os dados do app a partir da planilha de contas.

    python3 scripts/gerar_dados.py <planilha.xlsx>   -> data/contas.local.json (base real; fora do Git)
    python3 scripts/gerar_dados.py --exemplo         -> data/contas.exemplo.json (empresas fictícias; vai para o Git)

Enquanto os coletores não rodam, os sinais são de exemplo: plausíveis para o segmento de cada conta, marcados com
"exemplo": true e sem link. Os sinais reais (vagas do Indeed já captadas pelo radar) entram com link e "exemplo": false.
Só entram contas com CNPJ e site.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import sys
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOJE = date(2026, 9, 25)

TIPOS = {
    "troca_diretoria": ("Troca de diretoria", 8, "decisor"),
    "novo_cmo": ("Nova liderança de marketing", 9, "decisor"),
    "fusao": ("Fusão ou incorporação", 9, "decisor"),
    "vaga_marketing": ("Vaga de marketing", 7, "influenciador"),
    "vaga_comercial": ("Vaga comercial", 5, "influenciador"),
    "socio_entrou": ("Entrada de sócio", 7, "decisor"),
    "anuncios": ("Começou a anunciar", 6, "influenciador"),
    "nova_unidade": ("Nova unidade", 6, "decisor"),
    "lancamento": ("Lançamento de produto", 6, "influenciador"),
}

# Por segmento: (tipo, por que agora, fonte). {conta} é trocado pelo nome.
MODELOS = {
    "cooperativa": [
        ("fusao", "Assembleias aprovaram a incorporação de duas singulares à central", "Notícias"),
        ("troca_diretoria", "Novo diretor executivo assumiu a central com mandato até 2030", "Receita Federal"),
        ("vaga_marketing", "Abriu vaga de coordenação de marketing para aquisição de cooperados", "Vagas"),
        ("nova_unidade", "Anunciou 12 novas agências no interior do estado até dezembro", "Notícias"),
    ],
    "consorcio": [
        ("anuncios", "Passou a veicular anúncios de consórcio de imóveis no Google e na Meta", "Bibliotecas de anúncios"),
        ("nova_unidade", "Abriu três escritórios regionais no último trimestre", "Notícias"),
        ("vaga_comercial", "Contratando 8 consultores comerciais na região metropolitana", "Vagas"),
        ("socio_entrou", "Novo sócio-administrador registrado na Receita", "Receita Federal"),
    ],
    "seguro": [
        ("novo_cmo", "Contratou head de marketing vindo de seguradora de grande porte", "Notícias"),
        ("lancamento", "Lançou seguro garantia digital para pequenas construtoras", "Notícias"),
        ("vaga_marketing", "Abriu vaga de gerente de growth para canais digitais", "Vagas"),
        ("socio_entrou", "Diretor novo entrou no quadro societário", "Receita Federal"),
    ],
    "banco": [
        ("troca_diretoria", "Conselho aprovou novo diretor comercial para o varejo", "Notícias"),
        ("lancamento", "Lançou conta PJ com crédito pré-aprovado para médias empresas", "Notícias"),
        ("vaga_marketing", "Abriu vaga de especialista em CRM e automação de marketing", "Vagas"),
        ("fusao", "Concluiu a compra de uma fintech de crédito consignado", "Notícias"),
    ],
    "tecnologia": [
        ("novo_cmo", "Nova VP de marketing, vinda de SaaS internacional", "Notícias"),
        ("vaga_comercial", "Contratando executivos de contas para o mercado LATAM", "Vagas"),
        ("anuncios", "Começou campanha de mídia paga para o produto de pagamentos B2B", "Bibliotecas de anúncios"),
    ],
}

# Sinais reais já captados pelo radar (Indeed, 25/09/2026), por CNPJ raiz.
REAIS = {
    "05463212": ("vaga_marketing", "Vaga de analista de marketing com foco em aquisição de novos cooperados",
                 "Indeed", "2026-09-17", "https://to.indeed.com/aanxdkqrxdy4"),
    "58616418": ("vaga_comercial", "Vaga de assistente comercial para o segmento corporate",
                 "Indeed", "2026-09-03", "https://to.indeed.com/aaqncy9xkszq"),
    "14630124": ("vaga_comercial", "Vaga de executivo sênior de desenvolvimento de negócios internacional",
                 "Indeed", "2026-08-05", "https://to.indeed.com/aak8bpmxyzm9"),
}

EXEMPLO = [
    ("X-01", "Cooperativa Aurora", "Aurora Cooperativa de Crédito", "12.345.678/0001-95", "aurora.coop.br", "Chapecó", "SC", "Cooperativas de crédito", "Financeiro regional", "A", "ATIVAR", "Helena Duarte", "Diretora de Negócios"),
    ("X-02", "Seguradora Ponte", "Ponte Seguros S.A.", "23.456.789/0001-10", "ponteseguros.com.br", "Curitiba", "PR", "Seguro garantia", "Financeiro regional", "A", "NUTRIR / VALIDAR BLOQUEIO", "Rafael Moura", "CEO"),
    ("X-03", "Banco Litoral", "Banco Litoral S.A.", "34.567.890/0001-44", "bancolitoral.com.br", "São Paulo", "SP", "Banco médio e crédito", "Financeiro regional", "A", "ATIVAR", "", ""),
    ("X-04", "Consórcio Serra Azul", "Serra Azul Administradora de Consórcios", "45.678.901/0001-02", "serraazul.com.br", "Caxias do Sul", "RS", "Consórcios", "Financeiro regional", "C", "INSUFICIENTE — NÃO ABORDAR", "", ""),
    ("X-05", "Trilha Pagamentos", "Trilha Instituição de Pagamento", "56.789.012/0001-60", "trilhapay.com", "Porto Alegre", "RS", "Pagamentos B2B", "Tecnologia B2B", "A", "ATIVAR", "Marina Lopes", "Head de Growth"),
    ("X-06", "Central Vale Crédito", "Central Vale de Cooperativas", "67.890.123/0001-31", "centralvale.coop.br", "Blumenau", "SC", "Cooperativas de crédito", "Financeiro regional", "A", "ATIVAR", "Otávio Reis", "Superintendente"),
    ("X-07", "Guarida Seguros", "Guarida Seguradora S.A.", "78.901.234/0001-77", "guarida.com.br", "São Paulo", "SP", "Seguros e previdência", "Financeiro regional", "C", "NUTRIR / VALIDAR BLOQUEIO", "", ""),
    ("X-08", "Consórcio Horizonte", "Horizonte Consórcios Ltda.", "89.012.345/0001-08", "horizonteconsorcios.com.br", "Maringá", "PR", "Consórcios", "Financeiro regional", "C", "INSUFICIENTE — NÃO ABORDAR", "", ""),
    ("X-09", "Banco Planalto", "Banco Planalto S.A.", "90.123.456/0001-53", "bancoplanalto.com.br", "Curitiba", "PR", "Banco digital e crédito", "Financeiro regional", "A", "ATIVAR", "Paula Serra", "Diretora de Marketing"),
    ("X-10", "Nexo Fintech", "Nexo Tecnologia Financeira", "01.234.567/0001-89", "nexofin.com.br", "Florianópolis", "SC", "Fintech B2B", "Tecnologia B2B", "C", "ATIVAR", "", ""),
]


def semente(*partes) -> random.Random:
    return random.Random(int(hashlib.sha1("|".join(map(str, partes)).encode()).hexdigest()[:12], 16))


def familia(segmento: str, icp: str) -> str:
    s = (segmento + " " + icp).lower()
    if "cooperat" in s or "central" in s:
        return "cooperativa"
    if "consórc" in s or "consorc" in s:
        return "consorcio"
    if "segur" in s or "previd" in s:
        return "seguro"
    if "tecnolog" in s or "fintech" in s or "pagamento" in s:
        return "tecnologia"
    return "banco"


def serie_90(r: random.Random, final: int, tendencia: int) -> list[int]:
    """Curva de 90 dias, um ponto a cada 3 dias, que termina em `final` e sobe ou desce `tendencia` nas últimas 2 semanas."""
    inicio = max(4, min(95, final - tendencia - r.randint(-6, 6)))
    pontos, ruido = [], 0.0
    for i in range(31):
        t = i / 30
        base = inicio + (final - tendencia - inicio) * min(1, t / 0.85)
        if t > 0.85:
            base = final - tendencia + tendencia * (t - 0.85) / 0.15
        ruido += r.uniform(-2.2, 2.2)
        ruido *= 0.8
        pontos.append(round(max(0, min(100, base + ruido))))
    pontos[-1] = final
    return pontos


VAZIOS = {"", "NÃO ENCONTRADO", "NAO ENCONTRADO", "-", "—"}


def montar(linhas: list[dict], chance_a: float = 0.55, chance_c: float = 0.22) -> dict:
    contas, sinais = [], []
    for ln in linhas:
        for campo in ("pessoa", "cargo", "uf", "cidade"):
            if str(ln.get(campo) or "").strip().upper() in VAZIOS:
                ln[campo] = ""
        raiz = "".join(c for c in (ln["cnpj"] or "") if c.isdigit())[:8]
        conta_id = f"cnpj-{raiz}"
        r = semente(conta_id)
        fam = familia(ln.get("segmento") or "", ln.get("icp") or "")
        tier = (ln.get("tier") or "C")[:1]
        # Contas A tendem a ter mais sinal; cerca de 1 em 3 contas tem sinal novo hoje.
        novos = []
        if raiz in REAIS:
            tipo, porque, fonte, data, url = REAIS[raiz]
            novos.append(dict(tipo=tipo, porQueAgora=porque, fonte=fonte, data=data, url=url, exemplo=False))
        chance = chance_a if tier == "A" else chance_c
        if r.random() < chance:
            tipo, porque, fonte = r.choice(MODELOS[fam])
            dias = r.choice([0, 0, 1, 1, 2, 3, 5, 6, 9])
            novos.append(dict(tipo=tipo, porQueAgora=porque, fonte=fonte, data=(HOJE - timedelta(days=dias)).isoformat(),
                              url="", exemplo=True))
        pontos_sinais = sum(round(TIPOS[s["tipo"]][1] * r.uniform(1.6, 3.2)) for s in novos)
        final = max(6, min(96, (40 if tier == "A" else 20) + r.randint(-10, 16) + pontos_sinais))
        tendencia = min(final - 2, pontos_sinais + r.randint(-4, 3)) if novos else r.choice([-11, -7, -4, -2, 0, 1, 2, 3])
        contas.append({
            "id": conta_id, "nome": ln["empresa"], "razaoSocial": ln.get("razao") or "", "cnpj": ln["cnpj"],
            "dominio": ln["dominio"], "cidade": (ln.get("cidade") or "").title(), "uf": ln.get("uf") or "",
            "segmento": (ln.get("segmento") or "").split("·")[-1].strip(), "braco": ln.get("icp") or "", "tier": tier,
            "statusComercial": ln.get("status") or "",
            "decisor": {"nome": ln.get("pessoa") or "", "cargo": ln.get("cargo") or ""},
            "score": final, "tendencia": tendencia, "serie": serie_90(r, final, tendencia),
        })
        for i, s in enumerate(novos):
            rotulo, peso, membro = TIPOS[s["tipo"]]
            d = ln.get("pessoa") or ""
            abordar = ({"nome": d, "cargo": ln.get("cargo") or "", "papel": membro} if d and membro == "decisor"
                       else {"nome": "", "cargo": "Liderança de marketing" if membro == "influenciador" else "Diretoria executiva",
                             "papel": membro})
            sinais.append({"id": f"{conta_id}-{s['tipo']}-{i}", "contaId": conta_id, "tipo": s["tipo"], "rotulo": rotulo,
                           "peso": peso, "porQueAgora": s["porQueAgora"], "fonte": s["fonte"], "data": s["data"],
                           "url": s["url"], "exemplo": s["exemplo"], "abordar": abordar,
                           "pontos": round(peso * 4 * (0.5 ** ((HOJE - date.fromisoformat(s["data"])).days / 60)))})
    sinais.sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    return {"geradoEm": HOJE.isoformat(), "contas": contas, "sinais": sinais}


def ler_planilha(caminho: str) -> list[dict]:
    import openpyxl

    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    aba = next((wb[n] for n in wb.sheetnames if n.lower() in ("contas", "importação", "importacao")), wb.worksheets[0])
    linhas = list(aba.iter_rows(values_only=True))
    cab = [str(c or "").strip().lower() for c in linhas[0]]
    saida = []
    for valores in linhas[1:]:
        d = dict(zip(cab, valores))
        if not (d.get("cnpj") and (d.get("site") or d.get("dominio"))):
            continue
        dominio = str(d.get("dominio") or d.get("site") or "").lower().replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
        if dominio.endswith("gupy.io"):
            dominio = ""  # página de vagas, não é o site da empresa
        saida.append({"empresa": d.get("empresa"), "razao": d.get("razao_social"), "cnpj": d.get("cnpj"), "dominio": dominio,
                      "cidade": d.get("cidade"), "uf": d.get("uf"), "segmento": d.get("subsegmento"), "icp": d.get("icp"),
                      "tier": d.get("tier"), "status": d.get("status_comercial"), "pessoa": d.get("pessoa_p1"),
                      "cargo": d.get("cargo_p1")})
    return saida


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] != "--exemplo":
        linhas, destino = ler_planilha(sys.argv[1]), RAIZ / "data" / "contas.local.json"
    else:
        campos = ["id", "empresa", "razao", "cnpj", "dominio", "cidade", "uf", "segmento", "icp", "tier", "status", "pessoa", "cargo"]
        linhas, destino = [dict(zip(campos, e)) for e in EXEMPLO], RAIZ / "data" / "contas.exemplo.json"
    dados = montar(linhas) if destino.name == "contas.local.json" else montar(linhas, 0.95, 0.6)
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{destino.name}: {len(dados['contas'])} contas, {len(dados['sinais'])} sinais")


if __name__ == "__main__":
    main()
