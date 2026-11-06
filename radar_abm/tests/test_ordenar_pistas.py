import json
from types import SimpleNamespace

from abm import ordenar_pistas, pistas
from abm.ordenar_pistas import OrdenadorClaude, aplicar, ordenar
from abm.taxonomia import carregar

from conftest import RAIZ
from test_pistas import ARQ, preparar

TAX = carregar(RAIZ / "sinais.yaml")


class ClienteFalso:
    """Imita client.beta.messages.create: responde por pista (chave = título do anúncio) e guarda os pedidos."""

    def __init__(self, por_titulo: dict, stop_reason="end_turn"):
        self.por_titulo, self.stop_reason, self.pedidos = por_titulo, stop_reason, []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.pedidos.append(kw)
        anuncio = json.loads(kw["messages"][0]["content"].split("\n")[1])
        resposta = self.por_titulo.get(anuncio["titulo"], {"candidatas": [], "observacao": ""})
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=json.dumps(resposta))])


def importar(conn, tmp_path):
    preparar(conn, tmp_path)
    conn.execute("""update contas set contexto_json = ? where id = 'F-003'""", (json.dumps({
        "faixa_porte": "Mais de 2 milhões de apólices e R$ 1 bilhão em prêmios", "gatilho_recente": "Prêmios cresceram 26% em 2025"}),))
    conn.commit()
    pistas.importar(conn, pistas.ler_arquivo(ARQ), TAX, saida=lambda _: None)
    return {p["titulo"]: dict(p) for p in conn.execute("select * from pistas_vagas where status = 'aberta'")}


def test_claude_reordena_explica_e_sugere(conn, tmp_path):
    abertas = importar(conn, tmp_path)
    cliente = ClienteFalso({
        "Gerente de Marketing": {"candidatas": [
            {"conta_id": "F-050", "probabilidade": 0.05, "motivo": "Consórcios, não seguro garantia."},
            {"conta_id": "F-003", "probabilidade": 0.82, "motivo": "Anúncio: seguradora de seguro garantia em crescimento; conta: seguro garantia, prêmios +26%."},
            {"conta_id": "X-999", "probabilidade": 0.9, "motivo": "conta inventada"}], "observacao": "Só uma seguradora de garantia em Curitiba."},
        "Coordenador Comercial": {"candidatas": [
            {"conta_id": "A-001", "probabilidade": 0.2, "motivo": "Nada distingue."},
            {"conta_id": "A-002", "probabilidade": 1.7, "motivo": "Grande porte full service."}], "observacao": ""},
    })
    tela = []
    res = ordenar(conn, OrdenadorClaude(client=cliente, modelo="claude-opus-5"), saida=tela.append)
    assert (res.ordenadas, res.sugestoes, res.puladas) == (2, 2, 1)  # a pista da cooperativa tem 1 candidata só: nada a ordenar
    kw = cliente.pedidos[0]
    assert kw["fallbacks"] == "default" and kw["output_config"]["format"]["type"] == "json_schema"
    enviado = kw["messages"][0]["content"]
    assert "Nosso cliente é uma seguradora nacional" in enviado and "R$ 1 bilhão em prêmios" in enviado  # anúncio + contexto
    ids_permitidos = kw["output_config"]["format"]["schema"]["properties"]["candidatas"]["items"]["properties"]["conta_id"]["enum"]
    assert sorted(ids_permitidos) == ["F-003", "F-050"]

    p = conn.execute("select * from pistas_vagas where id = ?", (abertas["Gerente de Marketing"]["id"],)).fetchone()
    cands = json.loads(p["candidatos_json"])
    assert [(c["conta_id"], c["prob"]) for c in cands] == [("F-003", 0.82), ("F-050", 0.05)]  # conta inventada ignorada
    assert cands[0]["motivo_ia"].startswith("Anúncio: seguradora") and p["sugestao_conta"] == "F-003"
    assert p["ordenado_por"] == "claude:claude-opus-5"
    adv = json.loads(conn.execute("select candidatos_json from pistas_vagas where id = ?",
                                  (abertas["Coordenador Comercial"]["id"],)).fetchone()[0])
    assert adv[0]["prob"] == 1.0  # probabilidade fora de 0 a 1 é ajustada
    assert any("<- sugestão" in l for l in tela)
    # A pista continua aberta: só você atribui.
    assert conn.execute("select count(*) from pistas_vagas where status = 'aberta'").fetchone()[0] == 3

    # Rodar de novo não repete o que já foi ordenado.
    assert ordenar(conn, OrdenadorClaude(client=cliente), saida=lambda _: None).ordenadas == 0


def test_sem_destaque_nao_sugere_e_quem_nao_foi_avaliada_vai_para_o_fim():
    cands = [{"conta_id": "A", "nome": "Alfa", "pontos": 6}, {"conta_id": "B", "nome": "Beta", "pontos": 3},
             {"conta_id": "C", "nome": "Gama", "pontos": 6}]
    novas, sugestao = aplicar(cands, {"candidatas": [{"conta_id": "B", "probabilidade": 0.55, "motivo": "x"},
                                                     {"conta_id": "A", "probabilidade": 0.4, "motivo": "y"}]})
    assert [c["conta_id"] for c in novas] == ["B", "A", "C"] and sugestao is None  # 0,55 < 0,7
    assert "prob" not in novas[2]


def test_recusa_e_dry_run_nao_mexem_na_pista(conn, tmp_path):
    importar(conn, tmp_path)
    antes = {r[0]: r[1] for r in conn.execute("select id, candidatos_json from pistas_vagas")}
    res = ordenar(conn, OrdenadorClaude(client=ClienteFalso({}, stop_reason="refusal")), saida=lambda _: None)
    assert len(res.falhas) == 2 and "recusou" in res.falhas[0]
    cliente = ClienteFalso({})
    ordenar(conn, OrdenadorClaude(client=cliente), dry_run=True, saida=lambda _: None)
    assert cliente.pedidos == []
    assert {r[0]: r[1] for r in conn.execute("select id, candidatos_json from pistas_vagas")} == antes
    assert conn.execute("select count(*) from pistas_vagas where ordenado_em is not null").fetchone()[0] == 0
