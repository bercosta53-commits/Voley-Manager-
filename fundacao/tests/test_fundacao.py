import os
import uuid

import psycopg
import pytest

from velora_radar import db, dominios, importar, rubrica, visao
from velora_radar.identidade import (
    cnpj_normalizado,
    cnpj_valido,
    dominio_generico,
    normalizar_dominio,
    normalizar_nome,
)

BASE = os.environ.get("RADAR_TEST_ADMIN_URL", "postgresql://postgres@/postgres?host=/tmp&port=5433")
CNPJ_ALFA = "11.222.333/0001-81"
CNPJ_ALFA_FILIAL = "11222333000262"


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


def linhas(*dados):
    cab = dados[0]
    return [dict(zip(cab, l)) for l in dados[1:]]


def test_identidade():
    assert cnpj_valido(CNPJ_ALFA) and not cnpj_valido("11222333000182") and not cnpj_valido("11111111111111")
    assert cnpj_normalizado("1222333000140") is None or len(cnpj_normalizado("1222333000140")) == 14
    assert cnpj_normalizado("11.222.333/0001-81") == "11222333000181"
    assert normalizar_dominio("https://www.blog.Alfa.com.br/contato?x=1") == "alfa.com.br"
    assert normalizar_dominio("ana@mattosfilho.com.br") == "mattosfilho.com.br"
    assert normalizar_dominio("http://sicredi.coop.br") == "sicredi.coop.br"
    assert normalizar_dominio("app.gama.io:8080") == "gama.io"
    assert normalizar_dominio("sem dominio") is None
    assert normalizar_dominio("com.br") is None
    assert dominio_generico(normalizar_dominio("fulano@gmail.com"))
    assert normalizar_nome("Mattos Filho, Veiga Filho, Marrey Jr. e Quiroga Advogados") == "mattos filho veiga filho marrey jr e quiroga advogados"
    assert normalizar_nome("Alfa Tecnologia LTDA.") == "alfa tecnologia"
    assert normalizar_nome("Beta S/A") == normalizar_nome("Beta S.A.") == "beta"


def test_migracao_idempotente(conn):
    assert db.migrar(conn) == []
    rid = rubrica.garantir_inicial(conn)
    assert rubrica.garantir_inicial(conn) == rid
    assert rubrica.ativa(conn)["pesos"]["validade_dias"] == 30


def test_importar_deduplica_por_raiz_dominio_e_nome(conn):
    rel = importar.importar(
        conn,
        linhas(
            ["empresa", "cnpj", "site", "uf", "abc", "decisor", "cargo", "email"],
            ["Alfa Advogados", CNPJ_ALFA, "www.alfa.com.br", "SP", "A", "Ana Souza", "Sócia", "ana@alfa.com.br"],
            ["Alfa Advogados - Filial PR", CNPJ_ALFA_FILIAL, "", "PR", "", "", "", ""],
            ["Beta Seguros", "", "https://beta.com.br", "RS", "B", "", "", ""],
            ["Beta Seguros S.A.", "", "", "RS", "", "Bruno", "Diretor", "bruno@gmail.com"],
            ["Gama Tech", "123", "", "SC", "X", "", "", ""],
            ["", "", "", "", "", "", "", ""],
        ),
    )
    assert (rel.novas, rel.atualizadas) == (3, 2)
    assert rel.estabelecimentos == 2
    assert rel.avisos == ["Linha 6: classe ABC desconhecida (X)"]
    contas = {r["nome"]: r for r in conn.execute("select * from conta")}
    assert set(contas) == {"Alfa Advogados - Filial PR", "Beta Seguros S.A.", "Gama Tech"}
    alfa = contas["Alfa Advogados - Filial PR"]
    assert (alfa["cnpj_raiz"], alfa["dominio"], alfa["abc"]) == ("11222333", "alfa.com.br", "A")
    assert conn.execute("select count(*) as n from estabelecimento where conta_id = %s", (alfa["id"],)).fetchone()["n"] == 2
    beta = contas["Beta Seguros S.A."]
    assert beta["dominio"] == "beta.com.br", "e-mail gmail não vira domínio"
    abertos = {(r["tipo"]) for r in conn.execute("select tipo from buraco where aberto")}
    assert abertos == {"sem_cnpj", "sem_dominio", "cnpj_invalido", "linha_vazia"}
    # O e-mail gmail abriu buraco, mas a conta já tinha domínio da outra linha: fecha sozinho.
    assert conn.execute("select aberto from buraco where tipo = 'dominio_generico'").fetchone()["aberto"] is False
    pessoas = conn.execute("select nome, papel_comite from pessoa order by nome").fetchall()
    assert [(p["nome"], p["papel_comite"]) for p in pessoas] == [("Ana Souza", "decisor"), ("Bruno", "decisor")]


