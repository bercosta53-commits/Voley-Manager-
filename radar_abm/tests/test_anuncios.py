"""Conector de bibliotecas de anúncios, com respostas no formato documentado do SearchAPI (empresas fictícias; nenhuma
busca paga é feita)."""

import csv
import json
from datetime import date, timedelta

import pytest

from abm import anunciantes, importador, painel
from abm.conectores.anuncios import ComparadorRegras, ConectorAnuncios, classificar_destino
from abm.conectores.base import selecionar_contas
from abm.conectores.provedor_anuncios import ProvedorAnuncios, SemChave, custo_mensal
from abm.raiox_midia import gerar_raiox, link_linkedin

HOJE = date(2026, 9, 25)


class HttpFalso:
    """Responde pela chave da resposta salva (a mesma que o ClienteLocal usaria) e guarda o que foi pedido."""

    def __init__(self, respostas: dict):
        self.respostas = respostas
        self.pedidos = []

    def get_json(self, url, headers=None, chave=None):
        self.pedidos.append((url, headers, chave))
        if chave not in self.respostas:
            raise AssertionError(f"busca inesperada: {chave}")
        return self.respostas[chave]

    def post_json(self, url, corpo, headers=None, chave=None):
        self.pedidos.append((url, headers, chave, corpo))
        if chave not in self.respostas:
            raise AssertionError(f"busca inesperada: {chave}")
        return self.respostas[chave]


# ---------------------------------------------------------------- respostas no formato do SearchAPI

def g_criativo(cid, adv, inicio, ultimo, dominio="horizonte.coop.br", formato="text"):
    return {"id": cid, "target_domain": dominio, "advertiser": {"id": adv, "name": "COOPERATIVA HORIZONTE DE CREDITO"},
            "first_shown_datetime": f"{inicio}T10:00:00Z", "last_shown_datetime": f"{ultimo}T10:00:00Z",
            "total_days_shown": 30, "format": formato,
            "details_link": f"https://adstransparency.google.com/advertiser/{adv}/creative/{cid}?region=BR"}


def g_lista(adv, criativos):
    return {"search_information": {"total_results": len(criativos)}, "ad_creatives": criativos}


def g_detalhe(titulo, descricao, destino, cta="Saiba mais"):
    return {"ad_information": {"variations": [{"headline": titulo, "description": descricao, "call_to_action": cta,
                                               "destination_url": destino}]}}


def m_anuncio(aid, page, inicio, ativo, texto, link, fim=None, cta="Saiba mais", formato="IMAGE"):
    return {"ad_archive_id": aid, "page_id": page, "is_active": ativo, "start_date": f"{inicio}T07:00:00Z",
            "end_date": f"{fim or inicio}T07:00:00Z",
            "snapshot": {"page_id": page, "page_name": "Cooperativa Horizonte", "body": {"text": texto}, "cta_text": cta,
                         "link_url": link, "display_format": formato, "cards": []}}


def m_lista(anuncios):
    return {"search_information": {"total_results": len(anuncios)}, "ads": anuncios}


def d(n):
    return (HOJE + timedelta(days=n)).isoformat()


