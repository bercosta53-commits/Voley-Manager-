from datetime import date, timedelta

import pytest

from abm import aliases, importador
from abm.conectores.base import selecionar_contas
from abm.conectores.http import ClienteLocal
from abm.conectores.vagas import ConectorVagas, grupo_da_vaga, ler_arquivo, ler_data, ler_pagina_gupy
from abm.taxonomia import carregar

from conftest import FIX, RAIZ

TAX = carregar(RAIZ / "sinais.yaml")
GUPY = FIX / "gupy"
INDEED = FIX / "vagas" / "indeed_2026-09-25.csv"
HOJE = date(2026, 9, 25)


def preparar(conn, tmp_path):
    arq = tmp_path / "contas.csv"
    arq.write_text("id_conta,empresa,icp,site\n"
                   "T-001,Logcomex,Tecnologia B2B,\n"
                   "T-002,VIASOFT,Tecnologia B2B,\n"
                   "F-003,Junto Seguros,Financeiro regional,juntoseguros.com\n"
                   "F-002,Cresol Confederação,Financeiro regional,\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    aliases.gerar(conn)


def rodar(conn, pasta=GUPY, hoje=HOJE, arquivo=None, **kw):
    tela = []
    c = ConectorVagas(conn, http=ClienteLocal(str(pasta)), hoje=hoje, arquivo=arquivo, taxonomia=TAX, saida=tela.append, **kw)
    ex = c.executar(selecionar_contas(conn))
    return ex, "\n".join(tela)


@pytest.mark.parametrize("titulo,grupo", [
    ("Head de Growth", "vaga_lideranca_receita"),
    ("Diretor Comercial", "vaga_lideranca_receita"),
    ("Gerente de Marketing Jurídico", "vaga_lideranca_receita"),
    ("Especialista em Marketing | Conteúdo", "vaga_marketing_growth"),
    ("Analista de CRM Pleno", "vaga_marketing_growth"),
    ("SDR (Sales Development Representative)", "vaga_comercial"),
    ("Analista Comercial Pleno", "vaga_comercial"),
    ("Vaga Banco de Talentos - Marketing", None),
    ("Estágio em Marketing", None),
    ("Analista de Customer Success SR", None),
    ("Gerente de Crédito", None),
    ("Analista de Dados PL - Vaga afirmativa para pessoa PcD", None),
])
def test_grupos_de_vaga(titulo, grupo):
    assert grupo_da_vaga(titulo, TAX.vagas) == grupo


def test_datas_e_leitores_de_pagina():
    assert ler_data("June 20, 2026") == "2026-06-20" and ler_data("15/09/2026") == "2026-09-15"
    assert ler_data("2026-09-16T12:00:00.000Z") == "2026-09-16" and ler_data("ontem") is None
    links = ler_pagina_gupy((GUPY / "gupy_logcomex.html").read_text(encoding="utf-8"), "https://logcomex.gupy.io/")
    assert links["empresa"] == "Logcomex.ai" and len(links["vagas"]) == 10
    mkt = next(v for v in links["vagas"] if v["id"] == "12519505")
    assert (mkt["titulo"], mkt["local"], mkt["url"]) == (
        "Especialista em Marketing | Conteúdo", "Curitiba - PR e Híbrido", "https://logcomex.gupy.io/jobs/12519505")
    dados = ler_pagina_gupy((GUPY / "gupy_viasoft.html").read_text(encoding="utf-8"), "https://viasoft.gupy.io/")
    assert dados["empresa"] == "VIASOFT" and len(dados["vagas"]) == 5
    assert dados["vagas"][0]["local"] == "Pato Branco - PR" and dados["vagas"][0]["data"] == "2026-09-16"


def test_arquivo_do_indeed_confere_a_empresa(conn, tmp_path):
    preparar(conn, tmp_path)
    c = ConectorVagas(conn, arquivo=ler_arquivo(INDEED), taxonomia=TAX, saida=lambda _: None)
    assert len(c.importadas["T-001"]) == 3 and all(v["confianca"] == 0.9 for v in c.importadas["T-001"])
    assert [v["confianca"] for v in c.importadas["T-002"]] == [0.7, 0.7]  # reconhecida só pelo nome
    motivos = {v["empresa"]: v["motivo"] for v in c.sem_conta}
    assert motivos["Banco Bradesco"] == "empresa 'Banco Bradesco' não é a conta F-003"
    assert motivos["Sicredi"] == "nenhuma conta com esse nome"


def test_primeira_coleta_gupy_mais_indeed(conn, tmp_path):
    preparar(conn, tmp_path)
    ex, tela = rodar(conn, arquivo=ler_arquivo(INDEED))
    sinais = {(r["conta_id"], r["tipo"]): dict(r) for r in conn.execute("select * from sinais")}
    assert set(sinais) == {("T-001", "vaga_marketing_growth"), ("T-001", "vaga_comercial"), ("F-003", "vaga_comercial")}
    mkt = sinais[("T-001", "vaga_marketing_growth")]
    assert (mkt["status"], mkt["confianca"], mkt["peso"], mkt["data_fato"]) == ("alerta", 0.9, 7, "2026-09-25")
    assert "Especialista em Marketing | Conteúdo" in mkt["evidencia_trecho"] and "[Indeed]" in mkt["evidencia_trecho"]
    assert mkt["por_que_agora"].startswith("Está montando o time de marketing/growth")
    # O SDR está na Gupy e no Indeed: uma vaga só.
    assert conn.execute("select count(*) from itens_brutos where titulo like 'SDR%'").fetchone()[0] == 1
    paginas = dict(conn.execute("select id, vagas_url from contas").fetchall())
    assert paginas == {"T-001": "https://logcomex.gupy.io/", "T-002": "https://viasoft.gupy.io/",
                       "F-003": "https://juntoseguros.gupy.io/", "F-002": None}
    assert "fora dos grupos: 8" in tela  # Junto: crédito, atuária, finanças...


def test_segunda_coleta_nao_repete_e_vaga_nova_entra_no_mesmo_evento(conn, tmp_path):
    preparar(conn, tmp_path)
    rodar(conn)
    ex, tela = rodar(conn, hoje=HOJE + timedelta(days=7))
    assert ex.itens == 0 and "já estavam abertas na coleta anterior: 2" in tela
    # Cresol não usa Gupy: só é procurada de novo depois de 30 dias.
    assert "F-002 Cresol Confederação: pulada (sem página de vagas achada (procurada há menos de 30 dias))" in tela

    pasta = tmp_path / "gupy2"
    pasta.mkdir()
    for f in GUPY.glob("*.html"):
        (pasta / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    pagina = (pasta / "gupy_logcomex.html").read_text(encoding="utf-8").replace(
        "</ul>", '<li><a href="/jobs/13000001"><div><h3>Analista de Growth Pleno</h3><div><span>Curitiba - PR</span></div></div></a></li></ul>')
    (pasta / "gupy_logcomex.html").write_text(pagina, encoding="utf-8")
    ex, _ = rodar(conn, pasta=pasta, hoje=HOJE + timedelta(days=14))
    assert ex.itens == 1
    assert conn.execute("select count(*) from sinais where conta_id = 'T-001' and tipo = 'vaga_marketing_growth'").fetchone()[0] == 1
    eventos = {r[0] for r in conn.execute("select evento_id from itens_brutos where conta_id = 'T-001' and titulo like '%rowth%' or titulo like '%Marketing |%'")}
    assert len(eventos) == 1  # a vaga nova entrou no evento do sinal que já existia


def test_pagina_de_outra_empresa_e_ignorada(conn, tmp_path):
    preparar(conn, tmp_path)
    pasta = tmp_path / "gupy"
    pasta.mkdir()
    (pasta / "gupy_juntoseguros.html").write_text("<html><head><title>Junto Imóveis</title></head><body></body></html>", encoding="utf-8")
    ex, tela = rodar(conn, pasta=pasta)
    assert "https://juntoseguros.gupy.io/ é de 'Junto Imóveis', não desta conta: ignorada" in tela
    assert conn.execute("select vagas_url from contas where id = 'F-003'").fetchone()[0] is None


def test_dry_run_e_regras_editaveis(conn, tmp_path):
    preparar(conn, tmp_path)
    tela = []
    ConectorVagas(conn, http=ClienteLocal(str(GUPY)), hoje=HOJE, taxonomia=TAX, dry_run=True, saida=tela.append).executar(
        selecionar_contas(conn))
    for tabela in ("sinais", "itens_brutos", "snapshots"):
        assert conn.execute(f"select count(*) from {tabela}").fetchone()[0] == 0
    assert conn.execute("select count(*) from contas where vagas_url is not null").fetchone()[0] == 0
    # Tirar "comercial" das regras no sinais.yaml: o SDR deixa de contar.
    outro = tmp_path / "sinais.yaml"
    outro.write_text((RAIZ / "sinais.yaml").read_text(encoding="utf-8").replace(
        "  comercial: [sdr, bdr,", "  comercial: [bdr,"), encoding="utf-8")
    assert grupo_da_vaga("SDR (Sales Development Representative)", carregar(outro).vagas) is None


# ------------------------------------------------------------------ outras plataformas

PLAT = FIX / "plataformas"


def test_reconhece_as_plataformas_pelo_endereco():
    from abm.conectores.plataformas import reconhecer

    casos = {
        "https://logcomex.gupy.io/jobs/123": ("gupy", "logcomex"),
        "https://boards.greenhouse.io/alfatech": ("greenhouse", "alfatech"),
        "https://job-boards.greenhouse.io/alfatech/jobs/7001": ("greenhouse", "alfatech"),
        "https://jobs.lever.co/betapay": ("lever", "betapay"),
        "https://jobs.ashbyhq.com/gamadata": ("ashby", "gamadata"),
        "https://deltaseguros.vagas.solides.com.br/": ("solides", "deltaseguros"),
    }
    for url, (plat, x) in casos.items():
        p, ident = reconhecer(url)
        assert (p.id, ident) == (plat, x), url
    assert reconhecer("https://www.glassdoor.com.br/Vagas/alfa") is None
    assert reconhecer("https://alfatech.com.br/carreiras") is None


def test_leitores_de_cada_plataforma():
    from abm.conectores.plataformas import PLATAFORMAS

    gh = PLATAFORMAS["greenhouse"].ler((PLAT / "greenhouse_alfatech.json").read_text(encoding="utf-8"), "")
    assert [(v["titulo"], v["local"], v["data"]) for v in gh["vagas"]][0] == ("Head of Growth", "São Paulo, Brazil", "2026-09-18")
    lv = PLATAFORMAS["lever"].ler((PLAT / "lever_betapay.json").read_text(encoding="utf-8"), "")
    assert lv["vagas"][0]["titulo"] == "Coordenador(a) de Marketing de Performance" and lv["vagas"][0]["data"] == "2025-09-19"
    ab = PLATAFORMAS["ashby"].ler((PLAT / "ashby_gamadata.json").read_text(encoding="utf-8"), "")
    assert [v["titulo"] for v in ab["vagas"]] == ["RevOps Analyst"]  # vaga não listada fica de fora
    so = PLATAFORMAS["solides"].ler((PLAT / "solides_deltaseguros.html").read_text(encoding="utf-8"),
                                    "https://deltaseguros.vagas.solides.com.br/")
    assert so["empresa"] == "Delta Seguros"
    assert [(v["titulo"], v["url"]) for v in so["vagas"]] == [
        ("Analista de Marketing Pleno", "https://deltaseguros.vagas.solides.com.br/vaga/901300"),
        ("Assistente Administrativo", "https://deltaseguros.vagas.solides.com.br/vaga/901301")]


def test_coleta_em_varias_plataformas_com_descoberta_conferida(conn, tmp_path):
    import manager

    arq = tmp_path / "contas.csv"
    arq.write_text("id_conta,empresa,icp,site\nT-10,Alfa Tech,Tecnologia B2B,alfatech.com.br\n"
                   "T-11,Beta Pay,Tecnologia B2B,\nT-12,Gama Data,Tecnologia B2B,\n"
                   "F-10,Delta Seguros,Financeiro regional,\nT-13,Alfa,Tecnologia B2B,\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    aliases.gerar(conn)
    conn.execute("update contas set vagas_url = 'https://jobs.lever.co/betapay' where id = 'T-11'")
    conn.execute("update contas set vagas_url = 'https://jobs.ashbyhq.com/gamadata' where id = 'T-12'")
    conn.execute("update contas set vagas_url = 'https://deltaseguros.vagas.solides.com.br/' where id = 'F-10'")
    conn.commit()
    ex, tela = rodar(conn, pasta=PLAT)
    sinais = {(r["conta_id"], r["tipo"]) for r in conn.execute("select conta_id, tipo from sinais")}
    # "Coordenador(a) de Marketing" é liderança pelas regras do sinais.yaml (coordenador está em lideranca).
    assert sinais == {("T-10", "vaga_lideranca_receita"), ("T-11", "vaga_lideranca_receita"), ("T-11", "vaga_comercial"),
                      ("T-12", "vaga_marketing_growth"), ("F-10", "vaga_marketing_growth")}
    # Alfa Tech foi descoberta no Greenhouse e conferida pelo nome do quadro de vagas.
    assert conn.execute("select vagas_url from contas where id = 'T-10'").fetchone()[0] == "https://boards.greenhouse.io/alfatech"
    # "alfa" no Greenhouse é de outra empresa (Alfa Turismo): ignorada.
    assert "https://boards.greenhouse.io/alfa é de 'Alfa Turismo', não desta conta: ignorada" in tela
    fontes = {r[0] for r in conn.execute("select veiculo from itens_brutos")}
    assert fontes == {"Greenhouse", "Lever", "Ashby", "Sólides"}


def test_paginas_em_lote_pelo_manager(tmp_path, monkeypatch, capsys):
    import manager

    monkeypatch.setenv("RADAR_DB", str(tmp_path / "radar.db"))
    monkeypatch.setenv("RADAR_LOGS", str(tmp_path / "logs"))
    lista = tmp_path / "lista.csv"
    lista.write_text("id_conta,empresa\nT-1,Alfa\nT-2,Beta\nT-3,Gama\n", encoding="utf-8")
    manager.main(["importar", str(lista)])
    paginas = tmp_path / "paginas.csv"
    paginas.write_text("id_conta,url\nT-1,https://jobs.lever.co/alfa\nT-2,https://www.glassdoor.com.br/Vagas/beta\n"
                       "T-3,-\nT-9,https://jobs.lever.co/x\n", encoding="utf-8")
    manager.main(["vagas", "paginas", str(paginas)])
    saida = capsys.readouterr().out
    assert "T-1: Lever https://jobs.lever.co/alfa" in saida and "T-3: página de vagas desligada" in saida
    assert "T-2: https://www.glassdoor.com.br/Vagas/beta não é de uma plataforma conhecida" in saida
    assert "T-9: conta não encontrada" in saida