def test_conflito_de_dominio_entre_cnpjs_diferentes(conn):
    importar.importar(
        conn,
        linhas(
            ["empresa", "cnpj", "site"],
            ["Alfa", CNPJ_ALFA, "alfa.com.br"],
            ["Alfa Holding", "33.000.167/0001-01", "alfa.com.br"],
        ),
    )
    holding = conn.execute("select * from conta where nome = 'Alfa Holding'").fetchone()
    assert holding["dominio"] is None
    b = conn.execute("select * from buraco where conta_id = %s and tipo = 'conflito_cnpj_dominio'", (holding["id"],)).fetchone()
    assert "alfa.com.br" in b["detalhe"]


def test_modo_dominios_zera_buracos_e_mescla_duplicata(conn):
    importar.importar(
        conn,
        linhas(
            ["empresa", "cnpj", "site", "abc"],
            ["Alfa Advogados", CNPJ_ALFA, "", "A"],
            ["Escritório Alfa", "", "", "B"],
            ["Beta Seguros", "", "", "C"],
        ),
    )
    pend = dominios.pendencias(conn)
    assert [p["nome"] for p in pend] == ["Alfa Advogados", "Escritório Alfa", "Beta Seguros"]
    assert pend[0]["falta"] == ["dominio"] and pend[1]["falta"] == ["cnpj", "dominio"]
    ids = {p["nome"]: p["conta_id"] for p in pend}
    res = dominios.aplicar(
        conn,
        [
            {"conta_id": ids["Alfa Advogados"], "dominio": "https://alfa.adv.br", "fonte": "Apollo"},
            # O CNPJ revela que "Escritório Alfa" é a mesma empresa: vira uma conta só.
            {"conta_id": ids["Escritório Alfa"], "cnpj": CNPJ_ALFA_FILIAL, "fonte": "busca"},
            {"conta_id": ids["Beta Seguros"], "dominio": "beta.com.br", "cnpj": "33000167000101", "fonte": "busca"},
        ],
    )
    assert (res.dominios, res.cnpjs, res.mescladas) == (2, 1, 1)
    assert conn.execute("select count(*) as n from conta").fetchone()["n"] == 2
    alfa = conn.execute("select * from conta where cnpj_raiz = '11222333'").fetchone()
    assert alfa["abc"] == "A" and alfa["dominio"] == "alfa.adv.br"
    assert dominios.pendencias(conn) == []
    assert sum(r["abertos"] for r in dominios.resumo_buracos(conn)) == 0
    fechado = conn.execute("select resolucao from buraco where tipo = 'sem_dominio' and conta_id = %s", (alfa["id"],)).fetchone()
    assert fechado["resolucao"] == "domínio por Apollo"


