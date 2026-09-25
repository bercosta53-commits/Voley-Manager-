"""Fase 6: feedback, métricas, digest e a semana completa pelo manager.py."""

import sys
from datetime import date, timedelta

import pytest

from abm import db, digest, importador
from abm.conectores.base import selecionar_contas
from abm.metricas import SinalNaoEncontrado, calcular, imprimir, registrar_feedback
from abm.taxonomia import carregar

from conftest import FIX, RAIZ
from test_conector_base import ConectorFalso

TAX = carregar(RAIZ / "sinais.yaml")
HOJE = date.today()


def contas(conn, tmp_path, linhas):
    arq = tmp_path / "contas.csv"
    arq.write_text("id_conta,empresa,icp,tier,pessoa_p1,cargo_p1\n" + "\n".join(linhas) + "\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))


def sinal(conn, id_, conta, tipo, status="alerta", conf=1.0, fato=None, alerta=None, classificador="claude:x", trecho="t", url="https://x.com/n"):
    conn.execute(
        """insert into sinais (id, conta_id, tipo, confianca, status, data_fato, data_alerta, classificador,
                               evidencia_trecho, evidencia_url, por_que_agora, membro_comite)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (id_, conta, tipo, conf, status, (fato or HOJE).isoformat(), (alerta or HOJE).isoformat() + "T10:00:00",
         classificador, trecho, url, f"Porque {id_}.", "decisor"))
    conn.commit()


def test_feedback_aprova_descarta_e_confirma(conn, tmp_path):
    contas(conn, tmp_path, ["F-1,Alfa Seguros,Financeiro regional,A,Ana Lima,CEO"])
    sinal(conn, "s1", "F-1", "novo_produto", status="revisar", conf=0.5, alerta=HOJE - timedelta(days=20))
    sinal(conn, "s2", "F-1", "troca_diretoria", conf=0.8)
    assert registrar_feedback(conn, "s1", "util", "bom gancho") == "alerta"
    s1 = conn.execute("select * from sinais where id = 's1'").fetchone()
    assert (s1["confianca"], s1["data_alerta"][:10]) == (1.0, HOJE.isoformat())  # aprovado agora, confirmado por pessoa
    assert registrar_feedback(conn, "s2", "ruido") == "descartado"
    assert conn.execute("select comentario from feedback where sinal_id = 's1'").fetchone()[0] == "bom gancho"
    with pytest.raises(SinalNaoEncontrado):
        registrar_feedback(conn, "nao-existe", "util")


def test_metricas_de_precisao_latencia_e_volume(conn, tmp_path):
    contas(conn, tmp_path, ["F-1,Alfa Seguros,Financeiro regional,A,,", "T-1,Beta Tech,Tecnologia B2B,B,,"])
    sinal(conn, "n1", "F-1", "novo_produto", fato=HOJE - timedelta(days=4))
    sinal(conn, "n2", "F-1", "novo_produto", fato=HOJE - timedelta(days=2), classificador="regras")
    sinal(conn, "n3", "T-1", "rodada_investimento", fato=HOJE - timedelta(days=10))
    sinal(conn, "c1", "T-1", "socio_entrou", fato=HOJE - timedelta(days=30), classificador="cnpj")
    registrar_feedback(conn, "n1", "util")
    registrar_feedback(conn, "n2", "util")
    registrar_feedback(conn, "n2", "ruido")  # vale a última avaliação
    registrar_feedback(conn, "c1", "util")
    m = calcular(conn, dias=30)
    por = {l.conector: l for l in m["linhas"]}
    assert (por["noticias"].sinais, por["noticias"].avaliados, por["noticias"].uteis) == (3, 2, 1)
    assert por["noticias"].precisao == 0.5 and por["cnpj"].precisao == 1.0
    assert sorted(por["noticias"].latencias) == [2, 4, 10] and por["cnpj"].latencias == [30]
    assert m["total"].precisao == pytest.approx(2 / 3)
    tela = []
    imprimir(m, tela.append)
    assert any("Precisão: 67% de 3 sinal(is)" in l for l in tela)
    assert any(l.strip().startswith("noticias") and "50%" in l and "mediana 4d" in l for l in tela)


def test_digest_mostra_quem_esquentou_com_evidencia_e_escapa_html(conn, tmp_path):
    contas(conn, tmp_path, ["F-1,Alfa Seguros,Financeiro regional,A,Ana Lima,CEO",
                            "T-1,Beta Tech,Tecnologia B2B,B,,",
                            "T-2,Gama Soft,Tecnologia B2B,C,,"])
    sinal(conn, "novo1", "F-1", "troca_diretoria", fato=HOJE - timedelta(days=3),
          trecho="Alfa <script>alert(1)</script> anuncia diretor", url="javascript:alert(1)")
    sinal(conn, "velho", "T-1", "rodada_investimento", fato=HOJE - timedelta(days=60), alerta=HOJE - timedelta(days=30))
    sinal(conn, "rev1", "T-2", "rodada_investimento", status="revisar", conf=0.5)
    destino = tmp_path / "saidas" / "digest.html"
    d = digest.gerar(conn, TAX, destino, hoje=HOJE)
    assert [c["id"] for c in d["contas"]] == ["F-1"]  # T-1 só esfriou; T-2 está em revisão
    s = d["contas"][0]["sinais"][0]
    assert s["pessoas"] == [("Ana Lima", "CEO")] and s["angulo"].startswith("Diretoria nova")
    html = destino.read_text(encoding="utf-8")
    assert "novo1" in html and "Porque novo1." in html and "Ana Lima" in html and "rev1" in html
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html
    assert "javascript:alert" not in html  # link que não é http não vira link
    assert 'name="viewport"' in html and "prefers-color-scheme" in html


def test_coleta_com_muitas_contas_resume_os_pulos(conn, tmp_path):
    contas(conn, tmp_path, [f"C-{i},Empresa {i},Tecnologia B2B,C,," for i in range(25)])
    tela = []
    ConectorFalso(conn, {}, saida=tela.append).executar(selecionar_contas(conn))
    assert not any(l.startswith("-- ") for l in tela) and "   puladas: 25 (sem CNPJ)" in tela


def test_semana_completa_pelo_manager(tmp_path, monkeypatch, capsys):
    import manager

    monkeypatch.setenv("RADAR_DB", str(tmp_path / "radar.db"))
    monkeypatch.setenv("RADAR_LOGS", str(tmp_path / "logs"))
    monkeypatch.setenv("RADAR_SAIDAS", str(tmp_path / "saidas"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    fx = tmp_path / "fx"
    fx.mkdir()
    (fx / "cnpj").symlink_to(FIX / "cnpj_real")
    (fx / "noticias").symlink_to(FIX / "noticias")
    csv = tmp_path / "lista.csv"
    csv.write_text("id_conta,empresa,icp,tier,cnpj,pessoa_p1,cargo_p1\n"
                   "F-003,Junto Seguros,Financeiro regional,A,84.948.157/0001-33,Roque de Holanda Melo,CEO\n"
                   "T-001,Logcomex,Tecnologia B2B,A,13.475.043/0001-75,Helmuth Hofstatter,CEO e fundador\n", encoding="utf-8")
    manager.main(["importar", str(csv)])
    manager.main(["semana", "--fixtures", str(fx)])
    saida = capsys.readouterr().out
    assert "apollo: sem respostas salvas" in saida and "Resumo da coleta: cnpj:" in saida
    assert "classificador regras" in saida and "Digest em" in saida

    conn = db.conectar(tmp_path / "radar.db")
    revisar = [r["id"] for r in conn.execute("select id from sinais where status = 'revisar'")]
    assert revisar  # as regras mandam as notícias para revisão
    manager.main(["feedback", revisar[0], "util"])
    manager.main(["metricas", "--dias", "0"])
    saida = capsys.readouterr().out
    assert "Sinal em alerta" in saida and "Precisão: 100% de 1 sinal(is)" in saida
    assert list((tmp_path / "saidas").glob("digest-*.html"))
