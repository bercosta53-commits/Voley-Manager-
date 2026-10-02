import json
from datetime import date
from types import SimpleNamespace

import pytest

from abm import aliases, classificador, importador
from abm.classificador import ClassificadorClaude, ClassificadorRegras, classificar, validar
from abm.conectores.base import Item, selecionar_contas
from abm.conectores.cnpj import ConectorCNPJ
from abm.conectores.http import ClienteLocal
from abm.conectores.noticias import ConectorNoticias
from abm.score import pontuar, valor
from abm.taxonomia import TaxonomiaInvalida, carregar

from conftest import FIX, RAIZ

TAX = carregar(RAIZ / "sinais.yaml")


def preparar(conn, tmp_path):
    arq = tmp_path / "contas.csv"
    arq.write_text("id_conta,empresa,icp,tier\nF-003,Junto Seguros,Financeiro regional,A\n"
                   "F-002,Cresol Confederação,Financeiro regional,A\n", encoding="utf-8")
    importador.importar(conn, importador.ler(arq))
    aliases.gerar(conn)
    aliases.adicionar(conn, "F-002", "Cresol")
    ConectorNoticias(conn, http=ClienteLocal(str(FIX / "noticias")), hoje=date(2026, 9, 25), saida=lambda _: None).executar(
        selecionar_contas(conn))
    return {r["titulo"]: dict(r) for r in conn.execute("select * from itens_brutos")}


class ClienteFalso:
    """Imita client.beta.messages.create: devolve respostas prontas por conta e guarda os pedidos."""

    def __init__(self, por_conta: dict, stop_reason="end_turn"):
        self.por_conta, self.stop_reason, self.pedidos = por_conta, stop_reason, []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.pedidos.append(kw)
        conta = json.loads(kw["messages"][0]["content"].split("\n")[1])["nome_fantasia"]
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=json.dumps({"itens": self.por_conta.get(conta, [])}))])


def d(id_, tipo="nenhum", relevante=True, conf=0.9, trecho="", mesmo="", empresa=True, motivo="nenhum", porque="Porque sim."):
    return {"id": id_, "empresa_certa": empresa, "relevante": relevante, "motivo_ruido": motivo, "tipo": tipo, "confianca": conf,
            "membro_comite": "influenciador", "por_que_agora": porque, "trecho": trecho, "mesmo_fato_que": mesmo}


def test_taxonomia_valida_e_ajustes_por_braco(tmp_path):
    assert TAX.limiar_confianca == 0.6 and len(TAX.tipos) >= 20
    assert TAX.tipo("socio_entrou", "servicos_profissionais").peso == 8 and TAX.tipo("socio_entrou", "tecnologia").peso == 7
    assert "rodada_investimento" not in {t.id for t in TAX.tipos_para("servicos_financeiros")}
    ruim = tmp_path / "ruim.yaml"
    ruim.write_text("tipos:\n  x:\n    braco_icp: [agro]\n    peso: 11\n    meia_vida_dias: 0\n    membro_comite: chefe\n", encoding="utf-8")
    with pytest.raises(TaxonomiaInvalida) as e:
        carregar(ruim)
    msg = str(e.value)
    assert "braço 'agro'" in msg and "peso deve ser" in msg and "meia_vida_dias" in msg and "membro_comite" in msg and "angulo_sugerido" in msg


def test_regras_em_noticias_reais_nunca_criam_alerta(conn, tmp_path):
    preparar(conn, tmp_path)
    res = classificar(conn, ClassificadorRegras(), TAX, saida=lambda _: None)
    assert (res.itens, res.alertas, res.revisar, res.ruido) == (15, 0, 6, 9)
    motivos = dict(conn.execute("select titulo, classificacao_motivo from itens_brutos").fetchall())
    assert motivos["Copa LNF Cresol decide os dois finalistas da temporada nesta semana; veja todos os jogos das semifinais"] == "patrocinio_evento"
    assert motivos["Cresol é eleita a melhor empresa para trabalhar no Paraná"] == "premio_ranking"
    assert conn.execute("select count(*) from itens_brutos where classificacao is null").fetchone()[0] == 0


