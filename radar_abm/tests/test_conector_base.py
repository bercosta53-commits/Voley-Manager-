import io
import urllib.error

import pytest

from abm import importador
from abm.conectores.base import Conector, Item, selecionar_contas
from abm.conectores.http import ClienteHTTP, ErroHTTP

from conftest import FIX


class Resposta(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def erro(codigo, retry_after=None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return urllib.error.HTTPError("https://fonte.test/x", codigo, "erro", headers, None)


def cliente(respostas):
    """Cliente HTTP falso: cada chamada devolve (ou levanta) o próximo item da lista."""
    esperas = []
    fila = list(respostas)

    def abrir(pedido, timeout):
        assert timeout == 20.0
        r = fila.pop(0)
        if isinstance(r, Exception):
            raise r
        return Resposta(r)

    relogio = iter(range(0, 10_000, 10))
    return ClienteHTTP(abrir=abrir, dormir=esperas.append, relogio=lambda: next(relogio)), esperas


def test_http_repete_com_backoff_e_respeita_retry_after():
    c, esperas = cliente([erro(503), erro(429, "30"), urllib.error.URLError("sem rede"), b'{"ok": true}'])
    assert c.get_json("https://fonte.test/x") == {"ok": True}
    assert esperas == [2.0, 30.0, 60.0] and c.chamadas == 4


def test_http_nao_repete_erro_definitivo_e_desiste_depois_do_limite():
    c, esperas = cliente([erro(404)])
    with pytest.raises(ErroHTTP) as e:
        c.get("https://fonte.test/x")
    assert e.value.status == 404 and esperas == []
    c, esperas = cliente([erro(500)] * 4)
    with pytest.raises(ErroHTTP, match="depois de 4 tentativas"):
        c.get("https://fonte.test/x")
    assert esperas == [2.0, 4.0, 8.0]


def test_http_intervalo_minimo_entre_chamadas_ao_mesmo_site():
    esperas = []
    tempo = iter([0.0, 0.3, 0.3])
    c = ClienteHTTP(abrir=lambda p, timeout: Resposta(b"x"), dormir=esperas.append, relogio=lambda: next(tempo))
    c.get("https://a.test/1")
    c.get("https://a.test/2")
    assert esperas == [pytest.approx(0.7)]


class ConectorFalso(Conector):
    """Fonte de mentira: devolve os sócios de um dicionário e acusa quem entrou."""

    nome = "falso"

    def __init__(self, conn, fonte, **kw):
        super().__init__(conn, **kw)
        self.fonte = fonte

    def pode_rodar(self, conta):
        return "" if conta["cnpj"] else "sem CNPJ"

    def buscar(self, conta):
        if conta["id"] not in self.fonte:
            raise RuntimeError("fonte fora do ar")
        return {"socios": self.fonte[conta["id"]]}

    def traduzir(self, resposta_bruta):
        return {"socios": sorted(resposta_bruta["socios"])}

    def comparar(self, novo, snapshot_anterior):
        antes = set(snapshot_anterior["socios"]) if snapshot_anterior else set()
        return [Item(self.conta["id"], "novo_socio", f"{s} entrou") for s in novo["socios"] if s not in antes]

    def entregar(self, itens):
        return sum(self.gravar_item_bruto(i) for i in itens)


def test_conector_percorre_os_quatro_passos_compara_e_registra(conn, tmp_path):
    importador.importar(conn, importador.ler(FIX / "contas_exemplo.csv"))
    tela = []
    contas = selecionar_contas(conn)
    ex = ConectorFalso(conn, {"A-001": ["Ana"]}, saida=tela.append).executar(contas)
    assert ex.itens == 1 and ex.erros == []
    assert any("pulada (sem CNPJ)" in l for l in tela)
    assert any("1. BUSCA" in l for l in tela) and any("4. ENTREGA  1 item" in l for l in tela)

    # Segunda coleta: só o sócio novo aparece, graças à foto anterior.
    ex = ConectorFalso(conn, {"A-001": ["Ana", "Beto"]}, saida=tela.append).executar(contas)
    assert ex.itens == 1
    assert [r[0] for r in conn.execute("select titulo from itens_brutos order by titulo")] == ["Ana entrou", "Beto entrou"]
    assert conn.execute("select count(*) from snapshots").fetchone()[0] == 2
    assert conn.execute("select count(*) from execucoes").fetchone()[0] == 2
    assert "fim: 1 itens" in (tmp_path / "logs" / "radar.log").read_text(encoding="utf-8")


def test_dry_run_mostra_mas_nao_grava_e_erro_nao_para_a_coleta(conn):
    importador.importar(conn, importador.ler(FIX / "contas_exemplo.csv"))
    conn.execute("update contas set cnpj = '33000167000101', cnpj_raiz = '33000167' where id = 'F-001'")
    conn.commit()
    tela = []
    ex = ConectorFalso(conn, {"A-001": ["Ana"]}, dry_run=True, saida=tela.append).executar(selecionar_contas(conn))
    assert ex.itens == 1 and ex.erros == ["F-001: fonte fora do ar"]
    assert any("(simulado) gravaria 1 item" in l for l in tela) and any("DRY-RUN" in l for l in tela)
    for tabela in ("itens_brutos", "snapshots", "execucoes"):
        assert conn.execute(f"select count(*) from {tabela}").fetchone()[0] == 0
