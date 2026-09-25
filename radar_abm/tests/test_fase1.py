import csv
import json

import pytest
from openpyxl import Workbook

from abm import aliases, db, importador, qualidade
from abm.identidade import cnpj_normalizado, limpo, normalizar_uf

from conftest import FIX


def importar(conn, caminho, **kw):
    return importador.importar(conn, importador.ler(caminho), **kw)


def conta(conn, id_):
    return conn.execute("select * from contas where id = ?", (id_,)).fetchone()


def test_limpeza_de_marcadores():
    assert limpo(" NÃO ENCONTRADO ") == "" and limpo("n/a") == "" and limpo(" São  Paulo ") == "São Paulo"
    assert normalizar_uf("sp") == "SP" and normalizar_uf("NÃO ENCONTRADO") is None and normalizar_uf("XX") is None
    assert cnpj_normalizado("1222333000140") is None or len(cnpj_normalizado("1222333000140")) == 14


def test_importa_csv_deduplica_por_cnpj_e_mantem_a_matriz(conn):
    rel = importar(conn, FIX / "contas_exemplo.csv")
    assert (rel.linhas, rel.novas) == (4, 3)
    assert rel.filiais == ["11222333000262 registrado como filial de A-001"]
    assert rel.cnpj_invalidos == ["linha 5 (WeCogno (ex-Datarisk)): 123"]
    alfa = conta(conn, "A-001")
    # A linha da filial não sobrescreve a matriz.
    assert (alfa["cnpj"], alfa["cnpj_raiz"], alfa["cidade"], alfa["uf"]) == ("11222333000181", "11222333", "SÃO PAULO", "SP")
    assert alfa["dominio"] == "alfa.adv.br" and alfa["braco_icp"] == "servicos_profissionais" and alfa["tier"] == "A"
    assert json.loads(alfa["contexto_json"]) == {"gatilho_recente": "Três novos sócios em 2026"}
    assert conta(conn, "A-002") is None
    wecogno = conta(conn, "T-001")
    assert (wecogno["uf"], wecogno["cidade"], wecogno["dominio"], wecogno["cnpj"]) == (None, None, None, None)
    assert any("genérico" in a for a in rel.avisos)
    pessoas = conn.execute("select nome, cargo, papel_comite from pessoas order by nome").fetchall()
    assert [tuple(p) for p in pessoas] == [("Ana Souza", "Sócia-diretora", "decisor"), ("Bruno Lima", "Head de Marketing", "influenciador")]


def test_reimportar_nao_duplica_e_filial_antes_da_matriz(conn, tmp_path):
    importar(conn, FIX / "contas_exemplo.csv")
    rel = importar(conn, FIX / "contas_exemplo.csv")
    assert (rel.novas, rel.pessoas, rel.filiais) == (0, 0, [])
    assert conn.execute("select count(*) from contas").fetchone()[0] == 3

    # Filial chega primeiro, matriz depois: a matriz assume e a filial desce.
    arq = tmp_path / "ordem.csv"
    arq.write_text("id_conta,empresa,cnpj\nB-1,Beta Filial,11222333000262\nB-2,Beta,11.222.333/0001-81\n", encoding="utf-8")
    c2 = db.conectar(":memory:")
    db.migrar(c2)
    importar(c2, arq)
    b = c2.execute("select * from contas").fetchall()
    assert len(b) == 1 and b[0]["cnpj"] == "11222333000181"
    assert c2.execute("select cnpj from filiais").fetchone()[0] == "11222333000262"