def test_claude_valida_evidencia_junta_mesmo_fato_e_aplica_limiar(conn, tmp_path, monkeypatch):
    itens = preparar(conn, tmp_path)
    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-opus-5")
    class Prefixo(dict):
        def __getitem__(self, inicio):
            return next(v["id"] for t, v in itens.items() if t.startswith(inicio))

    i = Prefixo()
    ia_itforum = i["Junto Seguros lança IA para corretores em"]
    ia_gazeta = i["Junto Seguros lança agentes de IA para em"]
    cliente = ClienteFalso({"Junto Seguros": [
        d(i["Junto Seguros lança Seguro D&O e amplia p"], "novo_produto", conf=0.92, trecho="lança Seguro D&O",
          porque="Produto D&O novo precisa de adoção entre corretores agora."),
        d(ia_itforum, "novo_produto", conf=0.85, trecho="lança IA para corretores"),
        d(ia_gazeta, "novo_produto", conf=0.8, trecho="agentes de IA", mesmo=ia_itforum),       # mesmo fato
        d(i["Junto Seguros usa IA agêntica com AWS"], "expansao_negocio", conf=0.62, trecho="trecho que não existe"),  # evidência inventada
        d(i["Junto Seguros alcança 90% de automação e"], "rodada_investimento", conf=0.9),       # tipo de outro braço
    ], "Cresol Confederação": [
        d(i["Copa LNF Cresol decide os dois finalistas"], relevante=False, motivo="patrocinio_evento"),
        d(i["BRDE e Cresol negociam aperfeiçoamento de"], "expansao_negocio", conf=0.55, trecho="parceria de crédito"),
        d(i["Cresol reinaugura Sala de Negócios e ampl"], "expansao_rede", conf=0.7, empresa=False, relevante=False, motivo="outra_empresa"),
    ]})
    tela = []
    res = classificar(conn, ClassificadorClaude(client=cliente), TAX, saida=tela.append)
    kw = cliente.pedidos[0]
    assert kw["model"] == "claude-opus-5" and kw["fallbacks"] == "default" and kw["betas"] == ["server-side-fallback-2026-07-01"]
    tipos_enviados = kw["output_config"]["format"]["schema"]["properties"]["itens"]["items"]["properties"]["tipo"]["enum"]
    assert "troca_diretoria" in tipos_enviados and "rodada_investimento" not in tipos_enviados

    sinais = {r["tipo"] + ":" + r["evidencia_trecho"]: dict(r) for r in conn.execute("select * from sinais")}
    do = sinais["novo_produto:lança Seguro D&O"]
    assert (do["status"], do["peso"], do["membro_comite"]) == ("alerta", 7, "influenciador")
    assert do["por_que_agora"] == "Produto D&O novo precisa de adoção entre corretores agora."
    assert do["angulo"].startswith("Produto novo precisa de adoção") and do["classificador"] == "claude:claude-opus-5"
    # IT Forum e Gazeta: um sinal só, a outra notícia fica como duplicada.
    assert len([s for s in sinais if s.startswith("novo_produto")]) == 2
    assert conn.execute("select classificacao from itens_brutos where id = ?", (ia_gazeta,)).fetchone()[0] == "duplicado"
    # Evidência inventada: entra o título e a confiança cai 0,15 (0,62 -> 0,47): vai para revisar.
    aws = next(s for s in sinais.values() if s["tipo"] == "expansao_negocio" and "AWS" in s["evidencia_trecho"])
    assert (aws["status"], aws["confianca"]) == ("revisar", 0.47)
    assert sinais["expansao_negocio:parceria de crédito"]["status"] == "revisar"  # 0,55 < 0,6
    estados = dict(conn.execute("select titulo, classificacao from itens_brutos where classificacao in ('ruido','outra_empresa')").fetchall())
    assert estados["Cresol reinaugura Sala de Negócios e amplia presença em Monte Carmelo (MG)"] == "outra_empresa"
    assert estados["Junto Seguros alcança 90% de automação em análises de crédito e reduz tempo de modernização de sistemas legados pela metade"] == "ruido"
    assert (res.alertas, res.revisar) == (2, 2)

    # As 7 notícias da Cresol que o modelo não devolveu ficam pendentes, para a próxima rodada.
    assert res.pendentes == 7 and any("7 notícia(s) sem resposta do modelo" in l for l in tela)
    assert conn.execute("select count(*) from itens_brutos where classificacao is null").fetchone()[0] == 7