@pytest.fixture
def base(conn, tmp_path, monkeypatch):
    monkeypatch.setenv("SEARCHAPI_API_KEY", "chave-de-teste")
    monkeypatch.setenv("RADAR_ANUNCIOS_PROVEDOR", "searchapi")  # estes testes usam o formato do SearchAPI
    arq = tmp_path / "contas.csv"
    arq.write_text(
        "id_conta,empresa,razao_social,icp,site,tier,pessoa_p1,cargo_p1,pessoa_p2,cargo_p2\n"
        "F-1,Cooperativa Horizonte,COOPERATIVA HORIZONTE DE CREDITO LTDA,Financeiro regional,horizonte.coop.br,A,"
        "Ana Lima,Diretora Superintendente,Beto Reis,Head de Marketing\n"
        "F-2,Central Sicredi Norte,COOPERATIVA CENTRAL SICREDI NORTE,Financeiro regional,sicredi.com.br,A,,,,\n",
        encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    return conn


def rodar(conn, respostas, hoje, comparador=None, forcar=True, dry_run=False):
    http = HttpFalso(respostas)
    saida = []
    c = ConectorAnuncios(conn, http=http, hoje=hoje, comparador=comparador or ComparadorRegras(), forcar=forcar,
                         dry_run=dry_run, saida=saida.append)
    ex = c.executar(selecionar_contas(conn, ids=["F-1"]))
    return ex, http, saida


def sinais(conn):
    return {r["tipo"]: dict(r) for r in conn.execute("select * from sinais where classificador = 'anuncios'")}


# ---------------------------------------------------------------- identidade do anunciante

def test_descoberta_nao_associa_e_so_confirma_o_que_voce_marcar(base, tmp_path):
    respostas = {
        "google_busca_cooperativa_horizonte_de_credito_ltda": {"advertisers": [
            {"id": "AR111", "name": "COOPERATIVA HORIZONTE DE CREDITO LTDA", "region": "BR", "ads_count": 12},
            {"id": "AR222", "name": "Horizonte Imoveis", "region": "BR"}]},
        "meta_busca_cooperativa_horizonte": {"page_results": [
            {"page_id": "900", "name": "Cooperativa Horizonte", "category": "Banco"},
            {"page_id": "901", "name": "Horizonte Turismo"}]},
        "meta_900": m_lista([m_anuncio("1", "900", d(-20), True, "Crédito rural", "https://horizonte.coop.br/credito")]),
    }
    prov = ProvedorAnuncios(base, HttpFalso(respostas))
    res = anunciantes.descobrir(base, prov, selecionar_contas(base, ids=["F-1"]), saida=lambda *_: None)
    cand = {(r["plataforma"], r["id_externo"]): dict(r) for r in base.execute("select * from anunciantes_candidatos")}
    assert ("google", "AR111") in cand and ("google", "AR222") not in cand  # nome não bate com a razão social
    assert ("meta", "900") in cand and "levam a horizonte.coop.br" in cand[("meta", "900")]["evidencia"]
    conta = base.execute("select * from contas where id = 'F-1'").fetchone()
    assert conta["google_advertiser_ids"] is None and conta["meta_page_ids"] is None  # nunca associa sozinho
    assert res.chamadas == 3

    arq = tmp_path / "cand.csv"
    anunciantes.exportar(base, arq)
    linhas = list(csv.DictReader(open(arq, encoding="utf-8-sig"), delimiter=";"))
    for ln in linhas:
        ln["confirmar"] = "sim" if ln["id"] in ("AR111", "900") else "nao"
    with open(arq, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0]), delimiter=";")
        w.writeheader()
        w.writerows(linhas)
    r = anunciantes.confirmar_arquivo(base, arq)
    assert r["confirmados"] == 2
    conta = base.execute("select * from contas where id = 'F-1'").fetchone()
    assert json.loads(conta["google_advertiser_ids"]) == ["AR111"] and json.loads(conta["meta_page_ids"]) == ["900"]


def test_dominio_compartilhado_nao_conta_ponto_e_pede_conferencia(base):
    respostas = {
        "google_busca_cooperativa_central_sicredi_norte": {"advertisers": []},
        "meta_busca_central_sicredi_norte": {"page_results": [{"page_id": "700", "name": "Sicredi Norte"}]},
        "meta_700": m_lista([m_anuncio("9", "700", d(-5), True, "Conta PJ", "https://www.sicredi.com.br/site/pj")]),
    }
    prov = ProvedorAnuncios(base, HttpFalso(respostas))
    anunciantes.descobrir(base, prov, selecionar_contas(base, ids=["F-2"]), saida=lambda *_: None)
    c = base.execute("select * from anunciantes_candidatos where id_externo = '700'").fetchone()
    assert "COMPARTILHADO" in c["evidencia"] and c["status"] == "pendente"


# ---------------------------------------------------------------- coleta semanal

def confirmar_ids(conn):
    anunciantes.confirmar(conn, "F-1", "google", "AR111")
    anunciantes.confirmar(conn, "F-1", "meta", "900")