def test_resolucao_de_baixa_confianca_e_generica_nao_grava(conn):
    importar.importar(conn, linhas(["empresa"], ["Delta"]))
    cid = str(conn.execute("select id from conta").fetchone()["id"])
    res = dominios.aplicar(
        conn,
        [
            {"conta_id": cid, "dominio": "delta.com.br", "confianca": "baixa"},
            {"conta_id": cid, "dominio": "delta@gmail.com"},
            {"conta_id": cid, "cnpj": "123"},
        ],
    )
    assert res.dominios == 0 and len(res.ignoradas) == 3
    assert conn.execute("select dominio from conta").fetchone()["dominio"] is None


def test_grupo_economico_fecha_possivel_grupo(conn):
    importar.importar(
        conn,
        linhas(["empresa", "cnpj"], ["Sicredi", CNPJ_ALFA], ["Sicredi", "33.000.167/0001-01"]),
    )
    assert {r["tipo"] for r in conn.execute("select tipo from buraco where aberto")} >= {"possivel_grupo"}
    ids = [str(r["id"]) for r in conn.execute("select id from conta")]
    with pytest.raises(ValueError):
        dominios.mesclar(conn, ids[0], ids[1])
    conn.rollback()
    dominios.unir_grupo(conn, "Sistema Sicredi", ids)
    assert not conn.execute("select 1 from buraco where aberto and tipo = 'possivel_grupo'").fetchone()


def test_mesclar_preserva_historico(conn):
    importar.importar(conn, linhas(["empresa", "site", "decisor"], ["Omega", "omega.com.br", "Olga"], ["Omega Brasil", "", "Olga"]))
    a, b = [r["id"] for r in conn.execute("select id from conta order by nome")]
    conn.execute("insert into sinal (conta_id, tipo, fonte, data_evento) values (%s, 'vaga_sdr', 'Indeed', '2026-09-20')", (a,))
    conn.execute("insert into sinal (conta_id, tipo, fonte, data_evento) values (%s, 'vaga_sdr', 'Gupy', '2026-09-20')", (b,))
    conn.execute("insert into sinal (conta_id, tipo, fonte, data_evento) values (%s, 'novo_cmo', 'Notícias', '2026-09-21')", (b,))
    ev = conn.execute("insert into evento_abordagem (conta_id, canal, tipo) values (%s, 'linkedin', 'convite') returning id", (b,)).fetchone()
    conn.execute("insert into desfecho (conta_id, evento_id, resultado) values (%s, %s, 'aceite')", (b, ev["id"]))
    with conn.transaction():
        dominios.mesclar(conn, a, b)
    assert conn.execute("select count(*) as n from sinal where conta_id = %s", (a,)).fetchone()["n"] == 2
    assert conn.execute("select count(*) as n from pessoa").fetchone()["n"] == 1
    assert conn.execute("select count(*) as n from desfecho where conta_id = %s", (a,)).fetchone()["n"] == 1


def test_planilha_vira_visao(conn, tmp_path):
    importar.importar(
        conn,
        linhas(
            ["empresa", "cnpj", "site", "abc", "decisor", "cargo"],
            ["Alfa", CNPJ_ALFA, "alfa.com.br", "A", "Ana", "Sócia"],
        ),
    )
    cid = conn.execute("select id from conta").fetchone()["id"]
    conn.execute("insert into sinal (conta_id, tipo, fonte, data_evento) values (%s, 'novo_cmo', 'Notícias', current_date)", (cid,))
    conn.execute("insert into desfecho (conta_id, resultado) values (%s, 'reuniao')", (cid,))
    linha = visao.linhas_planilha(conn)[0]
    assert (linha["cnpj"], linha["decisor"], linha["sinais_30d"], linha["ultimo_desfecho"]) == ("11222333000181", "Ana", 1, "reuniao")
    for nome in ("base.csv", "base.xlsx"):
        assert visao.exportar(conn, tmp_path / nome) == 1
    reimportado = importar.ler_planilha(tmp_path / "base.xlsx")
    assert reimportado[0]["empresa"] == "Alfa" and reimportado[0]["site"] == "alfa.com.br"
