"""Score da conta: soma dos sinais em alerta, cada um valendo menos com o tempo (decaimento pela meia-vida).

valor de um sinal = peso × confiança × 0,5 ^ (idade em dias / meia-vida em dias)

Ex.: entrada de sócio (peso 8, meia-vida 120) com confiança 1,0 vale 8 no dia, 4 depois de 120 dias e 2
depois de 240. Peso e meia-vida vêm do sinais.yaml na hora do cálculo: editar o arquivo muda o score.
Sinais em "revisar" não contam até você aprovar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from .taxonomia import Taxonomia


@dataclass
class Parcela:
    sinal_id: str
    tipo: str
    valor: float
    peso: int
    confianca: float
    idade_dias: int
    meia_vida_dias: int


@dataclass
class ScoreConta:
    conta_id: str
    nome: str
    tier: str | None
    braco_icp: str | None
    score: float = 0.0
    parcelas: list[Parcela] = field(default_factory=list)


def valor(peso: int, confianca: float, idade_dias: int, meia_vida_dias: int) -> float:
    return peso * confianca * 0.5 ** (max(idade_dias, 0) / meia_vida_dias)


def pontuar(conn, taxonomia: Taxonomia, hoje: date | None = None, ate: date | None = None) -> list[ScoreConta]:
    """Score de cada conta com ao menos um sinal em alerta. `ate` ignora sinais alertados depois dessa data."""
    hoje = hoje or date.today()
    contas: dict[str, ScoreConta] = {}
    for s in conn.execute(
        """select s.*, c.nome_fantasia, c.tier, c.braco_icp from sinais s join contas c on c.id = s.conta_id
           where s.status = 'alerta'"""
    ):
        alertado = date.fromisoformat(s["data_alerta"][:10]) if s["data_alerta"] else hoje
        if ate and alertado > ate:
            continue
        tipo = taxonomia.tipo(s["tipo"], s["braco_icp"])
        peso = tipo.peso if tipo else (s["peso"] or 1)
        meia = tipo.meia_vida_dias if tipo else 90
        fato = date.fromisoformat(s["data_fato"][:10]) if s["data_fato"] else alertado
        idade = (hoje - fato).days
        c = contas.setdefault(s["conta_id"], ScoreConta(s["conta_id"], s["nome_fantasia"], s["tier"], s["braco_icp"]))
        v = valor(peso, s["confianca"] if s["confianca"] is not None else 1.0, idade, meia)
        c.parcelas.append(Parcela(s["id"], s["tipo"], round(v, 2), peso, s["confianca"] or 0, idade, meia))
        c.score += v
    for c in contas.values():
        c.score = round(c.score, 2)
        c.parcelas.sort(key=lambda p: -p.valor)
    return sorted(contas.values(), key=lambda c: -c.score)