def semana(google_criativos, meta_anuncios, detalhes=None):
    r = {"google_AR111": g_lista("AR111", google_criativos), "meta_900": m_lista(meta_anuncios)}
    for cid, det in (detalhes or {}).items():
        r[f"google_detalhe_{cid}"] = det
    return r


def google_vistos(n, dia):
    """n criativos do Google vistos pela última vez na véspera do dia da coleta."""
    return [g_criativo(f"CR{i}", "AR111", d(-400), (dia - timedelta(days=1)).isoformat()) for i in range(n)]


def test_semanas_canal_novo_destino_novo_parou_e_volume(base):
    confirmar_ids(base)
    g_ativos = google_vistos(8, HOJE)
    det = {f"CR{i}": g_detalhe("Crédito rural", "Taxas para o produtor", "https://horizonte.coop.br/") for i in range(8)}
    # semana 1: linha de base (Google ativo há mais de um ano, Meta sem anúncios)
    ex, http, _ = rodar(base, semana(g_ativos, [], det), HOJE)
    assert ex.itens == 0 and not sinais(base)
    assert all("api_key" not in p[0] and p[1]["Authorization"] == "Bearer chave-de-teste" for p in http.pedidos)

    # semana 2: entra no Meta com landing page dedicada (RD Station)
    meta = [m_anuncio(str(i), "900", d(5), True, "Crédito rural com taxa especial", "https://lp.rdstation.com.br/horizonte-rural")
            for i in range(2)]
    ex, http, _ = rodar(base, semana(google_vistos(8, HOJE + timedelta(days=7)), meta, det), HOJE + timedelta(days=7))
    s = sinais(base)
    assert set(s) == {"anuncio_canal_novo", "anuncio_destino_novo"}
    assert "também no Meta" in s["anuncio_canal_novo"]["por_que_agora"]
    assert "Falar com Beto Reis (Head de Marketing)" in s["anuncio_canal_novo"]["por_que_agora"]
    assert "RD Station" in s["anuncio_destino_novo"]["por_que_agora"] and s["anuncio_destino_novo"]["status"] == "alerta"
    # detalhe (busca paga) só para criativo ainda sem texto: 5 na semana 1 (limite), os 3 restantes agora
    assert sum("google_detalhe" in (p[2] or "") for p in http.pedidos) == 3

    # semanas 3 a 5: Google cai de 8 para 3 criativos
    for i, dias in enumerate((14, 21, 28)):
        rodar(base, semana(google_vistos(3, HOJE + timedelta(days=dias)), meta), HOJE + timedelta(days=dias))
    assert "anuncio_volume" in sinais(base)
    assert "de 8 para 3" in sinais(base)["anuncio_volume"]["por_que_agora"]

    # semanas seguintes: Google some; depois de 30 dias sem anúncio ativo, "parou"
    parado = [g_criativo(f"CR{i}", "AR111", d(-400), d(28)) for i in range(3)]
    for dias in (35, 42, 49, 56, 63, 70, 77):
        rodar(base, semana(parado, meta), HOJE + timedelta(days=dias))
    s = sinais(base)
    assert "anuncio_parou" in s
    assert "Parou de anunciar no Google" in s["anuncio_parou"]["por_que_agora"]
    assert "meses contínuos" in s["anuncio_parou"]["por_que_agora"]
    assert base.execute("select count(*) from sinais where tipo = 'anuncio_parou'").fetchone()[0] == 1  # avisa uma vez


