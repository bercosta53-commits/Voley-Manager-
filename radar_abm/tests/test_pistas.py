import json

import pytest

from abm import aliases, importador, pistas
from abm.taxonomia import carregar

from conftest import FIX, RAIZ

TAX = carregar(RAIZ / "sinais.yaml")
ARQ = FIX / "vagas" / "consultorias_2026-09-25.csv"


def preparar(conn, tmp_path):
    arq = tmp_path / "contas.csv"
    arq.write_text(
        "id_conta,empresa,icp,subsegmento,cidade,uf,tier\n"
        "F-003,Junto Seguros,Financeiro regional,B2 · Seguro garantia e fiança locatícia,CURITIBA,PR,A\n"
        "F-050,Alfa Consórcios,Financeiro regional,B5 · Consórcios,CURITIBA,PR,C\n"
        "F-002,Cresol Confederação,Financeiro regional,B1 · Cooperativas de crédito,FRANCISCO BELTRÃO,PR,A\n"
        "A-001,Madrona Advogados,Escritórios de advocacia,Full service empresarial,SÃO PAULO,SP,A\n"
        "A-002,Veirano Advogados,Escritórios de advocacia,Full service empresarial,SÃO PAULO,SP,A\n"
        "T-001,Logcomex,Tecnologia B2B,Dados para comércio exterior,Curitiba,PR,A\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    aliases.gerar(conn)


def test_importa_pistas_com_candidatas_e_filtra_o_resto(conn, tmp_path):
    preparar(conn, tmp_path)
    tela = []
    r = pistas.importar(conn, pistas.ler_arquivo(ARQ), TAX, saida=tela.append)
    assert (r.novas, r.com_candidatas, r.ligadas, r.fora_do_icp) == (7, 3, 1, 3)
    assert r.fora_dos_grupos == ["Account Manager - Financial Services"]
    por_ref = {p["referencia"]: dict(p) for p in conn.execute("select * from pistas_vagas")}
    # Anúncios reais da Michael Page (consumo, premium importado, FMCG): fora do ICP.
    assert {por_ref[k]["status"] for k in ("JN-062026-7044824", "JN-052026-7026231", "JN-072026-7055090")} == {"fora_do_icp"}
    seguradora = por_ref["EXEMPLO-RH-001"]
    cands = json.loads(seguradora["candidatos_json"])
    assert seguradora["braco_icp"] == "servicos_financeiros" and seguradora["status"] == "aberta"
    assert [c["conta_id"] for c in cands] == ["F-003", "F-050"]  # Junto primeiro: subsegmento (seguro) e tier A
    assert "subsegmento do mesmo setor" in "; ".join(cands[0]["motivos"]) and cands[0]["pontos"] == 6
    assert cands[1]["pontos"] == 2  # consórcio em Curitiba: só a cidade
    assert [c["conta_id"] for c in json.loads(por_ref["EXEMPLO-MP-002"]["candidatos_json"])] == ["F-002"]
    assert {c["conta_id"] for c in json.loads(por_ref["EXEMPLO-HY-003"]["candidatos_json"])} == {"A-001", "A-002"}
    # Anúncio com o nome da empresa: liga direto e o sinal nasce em alerta.
    assert por_ref["EXEMPLO-RH-004"]["status"] == "atribuida" and por_ref["EXEMPLO-RH-004"]["conta_id"] == "T-001"
    s = conn.execute("select * from sinais").fetchone()
    assert (s["conta_id"], s["tipo"], s["confianca"], s["classificador"]) == ("T-001", "vaga_lideranca_receita", 0.8, "consultoria")
    assert "Vaga conduzida pela Robert Half (o anúncio diz o nome da empresa)" in s["por_que_agora"]
    # Nada vira sinal sem confirmação.
    assert conn.execute("select count(*) from sinais").fetchone()[0] == 1
    # Importar de novo não repete.
    assert pistas.importar(conn, pistas.ler_arquivo(ARQ), TAX, saida=lambda _: None).repetidas == 7


def test_atribuir_confirma_ou_descarta(conn, tmp_path):
    preparar(conn, tmp_path)
    pistas.importar(conn, pistas.ler_arquivo(ARQ), TAX, saida=lambda _: None)
    ids = {p["referencia"]: p["id"] for p in conn.execute("select id, referencia from pistas_vagas")}
    sinal = pistas.atribuir(conn, ids["EXEMPLO-RH-001"], "F-003", TAX)
    s = conn.execute("select * from sinais where id = ?", (sinal,)).fetchone()
    assert (s["conta_id"], s["tipo"], s["confianca"], s["status"], s["peso"]) == ("F-003", "vaga_lideranca_receita", 0.9, "alerta", 9)
    assert "Robert Half: Gerente de Marketing (Curitiba - PR). Nosso cliente é uma seguradora" in s["evidencia_trecho"]
    assert "cliente confirmado por você" in s["por_que_agora"]
    assert pistas.atribuir(conn, ids["EXEMPLO-HY-003"], "-", TAX) == "descartada"
    assert [p["referencia"] for p in pistas.abertas(conn)] == ["EXEMPLO-MP-002"]
    with pytest.raises(pistas.PistaInvalida, match="já foi atribuída"):
        pistas.atribuir(conn, ids["EXEMPLO-RH-001"], "F-050", TAX)
    with pytest.raises(pistas.PistaInvalida, match="não encontrada"):
        pistas.atribuir(conn, "nao-existe", "F-003", TAX)


def test_dry_run_e_digest_mostram_as_pistas(conn, tmp_path):
    from datetime import date

    from abm import digest

    preparar(conn, tmp_path)
    pistas.importar(conn, pistas.ler_arquivo(ARQ), TAX, dry_run=True, saida=lambda _: None)
    assert conn.execute("select count(*) from pistas_vagas").fetchone()[0] == 0
    pistas.importar(conn, pistas.ler_arquivo(ARQ), TAX, saida=lambda _: None)
    d = digest.gerar(conn, TAX, tmp_path / "d.html", hoje=date.today())
    html = (tmp_path / "d.html").read_text(encoding="utf-8")
    assert len(d["pistas"]) == 3 and "Pistas de headhunters" in html and "Junto Seguros" in html
