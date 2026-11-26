"""Modelos de agregação do VSCS para a calibração 3.3 (proposta, NÃO vigente).

Só funções puras sobre as intensidades ajustadas s (0–100) que o motor já grava em v2.contribuicoes. Nada aqui
lê ou escreve banco; o motor de produção (scripts/score_v2.py) não é tocado.

Modelos:
- atual(...)        3.0/3.2: 100·[1 − Π(1 − K·s/100)] + bônus discreto − maior penalidade, K = 0,5
- k_integral(...)   o mesmo com K = 1 (cenário C do documento do ChatGPT)
- curva_d(...)      K = 1 + curva por trechos (cenário D do documento), aplicada depois da penalidade, como lá
- dc(...)           RECOMENDADO: dominante + corroboração.
                    100·[1 − (1 − a·s₁/100)·Π_{j≥2}(1 − b·s_j/100)] − maior penalidade, sem bônus discreto.
                    a = peso do gatilho dominante (teto de um sinal sozinho = 100·a)
                    b = peso de cada evidência adicional (a correlação por categoria 1/0,7/0,5 já vem em s)
"""
from __future__ import annotations

from dataclasses import dataclass
from math import prod

NEGATIVO = "negativo"


@dataclass(frozen=True)
class Contrib:
    s: float
    categoria: str
    data: str = ""
    base: float = 0.0
    fonte: float = 1.0
    tempo: float = 1.0
    correlacao: float = 1.0
    tipo: str = ""
    texto: str = ""


def _positivos(cs: list[Contrib]) -> list[float]:
    return sorted((min(100.0, max(0.0, c.s)) for c in cs if c.categoria != NEGATIVO and c.s > 0), reverse=True)


def penalidade(cs: list[Contrib]) -> float:
    return max((c.s for c in cs if c.categoria == NEGATIVO), default=0.0)


def _limitar(v: float) -> float:
    return round(max(0.0, min(100.0, v)), 2)


def noisy_or(ss: list[float], k: float) -> float:
    return 100 * (1 - prod(1 - k * s / 100 for s in ss))


def atual(cs: list[Contrib], bonus: float = 0.0, k: float = 0.5) -> float:
    """Fórmula vigente: K·s em noisy-OR, bônus de convergência gravado pelo motor, menos a maior penalidade."""
    return _limitar(min(100.0, noisy_or(_positivos(cs), k) + bonus) - penalidade(cs))


def k_integral(cs: list[Contrib], bonus: float = 0.0) -> float:
    return atual(cs, bonus, k=1.0)


ANCORAS_D = [(0, 0), (20, 20), (40, 50), (60, 75), (80, 90), (90, 97), (100, 100)]


def curva(v: float, ancoras=ANCORAS_D) -> float:
    for (x, y), (z, w) in zip(ancoras, ancoras[1:]):
        if v <= z:
            return y + (v - x) * (w - y) / (z - x)
    return 100.0


def curva_d(cs: list[Contrib], bonus: float = 0.0) -> float:
    return _limitar(curva(k_integral(cs, bonus)))


A_PADRAO, B_PADRAO = 0.85, 0.60
MAX_CORROBORADORES = 2
NAO_CORROBORA = {"contexto"}  # presença em evento, palestra, prêmio: podem ser o gatilho, nunca somam como corroboração


def _pesos(cs: list[Contrib], a: float, b: float, maximo: int) -> list[float]:
    """Probabilidades parciais na ordem em que entram: o dominante (peso a) e até `maximo` corroboradores (peso b),
    só entre sinais que não são de contexto. Contexto entra sozinho (max de dois caminhos, abaixo), para a função
    continuar monotônica: um sinal de contexto que cresce nunca empurra o gatilho real para o papel de corroborador."""
    pos = sorted((min(100.0, c.s) for c in cs if c.categoria not in (NEGATIVO, *NAO_CORROBORA) and c.s > 0), reverse=True)
    if not pos:
        return []
    return [a * pos[0] / 100] + [b * s / 100 for s in pos[1:1 + maximo]]


def dc(cs: list[Contrib], a: float = A_PADRAO, b: float = B_PADRAO, maximo: int = MAX_CORROBORADORES) -> float:
    """Dominante + corroboração. Um sinal sozinho chega no máximo a 100·a (85): 90+ exige evidência independente
    e forte somada a um gatilho forte. Corroboram no máximo `maximo` sinais (os mais fortes), e sinal de contexto
    não corrobora: quem aparece muito na imprensa não sobe só por volume. Sem salto discreto (o bônus s ≥ 40 sai);
    a penalidade continua subtraída depois da agregação, na mesma escala de pontos.

        DC = max( 100·[1 − (1 − a·s₁/100)·Π_{j=2..1+maximo}(1 − b·s_j/100)],   sobre sinais que não são contexto
                  a · max(s de contexto) )
             − maior penalidade, limitado a [0, 100]
    """
    ps = _pesos(cs, a, b, maximo)
    principal = 100 * (1 - prod(1 - p for p in ps)) if ps else 0.0
    contexto = a * max((min(100.0, c.s) for c in cs if c.categoria in NAO_CORROBORA and c.s > 0), default=0.0)
    return _limitar(max(principal, contexto) - penalidade(cs))


def dc_marginais(cs: list[Contrib], a: float = A_PADRAO, b: float = B_PADRAO, maximo: int = MAX_CORROBORADORES) -> list[float]:
    """Quanto o dominante e cada corroborador somam, nessa ordem; fecham com o score antes da penalidade (quando o
    caminho de contexto vence, uma parcela só). Os demais sinais aparecem na composição com 0."""
    ps = _pesos(cs, a, b, maximo)
    principal = 100 * (1 - prod(1 - p for p in ps)) if ps else 0.0
    contexto = a * max((min(100.0, c.s) for c in cs if c.categoria in NAO_CORROBORA and c.s > 0), default=0.0)
    if contexto > principal:
        return [contexto]
    resto, out = 1.0, []
    for p in ps:
        out.append(100 * resto * p)
        resto *= 1 - p
    return out


# ---------------------------------------------------------------- tempo (para a robustez de datas)

MEIA_VIDA = {"lideranca": 60, "expansao": 90, "gtm": 60, "contratacao": 45, "estrategia": 60, "intencao": 15, "contexto": 30,
             "negativo": 90}


def tempo_30(categoria: str, dias: int) -> float:
    if dias < 0:
        return 1.0
    mv = MEIA_VIDA.get(categoria, 60)
    return 0.0 if dias > 3 * mv else 0.5 ** (dias / mv)


def tempo_31_lideranca(dias: int, inicio=0.6, carencia=90, pico=365, plato_ate=450, meia_vida=90) -> float:
    """Curva de maturação da 3.1 (PR 44, D7 de 26/11): 0,6 até 90 d, sobe até 1,0 em 365 d, platô até 450 d."""
    if dias < carencia:
        return inicio
    if dias < pico:
        return inicio + (1 - inicio) * (dias - carencia) / (pico - carencia)
    if dias <= plato_ate:
        return 1.0
    depois = dias - plato_ate
    return 0.0 if depois > 3 * meia_vida else 0.5 ** (depois / meia_vida)