def test_comecou_a_anunciar_e_mensagem_nova(base):
    confirmar_ids(base)
    rodar(base, semana([], []), HOJE)  # base: nada ativo
    meta = [m_anuncio("1", "900", d(6), True, "Consórcio de imóveis com parcelas menores", "https://horizonte.coop.br/")]
    rodar(base, semana([], meta), HOJE + timedelta(days=7))
    s = sinais(base)
    assert list(s) == ["anuncio_comecou"]
    assert "Começou a anunciar no Meta" in s["anuncio_comecou"]["por_que_agora"]
    assert s["anuncio_comecou"]["peso"] == 8 and s["anuncio_comecou"]["status"] == "alerta"

    class Fixo:
        nome = "claude:teste"

        def comparar(self, conta, atuais, anteriores):
            assert len(anteriores) >= 2
            return {"tipo_mudanca": "publico", "novo_tema": "conta PJ", "confianca": 0.8,
                    "resumo": "passou a falar com empresas (conta PJ e capital de giro), público que não aparecia antes"}

    rodar(base, semana([], meta), HOJE + timedelta(days=14))
    meta2 = meta + [m_anuncio("2", "900", d(20), True, "Conta PJ e capital de giro para sua empresa", "https://horizonte.coop.br/")]
    rodar(base, semana([], meta2), HOJE + timedelta(days=21), comparador=Fixo())
    s = sinais(base)
    assert s["anuncio_mensagem_nova"]["por_que_agora"].startswith("Passou a falar com empresas")


def test_regras_acham_publico_empresarial_novo():
    r = ComparadorRegras().comparar({}, ["Conta PJ para sua empresa"], [["Crédito rural"], ["Seguro de vida"]])
    assert r["tipo_mudanca"] == "publico" and r["confianca"] == 0.5  # regra vai para revisão
    assert ComparadorRegras().comparar({}, ["Crédito rural hoje"], [["Crédito rural"], ["Crédito rural"]]) is None


def test_infraestrutura_sem_operacao(base):
    confirmar_ids(base)
    base.execute("insert into site_tecnologias values ('F-1', 'meta_pixel', '2026-09-01')")
    base.commit()
    rodar(base, semana([], []), HOJE)
    s = sinais(base)
    assert "infraestrutura_sem_operacao" in s and "pixel do Meta" in s["infraestrutura_sem_operacao"]["por_que_agora"]


def test_checagem_semanal_e_dry_run_sem_busca_paga(base):
    confirmar_ids(base)
    rodar(base, semana([], []), HOJE)
    ex, http, saida = rodar(base, semana([], []), HOJE + timedelta(days=3), forcar=False)
    assert not http.pedidos  # coletada há 3 dias: pulada

    class SemRede:
        def get_json(self, *a, **k):
            raise AssertionError("o dry-run não pode fazer busca paga")

    saida = []
    ConectorAnuncios(base, http=SemRede(), hoje=HOJE + timedelta(days=10), dry_run=True, comparador=ComparadorRegras(),
                     saida=saida.append).executar(selecionar_contas(base, ids=["F-1"]))
    assert any("US$" in s for s in saida)
    assert base.execute("select count(*) from chamadas_provedor").fetchone()[0] == 2  # só as 2 da primeira semana


def test_sem_chave_avisa(base, monkeypatch):
    monkeypatch.delenv("SEARCHAPI_API_KEY")
    with pytest.raises(SemChave):
        ProvedorAnuncios(base, HttpFalso({})).meta_paginas("x")


def test_custo_registrado_por_provedor(base):
    confirmar_ids(base)
    rodar(base, semana([g_criativo("CR1", "AR111", d(-10), d(-1))], [], {"CR1": g_detalhe("a", "b", "https://horizonte.coop.br/")}), HOJE)
    linhas = custo_mensal(base, "2026-01-01")
    assert linhas == [{"provedor": "searchapi", "chamadas": 3, "custo_usd": 0.01}]


# ---------------------------------------------------------------- destinos e raio-x

def test_classificar_destino():
    assert classificar_destino("https://horizonte.coop.br/", "horizonte.coop.br")[0] == "home"
    assert classificar_destino("https://horizonte.coop.br/consorcio-imoveis", "horizonte.coop.br")[0] == "lp_dedicada"
    assert classificar_destino("https://lp.horizonte.coop.br/x", "horizonte.coop.br")[0] == "subdominio"
    assert classificar_destino("https://horizonte.hs-sites.com/oferta", "horizonte.coop.br")[1] == "landing page em hubspot"
    assert classificar_destino("https://wa.me/5541999999999", "horizonte.coop.br")[0] == "whatsapp"


