import os
import uuid

import psycopg
import pytest

from velora_radar import db, snov

BASE = os.environ.get("RADAR_TEST_ADMIN_URL", "postgresql://postgres@/postgres?host=/tmp&port=5433")
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture
def conn():
    nome = f"radar_teste_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(BASE, autocommit=True) as admin:
        admin.execute(f"create database {nome}")
    c = db.conectar(BASE.replace("/postgres?", f"/{nome}?"))
    db.migrar(c)
    yield c
    c.close()
    with psycopg.connect(BASE, autocommit=True) as admin:
        admin.execute(f"drop database {nome} with (force)")


def caminho(nome: str) -> str:
    return os.path.join(FIXTURES, nome)


def test_cabecalho_tolerante_e_colunas_nao_mapeadas(tmp_path):
    arq = tmp_path / "a.csv"
    arq.write_text(
        "Full Name,Job Title,Company,Company Url,Email Address,Twitter Handle\n"
        "Zeca Pires,Head de Suprimentos,Zeta Log,zetalog.com.br,zeca@zetalog.com.br,@zecap\n",
        encoding="utf-8",
    )
    linhas, nao_mapeadas = snov.ler_csv(arq)
    assert linhas[0]["nome"] == "Zeca Pires"
    assert linhas[0]["empresa"] == "Zeta Log"
    assert linhas[0]["site"] == "zetalog.com.br"
    assert nao_mapeadas == ["Twitter Handle"]


def test_cabecalho_em_portugues_junta_setor_e_nicho(tmp_path):
    arq = tmp_path / "a.csv"
    arq.write_text(
        "\ufeffempresa,nome,cargo,email,linkedin,setor,nicho\n"
        "Zeta Log,Zeca Pires,Diretor Comercial,zeca@zetalog.com.br,https://www.linkedin.com/in/zecap,"
        "Serviços B2B,Recrutamento / Search\n",
        encoding="utf-8",
    )
    linhas, nao_mapeadas = snov.ler_csv(arq)
    assert linhas[0]["nome"] == "Zeca Pires"
    assert linhas[0]["empresa"] == "Zeta Log"
    assert linhas[0]["cargo"] == "Diretor Comercial"
    assert linhas[0]["setor"] == "Serviços B2B · Recrutamento / Search"
    assert nao_mapeadas == []


def test_nome_por_primeiro_e_ultimo_nome(tmp_path):
    arq = tmp_path / "a.csv"
    arq.write_text("First Name,Last Name,Company\nAna,Souza,Alfa\n", encoding="utf-8")
    linhas, _ = snov.ler_csv(arq)
    assert linhas[0]["nome"] == "Ana Souza"


def test_chave_da_conta_prioriza_dominio_do_site_depois_email_depois_nome():
    com_site = {"site": "https://www.alfa.com.br", "email": "x@gmail.com", "empresa": "Alfa"}
    assert snov.chave_da_conta(com_site) == ("dominio", "alfa.com.br")

    so_email = {"site": "", "email": "ana@beta.com.br", "empresa": "Beta"}
    assert snov.chave_da_conta(so_email) == ("dominio", "beta.com.br")

    email_generico = {"site": "", "email": "ana@gmail.com", "empresa": "Gama Ltda"}
    assert snov.chave_da_conta(email_generico) == ("nome", "gama")


def test_grupo_sem_dominio_e_com_dominio_viram_uma_so_conta(conn):
    """Uma linha sem site (e-mail genérico) e outra com site, da mesma empresa, não podem duplicar a conta."""
    rel = snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    assert rel.contas_criadas == 5
    assert rel.contas_mescladas == 1  # Beta Consultoria: Fabio (sem site) + Gustavo/Helena (com site)
    contas = conn.execute("select nome from conta where nome_normalizado = 'beta consultoria'").fetchall()
    assert len(contas) == 1


