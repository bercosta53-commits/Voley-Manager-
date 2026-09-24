import io
import json
import zipfile
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from velora_radar import importar
from velora_radar.sinais import coletores, pipeline
from velora_radar.sinais.catalogo import TIPOS
from velora_radar.sinais.classificador import (
    ClassificacaoFalhou,
    ClassificadorClaude,
    ClassificadorRegras,
    montar_pedido,
    validar,
)

from test_fundacao import CNPJ_ALFA, conn, linhas  # noqa: F401 - fixture do banco

FIX = Path(__file__).parent / "fixtures"
HOJE = date(2026, 9, 24)
CSV_CVM = (
    "CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;"
    "Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n"
    "11.222.333/0001-81;ALFA S.A.;12345;2026-09-10;Fato Relevante;;;Aquisição da Beta Serviços;2026-09-10;AP - Apresentação;"
    "012345IPE100920260001;1;https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Protocolo=1\n"
    "11.222.333/0001-81;ALFA S.A.;12345;2026-09-12;Valores Mobiliários;;;3ª emissão de debêntures simples;2026-09-12;AP - Apresentação;"
    "012345IPE120920260002;1;https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Protocolo=2\n"
    "11.222.333/0001-81;ALFA S.A.;12345;2026-05-01;Fato Relevante;;;Antigo;2026-05-01;AP - Apresentação;"
    "012345IPE010520260003;1;\n"
    "99.888.777/0001-00;OUTRA S.A.;999;2026-09-15;Fato Relevante;;;Sem relação;2026-09-15;AP - Apresentação;"
    "099999IPE150920260004;1;\n"
)


def zip_cvm() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("ipe_cia_aberta_2026.csv", CSV_CVM.encode("latin-1"))
    return buf.getvalue()


def buscar_falso(url: str) -> bytes:
    if "news.google.com" in url:
        return (FIX / "google_news.xml").read_bytes()
    if "brasilapi" in url:
        return (FIX / "brasilapi_cnpj.json").read_bytes()
    if "dados.cvm.gov.br" in url:
        return zip_cvm()
    raise AssertionError(f"URL inesperada: {url}")


CONTA = coletores.Conta(id="c1", nome="Alfa Advogados", cnpj_raiz="11222333", cnpjs=["11222333000181"])


def test_noticias_da_janela_sem_sufixo_do_veiculo():
    itens = coletores.coletar_noticias(CONTA, buscar_falso, HOJE)
    assert [i.titulo for i in itens] == [
        "Alfa Advogados anuncia três novos sócios na área tributária",
        "Alfa Advogados patrocina torneio beneficente de tênis",
        "Alfa Advogados contrata Maria Lima como nova diretora de marketing",
    ]
    assert itens[0].fonte == "Migalhas" and itens[0].publicado_em == date(2026, 9, 21)
    assert "\"Alfa+Advogados\"" in coletores.url_google_news("Alfa Advogados").replace("%22", '"').replace("%20", "+")


def test_cnpj_primeira_foto_so_traz_socio_recente_e_depois_compara():
    atual = coletores.ler_cnpj(json.loads((FIX / "brasilapi_cnpj.json").read_text()))
    primeira = coletores.diff_cnpj(CONTA, "11222333000181", atual, None, HOJE)
    assert [(i.tipo_sugerido, i.publicado_em) for i in primeira] == [("novos_socios", date(2026, 8, 15))]
    depois = dict(atual, capital_social=900000, socios=[s for s in atual["socios"] if s["nome"] != "ANA SOUZA"]
                  + [{"nome": "BIA ROCHA", "qualificacao": "Sócio", "entrada": ""}])
    itens = coletores.diff_cnpj(CONTA, "11222333000181", depois, atual, HOJE)
    assert sorted(i.tipo_sugerido for i in itens) == ["aumento_capital", "novos_socios", "novos_socios", "saida_socio"]
    assert all(i.url and i.texto for i in itens)