def test_raiox_de_midia(base):
    confirmar_ids(base)
    g = [g_criativo("CR1", "AR111", d(-150), d(-1))]
    rodar(base, semana(g, [], {"CR1": g_detalhe("Crédito rural", "Taxas para o produtor", "https://horizonte.coop.br/")}), HOJE)
    rx = gerar_raiox(base, "F-1", HOJE)
    assert "Google (1 criativo(s) ativo(s), há 5 meses)" in rx["texto"]
    assert "todos os anúncios levam para a home" in rx["texto"]
    assert "um único criativo" in rx["texto"]
    assert "sem anúncio para público empresarial" in rx["texto"]
    assert link_linkedin("Cooperativa Horizonte") in rx["texto"]
    assert base.execute("select texto from raiox_midia where conta_id = 'F-1'").fetchone()[0] == rx["texto"]


def test_painel_recebe_os_sinais_de_anuncio():
    assert painel.tipo_no_painel("anuncio_comecou", "") == "comecou_anuncios"
    assert painel.tipo_no_painel("anuncio_parou", "") == "pausou_anuncios"
    assert painel.tipo_no_painel("anuncio_destino_novo", "") == "nova_landing"


# ---------------------------------------------------------------- caminho gratuito: SerpApi (Google) e Apify (Meta)

def serp_criativo(cid, adv, nome, inicio, ultimo):
    ts = lambda iso: int(__import__("datetime").datetime.fromisoformat(iso + "T12:00:00+00:00").timestamp())
    return {"advertiser_id": adv, "advertiser": nome, "ad_creative_id": cid, "format": "text", "total_days_shown": 30,
            "first_shown": ts(inicio), "last_shown": ts(ultimo),
            "details_link": f"https://adstransparency.google.com/advertiser/{adv}/creative/{cid}?region=2076"}


def apify_anuncio(aid, page, nome, inicio, ativo, texto, link):
    ts = int(__import__("datetime").datetime.fromisoformat(inicio + "T12:00:00+00:00").timestamp())
    return {"ad_archive_id": aid, "page_id": page, "page_name": nome, "is_active": ativo, "start_date": ts, "end_date": ts,
            "snapshot": {"page_name": nome, "body": {"text": texto}, "cta_text": "Saiba mais", "link_url": link,
                         "display_format": "IMAGE", "cards": []}}


