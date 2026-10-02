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


VAZIOS = {"", "NÃO ENCONTRADO", "NAO ENCONTRADO", "-", "—"}

MEIA_VIDA = 60  # dias; o mesmo decaimento do score no radar


def pontos_em(peso: int, fato: date, dia: date) -> float:
    """Quanto um fato vale no dia `dia`: peso x 4, caindo pela metade a cada MEIA_VIDA dias."""
    if dia < fato:
        return 0.0
    return peso * 4 * 0.5 ** ((dia - fato).days / MEIA_VIDA)


# Área do cargo no comitê de compra (para montar as vagas do comitê na tela da conta).
def area_do_cargo(cargo: str) -> str:
    c = cargo.lower()
    if any(p in c for p in ("marketing", "growth", "marca", "comunica")):
        return "marketing"
    if any(p in c for p in ("comercial", "vendas", "negócios", "negocios", "canais")):
        return "comercial"
    return "executivo"


FONTES = [
    # id, nome, o que busca, onde, de quanto em quanto tempo (dias), o que precisa para rodar, variável de ambiente
    ("cnpj", "Receita Federal (CNPJ)", "Mudanças no quadro de sócios e na situação cadastral", "BrasilAPI, dados públicos da Receita", 7, "", ""),
    ("noticias", "Notícias", "Troca de diretoria, fusões, novas unidades e lançamentos citando a empresa", "Google Notícias", 1, "", ""),
    ("vagas", "Vagas", "Vagas de marketing e comercial abertas pela empresa", "Páginas de carreiras (Gupy e outras) e Indeed", 7, "", ""),
    ("consultorias", "Consultorias de recrutamento", "Vagas executivas anunciadas por consultorias (Michael Page, Robert Half e outras)", "Sites das consultorias", 7, "", ""),
    ("apollo", "Apollo (comitê de compra)", "Nome e cargo das pessoas de marketing, comercial e diretoria", "Apollo.io", 30, "a chave do Apollo", "APOLLO_API_KEY"),
    ("anuncios", "Bibliotecas de anúncios", "Se a empresa começou, parou ou mudou anúncios no Google e na Meta", "Central de Transparência do Google e Biblioteca de Anúncios da Meta", 7,
     "a chave do SerpApi (e o token do Apify)", "SERPAPI_API_KEY"),
    ("classificador", "Classificador (IA)", "Lê cada notícia e decide se é um sinal, de que tipo e por que importa agora", "API do Claude", 1, "a chave da API do Claude", "ANTHROPIC_API_KEY"),
]

# De qual conector vem cada rótulo de fonte mostrado nos sinais.
FONTE_DO_ROTULO = {"Notícias": "noticias", "Vagas": "vagas", "Indeed": "vagas", "Receita Federal": "cnpj",
                   "Bibliotecas de anúncios": "anuncios"}


def ler_execucoes() -> dict:
    """Execuções reais dos coletores (radar_abm/dados/radar.db), quando o banco existe nesta máquina."""
    import sqlite3

    banco = RAIZ.parent / "radar_abm" / "dados" / "radar.db"
    if not banco.exists():
        return {}
    con = sqlite3.connect(banco)
    saida = {}
    for conector, inicio, itens, erros, detalhe in con.execute(
            "select conector, inicio, itens, erros, detalhe from execucoes order by inicio"):
        e = saida.setdefault(conector, {"execucoes": 0, "itens": 0, "erros": 0})
        e["execucoes"] += 1
        e["itens"] += itens or 0
        e.update(ultima=inicio[:16], ultimaItens=itens or 0, ultimaErros=erros or 0, ultimoDetalhe=detalhe or "")
    return saida


def custo_anuncios(exemplo: bool) -> str:
    """Uso do mês nos provedores de anúncios (tabela chamadas_provedor do radar), contra os limites gratuitos."""
    import os
    import sqlite3

    serp_lim = int(os.environ.get("RADAR_SERPAPI_LIMITE_MES", 250))
    apify_lim = float(os.environ.get("RADAR_APIFY_LIMITE_USD_MES", 5))
    serp, apify = (38, 1.2) if exemplo else (0, 0.0)
    banco = RAIZ.parent / "radar_abm" / "dados" / "radar.db"
    if not exemplo and banco.exists():
        con = sqlite3.connect(banco)
        mes = HOJE.strftime("%Y-%m")
        for prov, n, usd in con.execute("select provedor, count(*), coalesce(sum(custo_usd), 0) from chamadas_provedor "
                                        "where substr(data, 1, 7) = ? group by provedor", (mes,)):
            if prov == "serpapi":
                serp = n
            elif prov == "apify":
                apify = usd
    return f"Este mês: {serp} de {serp_lim} buscas grátis no SerpApi · US$ {apify:.2f} de US$ {apify_lim:.2f} no Apify".replace(".", ",")