def test_dedupe_pessoa_por_linkedin_normalizado(conn):
    rel = snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    # a 13a linha do fixture é a Ana Souza duplicada (linkedin com www. e sem barra final, mesma pessoa).
    assert rel.pessoas_duplicadas == 1
    anas = conn.execute("select count(*) as n from pessoa where nome = 'Ana Souza'").fetchone()["n"]
    assert anas == 1


def test_classificar_cargo_papeis():
    assert snov.classificar_cargo("CEO").papel_icp == "pagador"
    assert snov.classificar_cargo("Fundadora").papel_icp == "pagador"
    assert snov.classificar_cargo("Diretor Financeiro").papel_icp == "pagador"
    assert snov.classificar_cargo("Gerente de Marketing").papel_icp == "dono_problema"
    assert snov.classificar_cargo("Head Global de Vendas").papel_icp == "dono_problema"
    assert snov.classificar_cargo("Diretor de TI").papel_icp == "guardiao"
    assert snov.classificar_cargo("Head de Compras").papel_icp == "guardiao"
    assert snov.classificar_cargo("Analista Pleno").papel_icp == "influenciador"
    assert snov.classificar_cargo("").papel_icp is None


def test_classificar_cargo_siglas_so_como_palavra_inteira():
    # "cto" dentro de "director", "coo" dentro de "coordenador"/"cooperativa", "presidente" dentro de "vice-presidente"
    assert snov.classificar_cargo("Commercial Director").papel_icp == "dono_problema"
    assert snov.classificar_cargo("Business Development Director").papel_icp == "dono_problema"
    assert snov.classificar_cargo("Coordenador Comercial").nivel is None
    assert snov.classificar_cargo("Gerente de Cooperativa").nivel == "gerente_head"
    assert snov.classificar_cargo("Vice-Presidente Comercial").nivel == "vp_diretor"
    assert snov.classificar_cargo("Vice-Presidente Comercial").papel_icp == "dono_problema"


def test_classificar_cargo_ingles_e_socios():
    for cargo in ("Chief Executive Officer", "co-founder - chief executive officer", "Owner", "President", "Sócio",
                  "Sócio-administrador", "Partner", "Chief Revenue Officer", "Chieff Growth Officer", "CCO",
                  "Diretor Executivo", "Executive Director", "Diretor", "DIRETOR", "Diretora / Sócia-administradora"):
        assert snov.classificar_cargo(cargo).papel_icp == "pagador", cargo
    assert snov.classificar_cargo("Chief Technology Officer").papel_icp == "guardiao"
    assert snov.classificar_cargo("Data Protection Officer (DPO)").papel_icp == "guardiao"
    assert snov.classificar_cargo("Head of Marketing").papel_icp == "dono_problema"
    assert snov.classificar_cargo("Diretor de RH").papel_icp == "influenciador"


def test_mapear_email_status():
    assert snov.mapear_email_status("valid") == "verificado"
    assert snov.mapear_email_status("catch-all") == "provavel"
    assert snov.mapear_email_status("unknown") == "provavel"
    assert snov.mapear_email_status("not valid") == "invalido"
    assert snov.mapear_email_status("") == "desconhecido"


def test_local_br_sigla_nome_extenso_e_cidade():
    from velora_radar.local_br import interpretar_local

    assert interpretar_local("Sao Paulo, SP, Brazil").uf == "SP"
    assert interpretar_local("State of São Paulo").uf == "SP"
    assert interpretar_local("Rio Grande do Sul").uf == "RS"
    assert interpretar_local("Joinville, SC").cidade == "Joinville"
    assert interpretar_local("Caxias do Sul").uf == "RS"
    assert interpretar_local("Londrina").uf == "PR"
    assert interpretar_local("Campinas").uf == "SP"
    assert interpretar_local("").pais == "desconhecido"
    assert interpretar_local("New York, NY, United States").pais not in ("Brasil", "desconhecido")