@pytest.fixture
def gratuito(conn, tmp_path, monkeypatch):
    monkeypatch.setenv("RADAR_ANUNCIOS_PROVEDOR", "gratuito")
    monkeypatch.setenv("SERPAPI_API_KEY", "segredo-serp")
    monkeypatch.setenv("APIFY_TOKEN", "segredo-apify")
    arq = tmp_path / "contas.csv"
    arq.write_text("id_conta,empresa,razao_social,icp,site,tier,pessoa_p1,cargo_p1\n"
                   "F-1,Cooperativa Horizonte,COOPERATIVA HORIZONTE DE CREDITO LTDA,Financeiro regional,horizonte.coop.br,A,"
                   "Beto Reis,Head de Marketing\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    return conn


def test_gratuito_descobre_e_coleta_no_formato_comum(gratuito):
    respostas = {
        "google_busca_cooperativa_horizonte_de_credito_ltda": {"ad_creatives": [
            serp_criativo("CR1", "AR111", "COOPERATIVA HORIZONTE DE CREDITO LTDA", d(-60), d(-2)),
            serp_criativo("CR2", "AR111", "COOPERATIVA HORIZONTE DE CREDITO LTDA", d(-30), d(-1)),
            serp_criativo("CR9", "AR999", "Horizonte Imoveis", d(-10), d(-1))]},
        "meta_busca_cooperativa_horizonte": [
            apify_anuncio("5", "900", "Cooperativa Horizonte", d(-20), True, "Crédito rural", "https://horizonte.coop.br/credito"),
            apify_anuncio("6", "901", "Horizonte Turismo", d(-3), True, "Pacotes", "https://horizonteturismo.com.br/")],
    }
    http = HttpFalso(respostas)
    prov = ProvedorAnuncios(gratuito, http)
    anunciantes.descobrir(gratuito, prov, selecionar_contas(gratuito, ids=["F-1"]), saida=lambda *_: None)
    cand = {(r["plataforma"], r["id_externo"]): dict(r) for r in gratuito.execute("select * from anunciantes_candidatos")}
    assert ("google", "AR111") in cand and "2 anúncio(s)" in cand[("google", "AR111")]["evidencia"]
    assert ("google", "AR999") not in cand
    assert "levam a horizonte.coop.br" in cand[("meta", "900")]["evidencia"]
    assert len(http.pedidos) == 2  # 1 SerpApi + 1 Apify: a conferência de domínio usou os anúncios já trazidos
    serp = next(p for p in http.pedidos if "serpapi" in p[0])
    assert "region=2076" in serp[0] and serp[1] is None
    apify = next(p for p in http.pedidos if "apify" in p[0])
    assert apify[1] == {"Authorization": "Bearer segredo-apify"} and "segredo-apify" not in apify[0]
    assert "view_all_page_id" not in apify[3]["urls"][0]["url"] and "country=BR" in apify[3]["urls"][0]["url"]

    anunciantes.confirmar(gratuito, "F-1", "google", "AR111")
    anunciantes.confirmar(gratuito, "F-1", "meta", "900")
    semana1 = {"google_AR111": {"ad_creatives": respostas["google_busca_cooperativa_horizonte_de_credito_ltda"]["ad_creatives"][:2]},
               "google_detalhe_CR1": g_detalhe("Crédito rural", "Taxa especial", "https://horizonte.coop.br/"),
               "google_detalhe_CR2": g_detalhe("Consórcio", "Parcelas menores", "https://horizonte.coop.br/consorcio"),
               "meta_900": [apify_anuncio("5", "900", "Cooperativa Horizonte", d(-20), True, "Crédito rural",
                                          "https://horizonte.coop.br/credito")]}
    ex, http, _ = rodar(gratuito, semana1, HOJE)
    assert ex.itens == 0 and not ex.erros
    linhas = {r["id"]: dict(r) for r in gratuito.execute("select * from anuncios")}
    assert linhas["CR1"]["inicio"] == d(-60) and linhas["CR1"]["ativo"] == 1 and "Crédito rural" in linhas["CR1"]["texto"]
    assert linhas["5"]["plataforma"] == "meta" and linhas["5"]["url_destino"] == "https://horizonte.coop.br/credito"
    custos = {c["provedor"]: c for c in custo_mensal(gratuito, "2000-01-01")}
    assert custos["serpapi"]["custo_usd"] == 0 and custos["apify"]["chamadas"] == 2


def test_trava_de_orcamento_pula_so_a_plataforma_sem_saldo(gratuito, monkeypatch):
    monkeypatch.setenv("RADAR_SERPAPI_LIMITE_MES", "3")
    anunciantes.confirmar(gratuito, "F-1", "google", "AR111")
    anunciantes.confirmar(gratuito, "F-1", "meta", "900")
    for _ in range(3):
        gratuito.execute("insert into chamadas_provedor values ('serpapi', 'anuncios', 'google_anuncios', datetime('now'), 0)")
    gratuito.commit()
    meta = [apify_anuncio("5", "900", "Cooperativa Horizonte", d(-20), True, "Crédito rural", "https://horizonte.coop.br/")]
    ex, http, saida = rodar(gratuito, {"meta_900": meta}, HOJE)
    assert not ex.erros and all("serpapi" not in p[0] for p in http.pedidos)
    assert any("Google fora desta coleta" in s for s in saida)
    foto = json.loads(gratuito.execute("select conteudo_json from snapshots").fetchone()[0])
    assert list(foto["ativos"]) == ["meta"]  # o Google não entra como zero: não vira "parou de anunciar"


def test_chave_do_serpapi_nunca_aparece_em_erro(gratuito):
    class Falha:
        def get_json(self, url, headers=None, chave=None):
            raise RuntimeError(f"falhou ao abrir {url}")

    with pytest.raises(RuntimeError) as e:
        ProvedorAnuncios(gratuito, Falha()).google_anuncios("AR111")
    assert "segredo-serp" not in str(e.value) and "***" in str(e.value)
