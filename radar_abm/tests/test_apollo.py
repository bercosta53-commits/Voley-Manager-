"""Conector Apollo com respostas no formato documentado da API (pessoas fictícias; nenhum crédito gasto)."""

import json
from datetime import date

from abm import aliases, importador
from abm.conectores.apollo import ConectorApollo
from abm.conectores.base import selecionar_contas
from abm.conectores.http import ClienteLocal

HOJE = date(2026, 9, 25)


def pessoa_apollo(id_, nome, titulo, empresa, dominio):
    primeiro, *resto = nome.split()
    return {"id": id_, "first_name": primeiro, "last_name": " ".join(resto), "name": nome, "title": titulo,
            "email": f"{primeiro.lower()}@{dominio}", "personal_emails": [], "phone_numbers": [],
            "linkedin_url": f"http://www.linkedin.com/in/{primeiro.lower()}", "photo_url": "https://x/foto.jpg",
            "organization": {"id": "org" + id_, "name": empresa, "primary_domain": dominio,
                             "website_url": f"http://www.{dominio}"}}


def preparar(conn, tmp_path):
    arq = tmp_path / "contas.csv"
    arq.write_text(
        "id_conta,empresa,icp,site,pessoa_p1,cargo_p1,pessoa_p2,cargo_p2,pessoa_p3,cargo_p3\n"
        "T-9,Alfa Tech,Tecnologia B2B,alfatech.com.br,Carla Mendes,CEO,Rui Prado,Head de Marketing,Lia Souto,Analista de CRM\n"
        "F-9,Gama Seguros,Financeiro regional,,,,,,,\n",
        encoding="utf-8",
    )
    importador.importar(conn, importador.ler(arq))
    aliases.gerar(conn)


def fonte(pasta, match=None, busca=None):
    pasta.mkdir(exist_ok=True)
    if match is not None:
        (pasta / "T-9_match.json").write_text(json.dumps(match), encoding="utf-8")
    (pasta / "T-9_busca.json").write_text(json.dumps(busca if busca is not None else {"_status": 403}), encoding="utf-8")
    return pasta


def rodar(conn, pasta, hoje=HOJE, **kw):
    tela = []
    http = ClienteLocal(str(pasta))
    c = ConectorApollo(conn, http=http, hoje=hoje, saida=tela.append, **kw)
    ex = c.executar(selecionar_contas(conn))
    return ex, c, http, "\n".join(tela)


PRIMEIRA = {"status": "success", "credits_consumed": 2, "matches": [
    pessoa_apollo("a1", "Carla Mendes", "CEO", "Alfa Tech", "alfatech.com.br"),
    pessoa_apollo("a2", "Rui Prado", "CMO", "Beta Pagamentos", "betapag.com.br"),  # mudou de empresa
    None,  # Lia não encontrada
]}


def test_primeira_coleta_acusa_quem_saiu_sem_pedir_nem_guardar_contato(conn, tmp_path):
    preparar(conn, tmp_path)
    ex, c, http, tela = rodar(conn, fonte(tmp_path / "f1", PRIMEIRA))
    assert ex.itens == 1 and ex.erros == [] and c.creditos == 2
    assert "F-9 Gama Seguros: pulada (sem pessoas no comitê e sem domínio)" in tela
    assert "busca de cargos-alvo indisponível no seu plano" in tela
    assert "créditos do Apollo gastos nesta execução: 2 (teto 25)" in tela

    url, corpo = next(p for p in http.pedidos if "bulk_match" in p[0])
    assert "reveal_personal_emails=false" in url and "reveal_phone_number=false" in url
    assert corpo["reveal_personal_emails"] is False and corpo["reveal_phone_number"] is False
    assert corpo["details"][0] == {"first_name": "Carla", "last_name": "Mendes", "organization_name": "Alfa Tech",
                                   "domain": "alfatech.com.br"}

    s = conn.execute("select * from sinais").fetchone()
    assert (s["tipo"], s["membro_comite"], s["confianca"]) == ("membro_mudou_de_empresa", "influenciador", 0.8)
    assert "Rui Prado (influenciador) agora está em Beta Pagamentos como CMO" in conn.execute("select titulo from itens_brutos").fetchone()[0]
    rui = conn.execute("select * from pessoas where nome = 'Rui Prado'").fetchone()
    assert (rui["apollo_id"], rui["cargo"]) == ("a2", "Head de Marketing")  # cargo na Beta não vira cargo na Alfa

    # Nada de e-mail, telefone ou LinkedIn em lugar nenhum do banco.
    tudo = json.dumps([list(r) for t in ("snapshots", "itens_brutos", "sinais", "pessoas") for r in conn.execute(f"select * from {t}")])
    assert "@" not in tudo and "linkedin" not in tudo and "foto" not in tudo