def test_cvm_filtra_conta_janela_e_categoria():
    itens = coletores.coletar_cvm([CONTA], buscar_falso, HOJE)["c1"]
    assert [(i.tipo_sugerido, i.publicado_em) for i in itens] == [
        ("fato_relevante", date(2026, 9, 10)),
        ("emissao_titulos", date(2026, 9, 12)),
    ]
    assert itens[0].chave == "012345IPE100920260001" and itens[0].url.startswith("https://www.rad.cvm.gov.br")


def item(id_, titulo, coletor="noticias", texto="", tipo_sugerido=None):
    return {"id": id_, "titulo": titulo, "texto": texto, "coletor": coletor, "tipo_sugerido": tipo_sugerido, "fonte": "X"}


def test_regras_tipam_noticias_vagas_e_fontes_oficiais():
    r = ClassificadorRegras()
    vs = r.classificar({}, [
        item("1", "Alfa Advogados anuncia três novos sócios na área tributária"),
        item("2", "Alfa Advogados patrocina torneio beneficente de tênis"),
        item("3", "Alfa Advogados contrata Maria Lima como nova diretora de marketing"),
        item("4", "Analista de Marketing de Performance - Alfa", coletor="vagas"),
        item("5", "Assistente Administrativo - Alfa", coletor="vagas"),
        item("6", "SDR Pleno", coletor="vagas"),
        item("7", "Carlos entrou no QSA", coletor="cnpj", tipo_sugerido="novos_socios"),
        item("8", "Alfa entra com pedido de recuperação judicial"),
    ])
    assert [(v.tipo, v.confianca) for v in vs] == [
        ("novos_socios", "media"), (None, "media"), ("novo_cmo", "media"), ("vaga_marketing", "media"),
        (None, "media"), ("vaga_sdr", "media"), ("novos_socios", "alta"), ("recuperacao_judicial", "media"),
    ]
    assert vs[2].papel == "decisor" and vs[2].cargo == TIPOS["novo_cmo"].cargo


def test_evidencia_inventada_cai_para_o_titulo_e_rebaixa_confianca():
    it = item("1", "Alfa contrata Maria Lima como diretora de marketing", texto="Maria vem da Beta.")
    ok = validar(it, {"relevante": True, "tipo": "novo_cmo", "confianca": "alta", "trecho": "Maria vem da Beta"}, "x")
    assert (ok.trecho, ok.confianca) == ("Maria vem da Beta", "alta")
    ruim = validar(it, {"relevante": True, "tipo": "novo_cmo", "confianca": "alta", "trecho": "Maria trará 50% de crescimento"}, "x")
    assert (ruim.trecho, ruim.confianca) == (it["titulo"], "media")
    fora = validar(it, {"relevante": True, "tipo": "tipo_inventado", "confianca": "alta"}, "x")
    assert fora.relevante is False


class ClienteFalso:
    """Imita client.beta.messages.create e guarda os parâmetros enviados."""

    def __init__(self, resposta: dict | None = None, stop_reason: str = "end_turn"):
        self.chamadas = []
        self.resposta, self.stop_reason = resposta, stop_reason
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.chamadas.append(kw)
        texto = json.dumps(self.resposta)
        return SimpleNamespace(stop_reason=self.stop_reason, model=kw["model"], content=[SimpleNamespace(type="text", text=texto)])


