import json
from datetime import date

from abm import importador
from abm.conectores.base import selecionar_contas
from abm.conectores.cnpj import ConectorCNPJ
from abm.conectores.http import ClienteLocal

from conftest import FIX

PASTA = FIX / "brasilapi"
REAL = json.loads((PASTA / "91586982000109.json").read_text(encoding="utf-8"))


def preparar(conn, tmp_path):
    arq = tmp_path / "contas.csv"
    arq.write_text("id_conta,empresa,cnpj\nF-100,Sicredi Pioneira,91.586.982/0001-09\nF-101,Sem CNPJ Ltda,\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))


def rodar(conn, pasta, hoje, **kw):
    tela = []
    ex = ConectorCNPJ(conn, http=ClienteLocal(str(pasta)), hoje=hoje, saida=tela.append, **kw).executar(selecionar_contas(conn))
    return ex, tela


def salvar(pasta, dados):
    pasta.mkdir(exist_ok=True)
    (pasta / "91586982000109.json").write_text(json.dumps(dados), encoding="utf-8")


def test_traduz_resposta_real_sem_dado_pessoal(conn):
    c = ConectorCNPJ(conn)
    t = c.traduzir(REAL)
    assert t["razao_social"].startswith("COOPERATIVA DE CREDITO") and t["situacao"] == "ATIVA"
    assert t["cnae"] == {"codigo": "6424703", "descricao": "Cooperativas de crédito mútuo"}
    assert t["sede"]["municipio"] == "NOVA PETROPOLIS" and t["sede"]["logradouro"] == "RUA SETE DE SETEMBRO"
    assert t["qsa"][0] == {"nome": "FABIO ANDRE SCHMOEKEL", "qualificacao": "Diretor", "entrada": "2024-10-27"}
    texto = json.dumps(t)
    assert "***" not in texto and "faixa" not in texto  # CPF mascarado e faixa etária ficam de fora


def test_primeira_coleta_so_traz_entrada_recente_e_completa_a_conta(conn, tmp_path):
    preparar(conn, tmp_path)
    ex, tela = rodar(conn, PASTA, date(2024, 12, 1))
    assert ex.itens == 1 and ex.erros == []
    assert any("F-101 Sem CNPJ Ltda: pulada (sem CNPJ)" in l for l in tela)
    s = conn.execute("select * from sinais").fetchone()
    assert (s["tipo"], s["data_fato"], s["confianca"], s["status"], s["membro_comite"]) == (
        "socio_entrou", "2024-10-27", 1.0, "alerta", "decisor")
    assert "FABIO ANDRE SCHMOEKEL (Diretor)" in s["evidencia_trecho"]
    assert s["evidencia_url"] == "https://brasilapi.com.br/api/cnpj/v1/91586982000109"
    conta = conn.execute("select * from contas where id = 'F-100'").fetchone()
    assert (conta["uf"], conta["cidade"]) == ("RS", "NOVA PETROPOLIS") and conta["razao_social"].startswith("COOPERATIVA")

    # Um ano depois, a entrada de 2024 já não é novidade para quem chega agora.
    conn.execute("delete from snapshots")
    conn.commit()
    ex, _ = rodar(conn, PASTA, date(2026, 9, 25))
    assert ex.itens == 0


def test_janela_da_primeira_coleta_e_configuravel(conn, tmp_path, monkeypatch):
    preparar(conn, tmp_path)
    monkeypatch.setenv("RADAR_CNPJ_JANELA_DIAS", "30")
    ex, _ = rodar(conn, PASTA, date(2024, 12, 1))  # entrada em 27/10/2024: 35 dias antes
    assert ex.itens == 0


def test_coletas_seguintes_detectam_cada_mudanca(conn, tmp_path):
    preparar(conn, tmp_path)
    rodar(conn, PASTA, date(2026, 9, 25))
    mudou = json.loads(json.dumps(REAL))
    mudou["qsa"] = [s for s in mudou["qsa"] if s["nome_socio"] != "SOLON STAPASSOLA STAHL"]
    mudou["qsa"][0]["qualificacao_socio"] = "Presidente"
    mudou["qsa"].append({"nome_socio": "MARIA NOVA", "qualificacao_socio": "Diretor", "data_entrada_sociedade": "2026-09-20"})
    mudou["capital_social"] = 5_000_000
    mudou["logradouro"], mudou["numero"] = "DAS FLORES", "10"
    mudou["descricao_situacao_cadastral"] = "SUSPENSA"
    pasta = tmp_path / "v2"
    salvar(pasta, mudou)

    ex, tela = rodar(conn, pasta, date(2026, 10, 2))
    tipos = sorted(r[0] for r in conn.execute("select tipo from sinais"))
    assert tipos == ["administracao_mudou", "capital_mudou", "sede_mudou", "situacao_mudou", "socio_entrou", "socio_saiu"]
    assert ex.itens == 6
    capital = conn.execute("select evidencia_trecho from sinais where tipo = 'capital_mudou'").fetchone()[0]
    assert capital == "Receita Federal: capital social de R$ 0,00 para R$ 5.000.000,00"
    assert conn.execute("select data_fato from sinais where tipo = 'socio_entrou'").fetchone()[0] == "2026-09-20"

    # Rodar de novo com a mesma resposta: foto igual, nada novo, nenhum sinal repetido.
    ex, _ = rodar(conn, pasta, date(2026, 10, 9))
    assert ex.itens == 0 and conn.execute("select count(*) from sinais").fetchone()[0] == 6


def test_dry_run_mostra_os_passos_e_nao_grava(conn, tmp_path):
    preparar(conn, tmp_path)
    ex, tela = rodar(conn, PASTA, date(2024, 12, 1), dry_run=True)
    texto = "\n".join(tela)
    assert "1. BUSCA    GET https://brasilapi.com.br/api/cnpj/v1/91586982000109" in texto
    assert "2. TRADUZ   QSA com 3 pessoa(s)" in texto and "3. COMPARA  primeira coleta" in texto
    assert "socio_entrou: FABIO ANDRE SCHMOEKEL (Diretor) entrou" in texto
    assert "completaria na conta: razao_social = COOPERATIVA" in texto
    for tabela in ("sinais", "itens_brutos", "snapshots", "execucoes"):
        assert conn.execute(f"select count(*) from {tabela}").fetchone()[0] == 0
    assert conn.execute("select uf from contas where id = 'F-100'").fetchone()[0] is None


def test_erro_da_fonte_fica_registrado(conn, tmp_path):
    preparar(conn, tmp_path)
    ex, tela = rodar(conn, tmp_path / "vazia", date(2026, 9, 25))
    assert ex.itens == 0 and len(ex.erros) == 1 and "sem resposta salva" in ex.erros[0]
    e = conn.execute("select * from execucoes").fetchone()
    assert (e["conector"], e["erros"]) == ("cnpj", 1)
