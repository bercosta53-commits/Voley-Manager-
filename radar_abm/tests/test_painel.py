import json

from abm import painel
from abm.db import agora


def _conta(conn, id_, nome, raiz, dominio=None):
    conn.execute("insert into contas (id, nome_fantasia, cnpj, cnpj_raiz, dominio, criada_em, atualizada_em) values (?, ?, ?, ?, ?, ?, ?)",
                 (id_, nome, raiz + "000100", raiz, dominio, agora(), agora()))


def _sinal(conn, id_, conta, tipo, trecho, data, status="alerta", url="https://exemplo.com/x", classificador="vagas"):
    conn.execute("""insert into sinais (id, conta_id, tipo, evidencia_url, evidencia_trecho, data_fato, data_alerta, status, classificador)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?)""", (id_, conta, tipo, url, trecho, data, agora(), status, classificador))


def test_tipo_no_painel_pelo_titulo():
    assert painel.tipo_no_painel("vaga_comercial", "Vagas abertas: SDR (Sales Development Representative) [Gupy]") == "vaga_sdr"
    assert painel.tipo_no_painel("vaga_comercial", "Vagas abertas: Analista Comercial Pleno [Gupy]") == "vaga_executivo_regiao"
    assert painel.tipo_no_painel("vaga_marketing_growth", "Especialista em Growth Marketing [Indeed]") == "vaga_marketing"
    assert painel.tipo_no_painel("vaga_marketing_growth", "Analista de CRM e Automação [Indeed]") == "vaga_revops"
    assert painel.tipo_no_painel("troca_diretoria", "Nova diretora de marketing assume") == "novo_cmo"
    assert painel.tipo_no_painel("troca_diretoria", "Conselho elege novo presidente") == "novo_ceo"
    assert painel.tipo_no_painel("troca_diretoria", "Assembleia aprova contas") is None
    assert painel.tipo_no_painel("fusao_singulares", "") == "incorporacao_cooperativas"
    assert painel.tipo_no_painel("socio_saiu", "") is None
    assert painel.tipo_no_painel("expansao_negocio", "Cooperativa inaugura agência em Joinville") == "nova_filial"
    assert painel.tipo_no_painel("expansao_negocio", "BRDE e Cresol negociam parceria de crédito") is None


def test_exporta_para_a_caixa_marca_enviado_e_nao_repete(conn):
    _conta(conn, "F-1", "Alfa Coop", "11222333")
    _conta(conn, "F-2", "Beta Seguros", "44555666")
    _conta(conn, "F-3", "Gama", "")
    _sinal(conn, "s1", "F-1", "vaga_comercial", "Vagas abertas: SDR Pleno (Curitiba - PR) [Indeed]", "2026-09-20")
    _sinal(conn, "s2", "F-1", "vaga_comercial", "Vagas abertas: BDR (Curitiba - PR) [Gupy]", "2026-09-10")  # mesmo tipo, 10 dias
    _sinal(conn, "s3", "F-2", "socio_entrou", "QSA na Receita: MARIA SOUZA (Diretor), entrada em 2026-09-01", "2026-09-01",
           classificador="cnpj")
    _sinal(conn, "s4", "F-2", "socio_saiu", "QSA na Receita: JOSE (Diretor), saída", "2026-09-01", classificador="cnpj")
    _sinal(conn, "s5", "F-3", "vaga_comercial", "Vagas abertas: SDR [Indeed]", "2026-09-20")  # sem CNPJ: sem conta
    _sinal(conn, "s6", "F-1", "fusao_singulares", "Incorporação aprovada", "2026-09-15", status="descartado")
    _sinal(conn, "s7", "F-1", "novo_produto", "Lança seguro", "2026-01-01")  # fora da janela
    conn.commit()
    from datetime import date

    hoje = date(2026, 9, 25)
    res = painel.exportar(conn, "esp", painel.ContasDoPainel(), hoje=hoje, saida=lambda *_: None)
    docs = {d["doc_id"]: d["data"] for d in res.documentos}
    assert set(docs) == {"cnpj-11222333--vaga_sdr--2026-09-20", "cnpj-44555666--novos_socios--2026-09-01"}
    socio = docs["cnpj-44555666--novos_socios--2026-09-01"]
    assert socio["person"] == "Maria Souza" and socio["source"].startswith("Receita") and socio["status"] == "pendente"
    assert docs["cnpj-11222333--vaga_sdr--2026-09-20"]["detail"] == "SDR Pleno (Curitiba - PR)"
    assert docs["cnpj-11222333--vaga_sdr--2026-09-20"]["source"] == "Indeed"
    assert res.repetidos == 1 and res.sem_tipo == ["Beta Seguros: socio_saiu"] and res.sem_conta == ["Gama"]
    assert conn.execute("select count(*) from sinais where enviado_painel_em is not null").fetchone()[0] == 3
    # Segunda vez: nada novo a enviar.
    assert painel.exportar(conn, "esp", painel.ContasDoPainel(), hoje=hoje, saida=lambda *_: None).documentos == []
    lotes = painel.lotes("esp", res.documentos)
    assert lotes[0][0]["collection"] == "espacos/esp/caixa" and lotes[0][0]["op"] == "set"


def test_painel_baixado_acha_conta_por_dominio_e_nao_repete_o_que_ja_esta_la(conn, tmp_path):
    _conta(conn, "F-1", "Alfa Coop", "", dominio="alfacoop.com.br")
    _conta(conn, "F-2", "Beta Seguros", "44555666")
    _sinal(conn, "s1", "F-1", "vaga_comercial", "Vagas abertas: SDR [Indeed]", "2026-09-20")
    _sinal(conn, "s2", "F-2", "vaga_comercial", "Vagas abertas: SDR [Indeed]", "2026-09-20")
    conn.commit()
    partes = tmp_path / "espacos" / "esp" / "partes"
    caixa = tmp_path / "espacos" / "esp" / "caixa"
    partes.mkdir(parents=True)
    caixa.mkdir()
    (partes / "accounts-0.json").write_text(json.dumps({"id": "accounts-0", "data": {"items": [
        {"id": "conta-a1", "nome": "Alfa Cooperativa", "dominio": "alfacoop.com.br", "cnpjRoot": ""},
        {"id": "cnpj-44555666", "nome": "Beta Seguros", "dominio": "", "cnpjRoot": "44555666"}], "total": 1}}))
    (caixa / "cnpj-44555666--vaga_sdr--2026-09-18.json").write_text(json.dumps(
        {"id": "x", "data": {"accountId": "cnpj-44555666", "type": "vaga_sdr", "date": "2026-09-18", "status": "descartado"}}))
    from datetime import date

    contas = painel.ContasDoPainel.ler(tmp_path, "esp")
    res = painel.exportar(conn, "esp", contas, hoje=date(2026, 9, 25), saida=lambda *_: None)
    assert [d["doc_id"] for d in res.documentos] == ["conta-a1--vaga_sdr--2026-09-20"]
    assert res.repetidos == 1  # a Beta já tem esse fato na caixa (descartado): não volta


def test_dry_run_nao_marca(conn):
    _conta(conn, "F-1", "Alfa Coop", "11222333")
    _sinal(conn, "s1", "F-1", "vaga_comercial", "Vagas abertas: SDR [Indeed]", "2026-09-20")
    conn.commit()
    from datetime import date

    res = painel.exportar(conn, "esp", painel.ContasDoPainel(), hoje=date(2026, 9, 25), dry_run=True, saida=lambda *_: None)
    assert len(res.documentos) == 1
    assert conn.execute("select count(*) from sinais where enviado_painel_em is not null").fetchone()[0] == 0
