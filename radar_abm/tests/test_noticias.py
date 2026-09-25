from datetime import date
from urllib.parse import unquote_plus

from abm import aliases, importador
from abm.conectores.base import selecionar_contas
from abm.conectores.http import ClienteLocal
from abm.conectores.noticias import URL, ConectorNoticias, palavras_chave, semelhanca

from conftest import FIX

PASTA = FIX / "noticias"
HOJE = date(2026, 9, 25)


def preparar(conn, tmp_path):
    arq = tmp_path / "contas.csv"
    arq.write_text(
        "id_conta,empresa,icp\n"
        "F-003,Junto Seguros,Financeiro regional\n"
        "T-001,Logcomex,Tecnologia B2B\n"
        "F-002,Cresol Confederação,Financeiro regional\n"
        "F-039,Cresol Central Brasil,Financeiro regional\n"
        "A-089,Pinheiro Guimarães,Escritórios de advocacia\n",
        encoding="utf-8",
    )
    importador.importar(conn, importador.ler(arq))
    aliases.gerar(conn)


def conector(conn, pasta=PASTA, hoje=HOJE, **kw):
    tela = []
    return ConectorNoticias(conn, http=ClienteLocal(str(pasta)), hoje=hoje, saida=tela.append, **kw), tela


def conta(conn, id_):
    return conn.execute("select * from contas where id = ?", (id_,)).fetchone()


def test_consulta_usa_aliases_ligados_contexto_e_negativos(conn, tmp_path):
    preparar(conn, tmp_path)
    c, _ = conector(conn)
    assert c.consulta(conta(conn, "F-003")) == '"Junto Seguros" when:30d'  # "Junto" é ambíguo: fica de fora
    # Escritório: nome de sobrenome exige palavra de contexto.
    assert c.consulta(conta(conn, "A-089")) == (
        '"Pinheiro Guimarães" (advogados OR advocacia OR escritório OR sócio OR sócia OR auditoria) when:30d')
    # Alias ambíguo aprovado por você: entra, mas com contexto do setor e com os termos negativos.
    aliases.adicionar(conn, "F-002", "Cresol", "futsal; corrida")
    q = c.consulta(conta(conn, "F-002"))
    assert q == ('("Cresol Confederação" OR "Cresol") (cooperativa OR seguros OR seguradora OR crédito OR consórcio OR banco)'
                 ' -"futsal" -"corrida" when:30d')
    url = URL.format(q=__import__("urllib.parse").parse.quote_plus(q))
    assert unquote_plus(url.split("q=")[1].split("&")[0]) == q and url.endswith("&hl=pt-BR&gl=BR&ceid=BR:pt-419")


def test_traduz_feed_real(conn, tmp_path):
    preparar(conn, tmp_path)
    c, _ = conector(conn)
    t = c.traduzir(c.buscar(conta(conn, "F-003")))
    assert len(t["noticias"]) == 10
    n = t["noticias"][0]
    assert n["titulo"] == "Junto Seguros lança Seguro D&O e amplia portfólio de soluções corporativas"
    assert (n["veiculo"], n["data"]) == ("SEGS Portal Nacional", "2026-09-21") and n["url"].startswith("https://news.google.com/")
    assert n["trecho"] == n["titulo"] + " | SEGS Portal Nacional de..."  # o RSS só traz a manchete


