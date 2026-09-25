"""Feedback sobre sinais e métricas do radar.

Feedback: `util` ou `ruido` para um sinal.
- `util` confirma o sinal: a confiança vira 1,0 (confirmado por uma pessoa). Num sinal em "revisar",
  aprova: ele vira alerta e passa a contar no score.
- `ruido` descarta o sinal: ele sai do score.
Vale a última avaliação de cada sinal.

Métricas:
- precisão: % dos sinais avaliados que foram úteis (geral e por conector);
- latência: dias entre o fato e o alerta (mediana e média, por conector);
- volume: sinais por conector e por status, notícias por classificação, execuções e erros.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, timedelta

from .db import agora


class SinalNaoEncontrado(ValueError):
    pass


def registrar_feedback(conn, sinal_id: str, avaliacao: str, comentario: str = "") -> str:
    """Grava a avaliação e devolve o novo status do sinal."""
    s = conn.execute("select status from sinais where id = ?", (sinal_id,)).fetchone()
    if s is None:
        raise SinalNaoEncontrado(f"sinal {sinal_id} não encontrado (veja os IDs no digest ou em: python manager.py sinais)")
    conn.execute("insert into feedback (sinal_id, avaliacao, comentario, data) values (?, ?, ?, ?)",
                 (sinal_id, avaliacao, comentario or None, agora()))
    status = s["status"]
    if avaliacao == "ruido":
        status = "descartado"
    else:
        conn.execute("update sinais set confianca = 1.0 where id = ?", (sinal_id,))
    if avaliacao == "util" and status != "alerta":
        status = "alerta"
        # A data do alerta passa a ser a da aprovação: é quando a conta esquentou de fato.
        conn.execute("update sinais set data_alerta = ? where id = ?", (agora(), sinal_id))
    conn.execute("update sinais set status = ? where id = ?", (status, sinal_id))
    conn.commit()
    return status


def conector_do_sinal(classificador: str | None) -> str:
    if not classificador:
        return "desconhecido"
    if classificador.startswith("claude") or classificador == "regras":
        return "noticias"
    return classificador


@dataclass
class Linha:
    conector: str
    sinais: int = 0
    alerta: int = 0
    revisar: int = 0
    descartado: int = 0
    avaliados: int = 0
    uteis: int = 0
    latencias: list[int] = field(default_factory=list)

    @property
    def precisao(self) -> float | None:
        return self.uteis / self.avaliados if self.avaliados else None


def calcular(conn, dias: int = 30, hoje: date | None = None) -> dict:
    hoje = hoje or date.today()
    desde = (hoje - timedelta(days=dias)).isoformat() if dias else "0000"
    ultima = {r["sinal_id"]: r["avaliacao"] for r in conn.execute("select sinal_id, avaliacao from feedback order by data")}
    linhas: dict[str, Linha] = {}
    for s in conn.execute("select * from sinais where substr(coalesce(data_alerta, ''), 1, 10) >= ?", (desde,)):
        ln = linhas.setdefault(conector_do_sinal(s["classificador"]), Linha(conector_do_sinal(s["classificador"])))
        ln.sinais += 1
        if s["status"] in ("alerta", "revisar", "descartado"):
            setattr(ln, s["status"], getattr(ln, s["status"]) + 1)
        if s["id"] in ultima:
            ln.avaliados += 1
            ln.uteis += ultima[s["id"]] == "util"
        if s["data_fato"] and s["data_alerta"]:
            ln.latencias.append((date.fromisoformat(s["data_alerta"][:10]) - date.fromisoformat(s["data_fato"][:10])).days)
    total = Linha("total")
    for ln in linhas.values():
        for campo in ("sinais", "alerta", "revisar", "descartado", "avaliados", "uteis"):
            setattr(total, campo, getattr(total, campo) + getattr(ln, campo))
        total.latencias += ln.latencias
    noticias = dict(conn.execute(
        """select coalesce(classificacao, 'pendente'), count(*) from itens_brutos
           where conector = 'noticias' and substr(data_coleta, 1, 10) >= ? group by 1""", (desde,)).fetchall())
    execucoes = conn.execute(
        """select conector, count(*) as rodadas, sum(itens) as itens, sum(erros) as erros from execucoes
           where substr(inicio, 1, 10) >= ? group by conector order by conector""", (desde,)).fetchall()
    try:
        custos = [dict(r) for r in conn.execute(
            """select provedor, count(*) as chamadas, round(sum(custo_usd), 2) as custo_usd from chamadas_provedor
               where substr(data, 1, 10) >= ? group by provedor order by provedor""", (desde,))]
    except Exception:  # banco antigo, sem a tabela de chamadas pagas
        custos = []
    return {"dias": dias, "linhas": sorted(linhas.values(), key=lambda l: l.conector), "total": total,
            "noticias": noticias, "execucoes": execucoes, "custos": custos}


def _pct(x: float | None) -> str:
    return "-" if x is None else f"{x:.0%}"


def _lat(valores: list[int]) -> str:
    if not valores:
        return "-"
    return f"mediana {statistics.median(valores):.0f}d, média {statistics.mean(valores):.1f}d"


def imprimir(m: dict, saida=print) -> None:
    periodo = f"últimos {m['dias']} dias" if m["dias"] else "todo o período"
    t = m["total"]
    saida(f"Métricas do radar ({periodo})")
    saida(f"  Precisão: {_pct(t.precisao)} de {t.avaliados} sinal(is) avaliado(s) foram úteis"
          + ("  (dê feedback: python manager.py feedback <id> util|ruido)" if t.avaliados < 10 else ""))
    saida(f"  Latência (fato até o alerta): {_lat(t.latencias)}")
    saida("")
    saida(f"  {'conector':<12} {'sinais':>6} {'alerta':>6} {'revisar':>7} {'descart.':>8} {'avaliados':>9} {'precisão':>8}  latência")
    for ln in m["linhas"]:
        saida(f"  {ln.conector:<12} {ln.sinais:>6} {ln.alerta:>6} {ln.revisar:>7} {ln.descartado:>8} {ln.avaliados:>9} "
              f"{_pct(ln.precisao):>8}  {_lat(ln.latencias)}")
    if m["noticias"]:
        saida("")
        saida("  Notícias coletadas por classificação: " + ", ".join(f"{k} {v}" for k, v in sorted(m["noticias"].items())))
    if m.get("custos"):
        saida("")
        saida("  Custo por provedor: " + "; ".join(f"{c['provedor']} {c['chamadas']} busca(s), cerca de US$ {c['custo_usd']:.2f}"
                                                 for c in m["custos"]))
    if m["execucoes"]:
        saida("")
        saida("  Execuções: " + "; ".join(f"{e['conector']} {e['rodadas']} rodada(s), {e['itens'] or 0} itens, "
                                          f"{e['erros'] or 0} erro(s)" for e in m["execucoes"]))