def test_intervalo_economiza_credito_e_depois_consulta_pelo_id(conn, tmp_path):
    preparar(conn, tmp_path)
    rodar(conn, fonte(tmp_path / "f1", PRIMEIRA))
    ex, c, http, tela = rodar(conn, fonte(tmp_path / "f1", PRIMEIRA))  # mesma semana
    assert c.creditos == 0 and not any("bulk_match" in u for u, _ in http.pedidos)
    assert "comitê já atualizado (0 créditos)" in tela

    depois = {"credits_consumed": 3, "matches": [
        pessoa_apollo("a1", "Carla Mendes", "Presidente", "Alfa Tech", "alfatech.com.br"),
        pessoa_apollo("a2", "Rui Prado", "CMO", "Beta Pagamentos", "betapag.com.br"),
        None]}
    busca = {"people": [{"id": "b1", "first_name": "Davi", "last_name_obfuscated": "Ro***s", "title": "Head of Growth"}]}
    ex, c, http, tela = rodar(conn, fonte(tmp_path / "f2", depois, busca), hoje=date(2026, 10, 30))
    _, corpo = next(p for p in http.pedidos if "bulk_match" in p[0])
    assert corpo["details"][:2] == [{"id": "a1"}, {"id": "a2"}]  # agora vai direto pelo id
    tipos = sorted(r[0] for r in conn.execute("select tipo from sinais"))
    assert tipos == ["membro_mudou_de_cargo", "membro_mudou_de_empresa"]  # Rui não é acusado de novo
    assert "linha de base: 1 pessoa(s) em cargos-alvo" in tela

    # Próxima coleta: surge alguém novo num cargo-alvo.
    busca2 = {"people": busca["people"] + [{"id": "b2", "first_name": "Eva", "last_name_obfuscated": "Li***a", "title": "RevOps Manager"}]}
    ex, c, http, tela = rodar(conn, fonte(tmp_path / "f3", depois, busca2), hoje=date(2026, 11, 6))
    nova = conn.execute("select * from sinais where tipo = 'pessoa_nova_cargo_alvo'").fetchall()
    assert len(nova) == 1 and nova[0]["evidencia_trecho"] == "Apollo: Eva Li***a, RevOps Manager, na Alfa Tech"


def test_teto_de_creditos_prioriza_decisores(conn, tmp_path, monkeypatch):
    preparar(conn, tmp_path)
    monkeypatch.setenv("RADAR_APOLLO_MAX_CREDITOS", "1")
    um = {"credits_consumed": 1, "matches": [pessoa_apollo("a1", "Carla Mendes", "CEO", "Alfa Tech", "alfatech.com.br")]}
    ex, c, http, tela = rodar(conn, fonte(tmp_path / "f1", um))
    _, corpo = next(p for p in http.pedidos if "bulk_match" in p[0])
    assert [d["first_name"] for d in corpo["details"]] == ["Carla"] and c.creditos == 1
    assert "teto de 1 créditos: 2 pessoa(s) ficam para a próxima" in tela


def test_dry_run_estima_creditos_sem_gastar_nem_gravar(conn, tmp_path):
    preparar(conn, tmp_path)
    ex, c, http, tela = rodar(conn, fonte(tmp_path / "f1", PRIMEIRA), dry_run=True)
    assert not any("bulk_match" in u for u, _ in http.pedidos)
    assert "(simulado) consultaria 3 pessoa(s): Carla Mendes, Rui Prado, Lia Souto" in tela
    assert "créditos do Apollo seriam gastos nesta execução: 3" in tela
    for tabela in ("sinais", "itens_brutos", "snapshots", "execucoes"):
        assert conn.execute(f"select count(*) from {tabela}").fetchone()[0] == 0


def test_sem_chave_nao_roda(conn, tmp_path, monkeypatch):
    preparar(conn, tmp_path)
    monkeypatch.delenv("APOLLO_API_KEY", raising=False)
    tela = []
    ConectorApollo(conn, saida=tela.append).executar(selecionar_contas(conn, ids=["T-9"]))
    assert any("pulada (sem APOLLO_API_KEY no .env)" in l for l in tela)


def test_plano_sem_api_para_na_primeira_conta(conn, tmp_path):
    preparar(conn, tmp_path)
    arq = tmp_path / "mais.csv"
    arq.write_text("id_conta,empresa,site,pessoa_p1,cargo_p1\nT-8,Beta Tech,betatech.com.br,Ana Lima,CEO\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    pasta = fonte(tmp_path / "f1", {"_status": 403})
    (pasta / "T-8_match.json").write_text('{"_status": 403}', encoding="utf-8")
    ex, c, http, tela = rodar(conn, pasta)
    assert len(ex.erros) == 1 and "Nenhum crédito foi gasto" in ex.erros[0]
    assert "pulada (o Apollo recusou a API neste plano" in tela
    assert sum("bulk_match" in u for u, _ in http.pedidos) == 1