def test_claude_pedido_estruturado_com_reserva_e_validacao():
    cli = ClienteFalso({"itens": [
        {"id": "1", "relevante": True, "tipo": "novos_socios", "confianca": "alta", "papel_afetado": "decisor",
         "cargo_afetado": "Sócio-diretor", "detalhe": "Três novos sócios tributaristas", "trecho": "três novos sócios", "motivo": "fato direto"},
        {"id": "2", "relevante": False, "tipo": "nenhum", "confianca": "alta", "papel_afetado": "indefinido",
         "cargo_afetado": "", "detalhe": "", "trecho": "", "motivo": "patrocínio"},
    ]})
    vs = ClassificadorClaude(client=cli).classificar({"nome": "Alfa"}, [
        item("1", "Alfa Advogados anuncia três novos sócios na área tributária"), item("2", "Patrocínio de torneio")])
    kw = cli.chamadas[0]
    assert kw["model"] == "claude-opus-5" and kw["fallbacks"] == "default"
    assert kw["betas"] == ["server-side-fallback-2026-07-01"]
    assert kw["output_config"]["format"]["type"] == "json_schema" and kw["output_config"]["effort"] == "low"
    assert "novos_socios" in kw["output_config"]["format"]["schema"]["properties"]["itens"]["items"]["properties"]["tipo"]["enum"]
    assert [(v.tipo, v.confianca, v.classificador) for v in vs] == [
        ("novos_socios", "alta", "claude:claude-opus-5"), (None, "alta", "claude:claude-opus-5")]
    assert "Alfa" in montar_pedido({"nome": "Alfa"}, [item("1", "t")])
    with pytest.raises(ClassificacaoFalhou):
        ClassificadorClaude(client=ClienteFalso({}, stop_reason="refusal")).classificar({}, [item("1", "t")])


def test_pipeline_coleta_classifica_e_revisa(conn):  # noqa: F811
    importar.importar(conn, linhas(["empresa", "cnpj", "abc"], ["Alfa Advogados", CNPJ_ALFA, "A"]))
    res = pipeline.coletar(conn, buscar=buscar_falso, hoje=HOJE)
    assert res.novos == {"noticias": 3, "cnpj": 1, "cvm": 2} and res.erros == []
    assert pipeline.coletar(conn, buscar=buscar_falso, hoje=HOJE).novos == {"noticias": 0, "cnpj": 0, "cvm": 0}
    conta_id = str(conn.execute("select id from conta").fetchone()["id"])
    assert pipeline.importar(conn, [{"conta_id": conta_id, "titulo": "Analista de Growth Pleno", "url": "https://br.indeed.com/x", "fonte": "Indeed"}]) == 1

    cls = pipeline.classificar(conn, ClassificadorRegras())
    # Notícia de novos sócios (21/09) e entrada no QSA (15/08) são fatos com datas distintas: dois sinais.
    assert (cls.sinais, cls.ruido) == (6, 1)
    pend = pipeline.pendentes(conn)
    assert sorted(p["tipo"] for p in pend) == [
        "emissao_titulos", "fato_relevante", "novo_cmo", "novos_socios", "novos_socios", "vaga_marketing"]
    socio = next(p for p in pend if p["tipo"] == "novos_socios" and p["fonte"].startswith("Receita"))
    assert socio["confianca"] == "alta" and socio["peso"] == 3
    assert socio["evidencia_url"] and socio["evidencia_trecho"] and socio["classificador"] == "regras"
    assert conn.execute("select count(*) as n from coleta_item where status = 'novo'").fetchone()["n"] == 0

    assert pipeline.revisar(conn, [socio["id"]], aprovar=True) == 1
    vigente = conn.execute("select valor_hoje, idade_dias from vw_sinal_vigente").fetchone()
    assert vigente["valor_hoje"] > 0


def test_pipeline_para_quando_o_classificador_falha(conn):  # noqa: F811
    importar.importar(conn, linhas(["empresa"], ["Alfa Advogados"]))
    pipeline.coletar(conn, fontes=("noticias",), buscar=buscar_falso, hoje=HOJE)

    class Falha:
        def classificar(self, conta, itens):
            raise ClassificacaoFalhou("recusado")

    res = pipeline.classificar(conn, Falha())
    assert res.falha == "recusado" and res.sinais == 0
    assert conn.execute("select count(*) as n from coleta_item where status = 'novo'").fetchone()["n"] == 3
