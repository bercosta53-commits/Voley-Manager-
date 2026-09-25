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
    links = ler_pagina_gupy((GUPY / "logcomex.html").read_text(encoding="utf-8"), "https://logcomex.gupy.io/")
    assert links["empresa"] == "Logcomex.ai" and len(links["vagas"]) == 10
    mkt = next(v for v in links["vagas"] if v["id"] == "12519505")
    assert (mkt["titulo"], mkt["local"], mkt["url"]) == (
        "Especialista em Marketing | Conteúdo", "Curitiba - PR e Híbrido", "https://logcomex.gupy.io/jobs/12519505")
    dados = ler_pagina_gupy((GUPY / "viasoft.html").read_text(encoding="utf-8"), "https://viasoft.gupy.io/")
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
    slugs = dict(conn.execute("select id, gupy_slug from contas").fetchall())
    assert slugs == {"T-001": "logcomex", "T-002": "viasoft", "F-003": "juntoseguros", "F-002": None}
    assert "fora dos grupos: 8" in tela  # Junto: crédito, atuária, finanças...


def test_segunda_coleta_nao_repete_e_vaga_nova_entra_no_mesmo_evento(conn, tmp_path):
    preparar(conn, tmp_path)
    rodar(conn)
    ex, tela = rodar(conn, hoje=HOJE + timedelta(days=7))
    assert ex.itens == 0 and "já estavam abertas na coleta anterior: 2" in tela
    # Cresol não usa Gupy: só é procurada de novo depois de 30 dias.
    assert "F-002 Cresol Confederação: pulada (não usa Gupy (procurado há menos de 30 dias))" in tela

    pasta = tmp_path / "gupy2"
    pasta.mkdir()
    for f in GUPY.glob("*.html"):
        (pasta / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    pagina = (pasta / "logcomex.html").read_text(encoding="utf-8").replace(
        "</ul>", '<li><a href="/jobs/13000001"><div><h3>Analista de Growth Pleno</h3><div><span>Curitiba - PR</span></div></div></a></li></ul>')
    (pasta / "logcomex.html").write_text(pagina, encoding="utf-8")
    ex, _ = rodar(conn, pasta=pasta, hoje=HOJE + timedelta(days=14))
    assert ex.itens == 1
    assert conn.execute("select count(*) from sinais where conta_id = 'T-001' and tipo = 'vaga_marketing_growth'").fetchone()[0] == 1
    eventos = {r[0] for r in conn.execute("select evento_id from itens_brutos where conta_id = 'T-001' and titulo like '%rowth%' or titulo like '%Marketing |%'")}
    assert len(eventos) == 1  # a vaga nova entrou no evento do sinal que já existia


def test_pagina_de_outra_empresa_e_ignorada(conn, tmp_path):
    preparar(conn, tmp_path)
    pasta = tmp_path / "gupy"
    pasta.mkdir()
    (pasta / "juntoseguros.html").write_text("<html><head><title>Junto Imóveis</title></head><body></body></html>", encoding="utf-8")
    ex, tela = rodar(conn, pasta=pasta)
    assert "juntoseguros.gupy.io é de 'Junto Imóveis', não desta conta: ignorada" in tela
    assert conn.execute("select gupy_slug from contas where id = 'F-003'").fetchone()[0] is None


def test_dry_run_e_regras_editaveis(conn, tmp_path):
    preparar(conn, tmp_path)
    tela = []
    ConectorVagas(conn, http=ClienteLocal(str(GUPY)), hoje=HOJE, taxonomia=TAX, dry_run=True, saida=tela.append).executar(
        selecionar_contas(conn))
    for tabela in ("sinais", "itens_brutos", "snapshots"):
        assert conn.execute(f"select count(*) from {tabela}").fetchone()[0] == 0
    assert conn.execute("select count(*) from contas where gupy_slug is not null").fetchone()[0] == 0
    # Tirar "comercial" das regras no sinais.yaml: o SDR deixa de contar.
    outro = tmp_path / "sinais.yaml"
    outro.write_text((RAIZ / "sinais.yaml").read_text(encoding="utf-8").replace(
        "  comercial: [sdr, bdr,", "  comercial: [bdr,"), encoding="utf-8")
    assert grupo_da_vaga("SDR (Sales Development Representative)", carregar(outro).vagas) is None