def montar_fontes(execucoes: dict, sinais: list[dict], exemplo: bool) -> list[dict]:
    import os

    fontes = []
    for fid, nome, busca, onde, intervalo, requisito, chave in FONTES:
        e = execucoes.get(fid, {})
        falta = bool(chave) and not os.environ.get(chave)
        n_sinais = sum(1 for s in sinais if FONTE_DO_ROTULO.get(s["fonte"]) == fid and not s["exemplo"])
        if e.get("ultimaErros"):
            status, resumo = "erro", f"A última coleta teve {e['ultimaErros']} erro(s). {e.get('ultimoDetalhe') or ''}".strip()
        elif not e and falta:
            status, resumo = "atencao", f"Ainda não rodou: falta {requisito}."
        elif not e:
            status, resumo = "atencao", "Pronto para rodar, mas ainda não rodou nesta base."
        elif (HOJE - date.fromisoformat(e["ultima"][:10])).days > intervalo * 2:
            status, resumo = "atencao", "Está atrasado: a última coleta foi há mais tempo que o normal."
        else:
            status, resumo = "ok", "Funcionando."
        fontes.append({"id": fid, "nome": nome, "busca": busca, "onde": onde, "intervaloDias": intervalo,
                       "requisito": requisito if falta else "", "status": status, "resumo": resumo,
                       "ultimaColeta": e.get("ultima", ""), "itensUltima": e.get("ultimaItens", 0),
                       "errosUltima": e.get("ultimaErros", 0), "execucoes": e.get("execucoes", 0), "sinais": n_sinais,
                       "custo": custo_anuncios(exemplo) if fid == "anuncios" else ""})
    return fontes


EXEMPLO_EXECUCOES = {
    "cnpj": {"execucoes": 4, "itens": 40, "erros": 0, "ultima": "2026-09-22T06:00", "ultimaItens": 10, "ultimaErros": 0},
    "noticias": {"execucoes": 30, "itens": 412, "erros": 0, "ultima": "2026-09-25T06:10", "ultimaItens": 14, "ultimaErros": 0},
    "vagas": {"execucoes": 4, "itens": 38, "erros": 0, "ultima": "2026-09-25T06:20", "ultimaItens": 9, "ultimaErros": 0},
    "anuncios": {"execucoes": 2, "itens": 6, "erros": 0, "ultima": "2026-09-24T06:30", "ultimaItens": 3, "ultimaErros": 1,
                 "ultimoDetalhe": "O limite gratuito do mês do SerpApi acabou; o Google ficou de fora desta vez."},
}