def test_evento_que_ja_tinha_sinal_nao_gera_outro(conn, tmp_path):
    itens = preparar(conn, tmp_path)
    alvo = next(v for t, v in itens.items() if t.startswith("Junto Seguros lança Seguro D&O"))
    conn.execute("insert into sinais (id, conta_id, tipo, evento_id, status) values ('s0', 'F-003', 'novo_produto', ?, 'alerta')",
                 (alvo["evento_id"],))
    conn.commit()
    cliente = ClienteFalso({"Junto Seguros": [d(alvo["id"], "novo_produto", trecho="lança Seguro D&O")]})
    res = classificar(conn, ClassificadorClaude(client=cliente, modelo="claude-sonnet-5"), TAX, contas=["F-003"], saida=lambda _: None)
    assert res.duplicados == 1 and conn.execute("select count(*) from sinais").fetchone()[0] == 1
    assert "fallbacks" not in cliente.pedidos[0]  # modelo sem recuperação automática: parâmetro não vai


def test_recusa_e_dry_run_nao_gravam(conn, tmp_path):
    preparar(conn, tmp_path)
    tela = []
    res = classificar(conn, ClassificadorClaude(client=ClienteFalso({}, stop_reason="refusal")), TAX, saida=tela.append)
    assert len(res.falhas) == 2 and "recusou" in res.falhas[0]
    cliente = ClienteFalso({})
    classificar(conn, ClassificadorClaude(client=cliente), TAX, dry_run=True, saida=tela.append)
    assert cliente.pedidos == [] and any("enviaria 5 notícia(s) ao Claude em 1 chamada(s)" in l for l in tela)
    assert conn.execute("select count(*) from itens_brutos where classificacao is null").fetchone()[0] == 15
    assert conn.execute("select count(*) from sinais").fetchone()[0] == 0


def test_validar_descarta_tipo_inventado():
    item = {"id": "1", "titulo": "Alfa capta R$ 10 milhões", "trecho": ""}
    v = validar(item, d("1", "tipo_que_nao_existe", trecho="capta"), TAX, "tecnologia", {"1"}, "x")
    assert v.relevante is False and "fora da taxonomia" in v.motivo
    v = validar(item, d("1", "rodada_investimento", conf=1.7, trecho="capta R$ 10 milhões"), TAX, "tecnologia", {"1"}, "x")
    assert (v.relevante, v.confianca, v.trecho) == (True, 1.0, "capta R$ 10 milhões")


def test_sinais_de_conectores_ganham_peso_e_o_score_decai(conn, tmp_path, monkeypatch):
    preparar(conn, tmp_path)
    conn.execute("update contas set cnpj = '91586982000109', cnpj_raiz = '91586982' where id = 'F-003'")
    conn.commit()
    ConectorCNPJ(conn, http=ClienteLocal(str(FIX / "brasilapi")), hoje=date(2024, 12, 1), saida=lambda _: None).executar(
        selecionar_contas(conn, ids=["F-003"]))
    classificar(conn, ClassificadorRegras(), TAX, saida=lambda _: None)
    s = conn.execute("select * from sinais where tipo = 'socio_entrou'").fetchone()
    assert (s["peso"], s["classificador"]) == (7, "cnpj") and s["angulo"].startswith("Diretor novo na cooperativa")
    assert s["por_que_agora"].startswith("Entrada no quadro societário (Receita): QSA na Receita")

    assert valor(8, 1.0, 120, 120) == 4.0 and valor(8, 0.5, 0, 120) == 4.0 and valor(8, 1.0, -5, 120) == 8.0
    ranking = pontuar(conn, TAX, hoje=date(2024, 10, 27) + __import__("datetime").timedelta(days=120))
    assert [c.conta_id for c in ranking] == ["F-003"]  # sinais em "revisar" não contam
    assert ranking[0].score == pytest.approx(3.5)       # peso 7 × 1,0 × 0,5 (120 dias = uma meia-vida)

    # Editar o sinais.yaml muda o score sem mexer em código.
    outro = tmp_path / "sinais.yaml"
    outro.write_text((RAIZ / "sinais.yaml").read_text(encoding="utf-8").replace(
        "  socio_entrou:\n    rotulo: Entrada no quadro societário (Receita)\n    braco_icp: todos\n    peso: 7",
        "  socio_entrou:\n    rotulo: Entrada no quadro societário (Receita)\n    braco_icp: todos\n    peso: 10"), encoding="utf-8")
    assert pontuar(conn, carregar(outro), hoje=date(2025, 2, 24))[0].score == pytest.approx(5.0)