def test_cnpj_preenchido_depois_junta_contas_duplicadas(conn, tmp_path):
    arq = tmp_path / "v1.csv"
    arq.write_text("id_conta,empresa,cnpj\nX-1,Gama Seguros,\nX-2,Gama Corretora,\n", encoding="utf-8")
    importar(conn, arq)
    x1 = conta(conn, "X-1")["id"]
    conn.execute("insert into pessoas (id, conta_id, nome, papel_comite) values ('p1', 'X-2', 'Carla', 'decisor')")
    conn.commit()
    # Você preenche os CNPJs: são matriz e filial da mesma empresa.
    arq.write_text("id_conta,empresa,cnpj\nX-1,Gama Seguros,11222333000181\nX-2,Gama Corretora,11222333000262\n", encoding="utf-8")
    rel = importar(conn, arq)
    assert rel.mescladas == ["X-2 juntada em X-1 (mesmo CNPJ raiz)"]
    assert conn.execute("select count(*) from contas").fetchone()[0] == 1
    assert conn.execute("select conta_id from pessoas where nome = 'Carla'").fetchone()[0] == x1
    assert conn.execute("select cnpj from filiais").fetchone()[0] == "11222333000262"


def test_site_que_e_pagina_de_vagas_vira_pagina_de_carreiras(conn, tmp_path):
    arq = tmp_path / "v.csv"
    arq.write_text("id_conta,empresa,site\nX-1,Delta Coop,https://deltacoop.gupy.io/\nX-2,Eta Seguros,https://etaseguros.com.br\n",
                   encoding="utf-8")
    rel = importar(conn, arq)
    assert conta(conn, "X-1")["dominio"] is None
    assert conta(conn, "X-1")["vagas_url"] == "https://deltacoop.gupy.io/"
    assert conta(conn, "X-2")["dominio"] == "etaseguros.com.br"
    assert any("página de vagas" in a for a in rel.avisos)


def test_dry_run_nao_grava(conn):
    rel = importar(conn, FIX / "contas_exemplo.csv", dry_run=True)
    assert rel.novas == 3
    assert conn.execute("select count(*) from contas").fetchone()[0] == 0


def test_xlsm_com_cabecalho_em_linhas_diferentes(conn, tmp_path):
    livro = Workbook()
    contas = livro.active
    contas.title = "02 Contas"
    contas.append(["ABM Outbound — base final"])
    contas.append([])
    contas.append(["id_conta", "Empresa", "CNPJ", "UF", "Tier"])
    contas.append(["A-9", "Delta Auditores", 11222333000181, "RS", "B"])  # CNPJ salvo como número
    pessoas = livro.create_sheet("03 Pessoas")
    pessoas.append(["Comitê de compra"])
    pessoas.append(["Empresa", "Nome", "Cargo", "Papel no comitê"])
    pessoas.append(["Delta Auditores", "Davi Reis", "Gerente de Compras", ""])
    pessoas.append(["Delta Auditores", "Eva Dias", "Analista", "Decisor"])
    pessoas.append(["Empresa Fantasma", "Fulano", "CEO", ""])
    arq = tmp_path / "ABM_Outbound_Final.xlsm"
    livro.save(arq)

    planilha = importador.ler(arq)
    assert (planilha.contas.linha_cabecalho, planilha.pessoas.linha_cabecalho) == (3, 2)
    rel = importador.importar(conn, planilha)
    assert conta(conn, "A-9")["cnpj"] == "11222333000181"
    papeis = dict(conn.execute("select nome, papel_comite from pessoas").fetchall())
    assert papeis == {"Davi Reis": "bloqueador", "Eva Dias": "decisor"}
    assert rel.avisos == ["pessoas, linha 5: Fulano sem conta correspondente (Empresa Fantasma)"]