def montar(linhas: list[dict], chance_a: float = 0.55, chance_c: float = 0.22, exemplo: bool = False) -> dict:
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
        estrutural = int(ln.get("estrutural") or (r.randint(70, 100) if tier == "A" else r.randint(35, 70)))
        ativacao = int(ln.get("ativacao") or r.randint(25, 85))
        # Sinais novos: cerca de 1 em 3 contas tem um sinal da última semana e meia; contas A tendem a ter mais.
        novos = []
        if raiz in REAIS:
            tipo, porque, fonte, data, url = REAIS[raiz]
            novos.append(dict(tipo=tipo, porQueAgora=porque, fonte=fonte, data=data, url=url, exemplo=False,
                              alertaEm=HOJE.isoformat()))
        if r.random() < (chance_a if tier == "A" else chance_c):
            tipo, porque, fonte = r.choice(MODELOS[fam])
            dias = r.choice([0, 0, 1, 1, 2, 3, 5, 6, 9])
            fato = HOJE - timedelta(days=dias)
            novos.append(dict(tipo=tipo, porQueAgora=porque, fonte=fonte, data=fato.isoformat(), url="", exemplo=True,
                              alertaEm=min(HOJE, fato + timedelta(days=r.choice([0, 0, 0, 1, 1, 2]))).isoformat()))
        # Histórico: fatos mais antigos (20 a 85 dias), já fora da caixa, que ainda somam um pouco no score.
        historico = []
        usados = {s["tipo"] for s in novos}
        for _ in range(r.choice([0, 1, 1, 2, 3])):
            tipo, porque, fonte = r.choice(MODELOS[fam])
            if tipo in usados:
                continue
            usados.add(tipo)
            historico.append(dict(tipo=tipo, rotulo=TIPOS[tipo][0], porQueAgora=porque, fonte=fonte,
                                  data=(HOJE - timedelta(days=r.randint(20, 85))).isoformat(), url="", exemplo=True))
        historico.sort(key=lambda h: h["data"], reverse=True)

        # Score = encaixe no ICP + momento da conta + sinais (cada um perdendo metade do valor a cada 60 dias).
        perfil, momento = round(estrutural * 0.35), round(ativacao * 0.15)
        fatos = [(TIPOS[s["tipo"]][1], date.fromisoformat(s["data"])) for s in novos + historico]

        def score_em(dia: date) -> int:
            return min(100, round(perfil + momento + sum(pontos_em(p, f, dia) for p, f in fatos)))

        score = score_em(HOJE)
        serie = [score_em(HOJE - timedelta(days=3 * (30 - i))) for i in range(31)]
        tendencia = score - score_em(HOJE - timedelta(days=14))
        composicao = [
            {"rotulo": "Encaixe no perfil ideal", "detalhe": f"Tier {tier}, {(ln.get('segmento') or '').split('·')[-1].strip().lower() or 'segmento'}", "pontos": perfil},
            {"rotulo": "Momento da conta", "detalhe": "Porte, maturidade digital e abertura para conversa", "pontos": momento},
        ]
        for s in novos + historico:
            composicao.append({"rotulo": TIPOS[s["tipo"]][0], "detalhe": s["porQueAgora"],
                               "pontos": round(pontos_em(TIPOS[s["tipo"]][1], date.fromisoformat(s["data"]), HOJE)),
                               "data": s["data"]})
        excesso = sum(c["pontos"] for c in composicao) - score  # arredondamento e teto de 100
        if excesso:
            composicao.append({"rotulo": "Ajuste", "detalhe": "Arredondamento e teto de 100 pontos", "pontos": -excesso})

        comite = []
        if ln.get("pessoa"):
            comite.append({"nome": ln["pessoa"], "cargo": ln.get("cargo") or "", "area": area_do_cargo(ln.get("cargo") or ""),
                           "papel": "decisor" if area_do_cargo(ln.get("cargo") or "") == "executivo" or "diretor" in (ln.get("cargo") or "").lower() else "influenciador",
                           "fonte": "Planilha"})

        contas.append({
            "id": conta_id, "nome": ln["empresa"], "razaoSocial": ln.get("razao") or "", "cnpj": ln["cnpj"],
            "dominio": ln["dominio"], "cidade": (ln.get("cidade") or "").title(), "uf": ln.get("uf") or "",
            "segmento": (ln.get("segmento") or "").split("·")[-1].strip(), "braco": ln.get("icp") or "", "tier": tier,
            "statusComercial": ln.get("status") or "",
            "decisor": {"nome": ln.get("pessoa") or "", "cargo": ln.get("cargo") or ""},
            "score": score, "tendencia": tendencia, "serie": serie, "composicao": composicao,
            "comite": comite, "historico": historico,
        })
        for i, s in enumerate(novos):
            rotulo, peso, membro = TIPOS[s["tipo"]]
            d = ln.get("pessoa") or ""
            abordar = ({"nome": d, "cargo": ln.get("cargo") or "", "papel": membro} if d and membro == "decisor"
                       else {"nome": "", "cargo": "Liderança de marketing" if membro == "influenciador" else "Diretoria executiva",
                             "papel": membro})
            sinais.append({"id": f"{conta_id}-{s['tipo']}-{i}", "contaId": conta_id, "tipo": s["tipo"], "rotulo": rotulo,
                           "peso": peso, "porQueAgora": s["porQueAgora"], "fonte": s["fonte"], "data": s["data"],
                           "alertaEm": s["alertaEm"], "url": s["url"], "exemplo": s["exemplo"], "abordar": abordar,
                           "pontos": round(pontos_em(peso, date.fromisoformat(s["data"]), HOJE))})
    sinais.sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    execucoes = EXEMPLO_EXECUCOES if exemplo else ler_execucoes()
    return {"geradoEm": HOJE.isoformat(), "contas": contas, "sinais": sinais,
            "fontes": montar_fontes(execucoes, sinais, exemplo)}


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
                      "cargo": d.get("cargo_p1"), "estrutural": d.get("score_estrutural"), "ativacao": d.get("score_ativacao")})
    return saida


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] != "--exemplo":
        linhas, destino = ler_planilha(sys.argv[1]), RAIZ / "data" / "contas.local.json"
    else:
        campos = ["id", "empresa", "razao", "cnpj", "dominio", "cidade", "uf", "segmento", "icp", "tier", "status", "pessoa", "cargo"]
        linhas, destino = [dict(zip(campos, e)) for e in EXEMPLO], RAIZ / "data" / "contas.exemplo.json"
    dados = montar(linhas) if destino.name == "contas.local.json" else montar(linhas, 0.95, 0.6, exemplo=True)
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{destino.name}: {len(dados['contas'])} contas, {len(dados['sinais'])} sinais")


if __name__ == "__main__":
    main()