def test_filtra_ruido_agrupa_evento_e_nao_repete(conn, tmp_path):
    preparar(conn, tmp_path)
    c, tela = conector(conn)
    ex = c.executar(selecionar_contas(conn, ids=["F-003", "T-001"]))
    assert ex.itens == 5 and ex.erros == []
    texto = "\n".join(tela)
    assert "descartadas (não cita a empresa): 4" in texto and "Porto Seguro inclui óculos" in texto
    assert "descartadas (fora da janela): 1" in texto  # Bradesco, 03/08
    assert "descartadas (não cita a empresa): 5" in texto  # Logcomex: nenhuma manchete cita
    linhas = conn.execute("select titulo, veiculo, evento_id from itens_brutos order by data_publicacao").fetchall()
    eventos = {}
    for l in linhas:
        eventos.setdefault(l["evento_id"], []).append(l["veiculo"])
    # Limite conhecido: paráfrases do mesmo fato ("IA para corretores emitirem apólices" x "agentes de IA para
    # emissão de apólices") têm poucas palavras iguais e ficam em eventos separados; o classificador (fase 5) junta.
    assert len(linhas) == 5 and len(eventos) == 5

    # Segunda coleta com o mesmo feed: tudo já visto.
    c, tela = conector(conn)
    ex = c.executar(selecionar_contas(conn, ids=["F-003"]))
    assert ex.itens == 0 and "descartadas (já vista): 5" in "\n".join(tela)


def test_mesma_noticia_de_varios_veiculos_vira_um_evento(conn, tmp_path):
    preparar(conn, tmp_path)
    aliases.adicionar(conn, "F-002", "Cresol")
    c, _ = conector(conn)
    c.executar(selecionar_contas(conn, ids=["F-002"]))
    gptw = conn.execute("select veiculo, evento_id from itens_brutos where titulo like '%melhor empresa%'").fetchall()
    assert len(gptw) == 3 and len({g["evento_id"] for g in gptw}) == 1

    # Dias depois, outro veículo republica: entra no evento que já existe.
    pasta = tmp_path / "depois"
    pasta.mkdir()
    (pasta / "F-002.xml").write_text(
        '<rss><channel><item><title>Cresol é eleita melhor empresa para trabalhar no Paraná em 2026 - Bem Paraná</title>'
        '<link>https://news.google.com/rss/articles/novo1</link><pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate>'
        '<source url="https://bemparana.com.br">Bem Paraná</source></item></channel></rss>', encoding="utf-8")
    c, _ = conector(conn, pasta=pasta)
    c.executar(selecionar_contas(conn, ids=["F-002"]))
    novo = conn.execute("select evento_id from itens_brutos where veiculo = 'Bem Paraná'").fetchone()
    assert novo["evento_id"] == gptw[0]["evento_id"]


def test_termos_negativos_descartam_homonimos(conn, tmp_path):
    preparar(conn, tmp_path)
    conn.execute("update aliases set termos_negativos = 'Pequenas Criaturas; consultora; Galeria' where conta_id = 'A-089'")
    conn.commit()
    c, tela = conector(conn, hoje=date(2026, 8, 25))
    c.executar(selecionar_contas(conn, ids=["A-089"]))
    assert "descartadas (termo negativo): 3" in "\n".join(tela)
    assert conn.execute("select count(*) from itens_brutos").fetchone()[0] == 0


def test_dry_run_e_conta_sem_alias(conn, tmp_path):
    preparar(conn, tmp_path)
    conn.execute("update aliases set ativo = false where conta_id = 'T-001'")
    conn.commit()
    c, tela = conector(conn, dry_run=True)
    ex = c.executar(selecionar_contas(conn, ids=["F-003", "T-001"]))
    assert ex.itens == 5 and any("T-001 Logcomex: pulada (sem alias ligado)" in l for l in tela)
    assert any("1. BUSCA    Google News, consulta: \"Junto Seguros\" when:30d" in l for l in tela)
    for tabela in ("itens_brutos", "snapshots", "execucoes"):
        assert conn.execute(f"select count(*) from {tabela}").fetchone()[0] == 0


def test_semelhanca_de_titulos():
    ignorar = {"cresol"}
    a = palavras_chave("Cresol é eleita a melhor empresa para trabalhar no Paraná", ignorar)
    b = palavras_chave("Cresol é reconhecida como melhor empresa para trabalhar no Paraná pelo GPTW", ignorar)
    c = palavras_chave("Copa LNF Cresol decide os dois finalistas da temporada", ignorar)
    assert semelhanca(a, b) >= 0.5 > semelhanca(a, c)