def test_aliases_gerados_ambiguos_e_revisao(conn, tmp_path):
    importar(conn, FIX / "contas_exemplo.csv")
    arq = tmp_path / "mais.csv"
    arq.write_text("id_conta,empresa,icp\nA-3,KLA Advogados,advocacia\nA-4,\"Rossi, Maffini, Milman Advogados\",advocacia\n"
                   "F-2,Cresol Confederação,cooperativa\nF-3,Cresol Central Brasil,cooperativa\n", encoding="utf-8")
    importar(conn, arq)
    aliases.gerar(conn)

    def de(id_):
        return {a["termo"]: (a["tipo"], bool(a["ativo"]), a["motivo"] or "") for a in
                conn.execute("select * from aliases where conta_id = ?", (id_,))}

    assert de("F-001")["Junto Seguros"] == ("fantasia", True, "")
    assert de("F-001")["Junto"] == ("variacao", False, "palavra ou sobrenome comum")
    assert de("T-001")["Datarisk"][:2] == ("variacao", True)
    assert de("T-001")["WeCogno"][:2] == ("variacao", True)
    assert de("A-3")["KLA"] == ("variacao", False, "termo curto demais; aparece em muitos contextos")
    assert de("A-4")["RMM"][:2] == ("sigla", False)
    assert de("A-001")["Alfa"][1] is False  # palavra comum
    assert de("F-2")["Cresol"][2] == "mesmo termo de outra conta (F-3)"
    assert aliases.gerar(conn)["criados"] == 0  # rodar de novo não duplica

    rev = tmp_path / "revisar.csv"
    n = aliases.exportar_revisao(conn, rev)
    linhas = list(csv.DictReader(rev.read_text(encoding="utf-8-sig").splitlines(), delimiter=";"))
    assert len(linhas) == n and n >= 5
    for l in linhas:
        l["usar"] = "sim" if l["termo"] == "KLA" else ("nao" if l["termo"] == "Junto" else "")
        if l["termo"] == "KLA":
            l["termos_negativos"] = "futebol; música"
    with open(rev, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=aliases.COLUNAS_REVISAO, delimiter=";")
        w.writeheader()
        w.writerows(linhas)
    r = aliases.aplicar_revisao(conn, rev)
    assert (r["ligados"], r["desligados"]) == (1, 1)
    kla = conn.execute("select * from aliases where termo = 'KLA'").fetchone()
    assert kla["ativo"] and kla["revisado"] and kla["termos_negativos"] == "futebol; música"
    assert aliases.exportar_revisao(conn, rev) == n - 2  # revisados saem da lista


def test_relatorio_de_qualidade_e_pendencias(conn, tmp_path):
    importar(conn, FIX / "contas_exemplo.csv")
    rel = qualidade.relatorio(conn)
    faltas = {k: sorted(c["id"] for c in v) for k, v in rel["faltas"].items()}
    assert faltas == {"sem_cnpj": ["F-001", "T-001"], "sem_dominio": ["T-001"], "sem_uf": ["T-001"], "sem_pessoa": ["F-001"]}
    assert [c["id"] for c, _ in rel["cnpj_invalidos"]] == ["T-001"]
    assert len(rel["filiais"]) == 1
    saida = []
    qualidade.imprimir(rel, saida.append)
    assert any(l.startswith("SEM CNPJ") for l in saida)

    pend = tmp_path / "pendencias.csv"
    assert qualidade.exportar_pendencias(conn, pend) == 2
    # Você preenche e reimporta: a conta ganha CNPJ e site.
    texto = pend.read_text(encoding="utf-8-sig").replace("F-001,Junto Seguros,A,servicos_financeiros,CURITIBA,PR,,juntoseguros.com",
                                                         "F-001,Junto Seguros,A,servicos_financeiros,CURITIBA,PR,33.000.167/0001-01,juntoseguros.com")
    pend.write_text(texto, encoding="utf-8")
    importar(conn, pend)
    junto = conta(conn, "F-001")
    assert (junto["cnpj"], junto["braco_icp"], junto["status"]) == ("33000167000101", "servicos_financeiros", "ATIVAR")


def test_alias_da_razao_social_usa_o_nome_curto():
    termos = [c.termo for c in aliases.candidatos(
        "Cresol Confederação",
        "CONFEDERACAO NACIONAL DAS COOPERATIVAS CENTRAIS DE CREDITO E ECONOMIA FAMILIAR E SOLIDARIA - CRESOL CONFEDERACAO")]
    assert termos == ["Cresol Confederação", "Cresol"]
    termos = [c.termo for c in aliases.candidatos("Viasoft", "VMS SOLUCOES LTDA")]
    assert termos == ["Viasoft", "VMS"]