def test_fora_do_brasil_fica_descartada_sem_apagar(conn):
    rel = snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    assert rel.contas_fora_do_brasil == 1
    epsilon = conn.execute("select etapa, motivo_descarte from conta where nome_normalizado = 'epsilon corp'").fetchone()
    assert epsilon["etapa"] == "descartada" and epsilon["motivo_descarte"] == "fora do Brasil"


def test_icp_fit_e_cobertura(conn):
    snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    alfa = conn.execute("select fit_icp, cobertura_comite from conta where nome_normalizado = 'alfa tecnologia'").fetchone()
    assert alfa["fit_icp"] is True and alfa["cobertura_comite"] == 3  # pagador + dono_problema + guardiao

    delta = conn.execute("select fit_icp from conta where nome_normalizado = 'delta saude'").fetchone()
    assert delta["fit_icp"] is False  # UF fora do recorte e setor "Saude" excluído pela rubrica


def test_conflito_divergencia_de_campo_nao_sobrescreve(conn):
    snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    conflitos = conn.execute("select tipo, detalhe from importacao_conflito").fetchall()
    assert any(c["tipo"] == "campo_divergente" and "cidade" in c["detalhe"] for c in conflitos)


def test_relatorio_gravado_no_banco(conn):
    snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    r = conn.execute("select importacao, arquivo, resumo from importacao_relatorio").fetchone()
    assert r["importacao"] == "snov"
    assert r["resumo"]["linhas"] == 13


def test_reimportar_o_mesmo_arquivo_nao_duplica(conn):
    snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    rel2 = snov.importar_snov(conn, caminho("snov_exemplo.csv"))
    assert rel2.pessoas_criadas == 0 and rel2.contas_criadas == 0
    total_pessoas = conn.execute("select count(*) as n from pessoa").fetchone()["n"]
    assert total_pessoas == 12  # 13 linhas - 1 duplicada de propósito no fixture


def test_planilha_enriquecida_curadoria_validacao_e_fit_pela_regiao_do_sourcing(conn, tmp_path):
    arq = tmp_path / "r13.csv"
    arq.write_text(
        "empresa,dominio,site,tier,prioridade,setor,nicho,criterio_icp,regiao_sourcing,fonte_conta,nome,cargo,email,validacao_contato,linkedin\n"
        "Alfa,alfa.com.br,https://alfa.com.br,A1,P0,Tecnologia,Software / TI,SaaS B2B,"
        "Base anterior — região validada no sourcing original,Base A1/A2 validada,Ana Lima,CEO,ana@alfa.com.br,Alta,linkedin.com/in/ana-lima\n"
        "Beta,beta.com.br,https://beta.com.br,A2,P1,Indústria,Industrial / Automação,Industrial,"
        "Brasil / operação relevante; validar autonomia quando marcado,Clay — Work Email,Bruno Reis,Diretor Comercial,bruno@beta.com.br,"
        "Média — validar deliverability,linkedin.com/in/bruno-reis\n",
        encoding="utf-8",
    )
    rel = snov.importar_snov(conn, arq)
    assert rel.colunas_nao_mapeadas == []
    alfa = conn.execute("select * from conta where dominio = 'alfa.com.br'").fetchone()
    beta = conn.execute("select * from conta where dominio = 'beta.com.br'").fetchone()
    assert (alfa["prioridade"], alfa["lote"], alfa["regiao_validada"], alfa["fit_icp"]) == ("P0", "A1", True, True)
    assert (beta["prioridade"], beta["regiao_validada"], beta["fit_icp"]) == ("P1", False, None)  # "Brasil" não basta
    status = dict(conn.execute("select nome, email_status from pessoa").fetchall() and
                  [(r["nome"], r["email_status"]) for r in conn.execute("select nome, email_status from pessoa")])
    assert status == {"Ana Lima": "verificado", "Bruno Reis": "provavel"}
    assert rel.distribuicao_prioridade == {"P0": 1, "P1": 1}
    assert rel.contas_fit_por_regiao_sourcing == 1
