#!/usr/bin/env python3
"""Calcula score, tendência, série e composição de cada conta a partir dos sinais e do histórico reais.

uso: python3 scripts/calcular_score.py

Os coletores (notícias, CNPJ, vagas) e o classificador só escrevem sinais e histórico — nenhum deles
atualiza o score da conta. Este passo fecha o ciclo: soma o que cada sinal/evento vale hoje (mesmo
decaimento usado em todo o resto do app, pontos_em() — peso vezes 4, caindo pela metade a cada
MEIA_VIDA_DIAS dias) e isso vira o score.

Diferente da base de exemplo (scripts/gerar_dados.py), a base real não tem "perfil" (encaixe no ICP) nem
"momento" vindos de planilha — essas colunas (score_estrutural/score_ativacao) não existem na importação
real ainda. Por isso aqui o score é só a soma dos sinais: uma conta sem sinal nenhum fica com score 0, o
que é o estado certo ("ainda não sabemos nada sobre ela"), não um bug. components/conta/decomposicao.tsx
já trata isso (só mostra a frase de "perfil e momento" quando a base é fictícia).

Idempotente: pode rodar de novo a qualquer momento (depois de qualquer coletor), sempre recalcula do
zero a partir do que está em sinais[] e historico[] agora.
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
MEIA_VIDA_DIAS = 60  # mesmo decaimento usado em gerar_dados.py e em todos os coletores

# peso por tipo — mesma tabela de scripts/classificar_sinais.py (histórico não grava peso próprio,
# só sinal grava; aqui é só pro histórico, que precisa do peso pra entrar na soma do score).
PESO_HISTORICO: dict[str, int] = {
    "executivo_chegou": 9,
    "executivo_saiu": 7,
    "fusao_aquisicao": 9,
    "captacao": 8,
    "lancamento_ia": 8,
    "resultados_crescimento": 6,
    "nova_unidade": 6,
    "expansao_mercado": 6,
    "lancamento_produto": 6,
    "lancamento_servico": 6,
    "parceria": 5,
    "premio": 4,
    "layoffs": 5,
    "noticia_setorial": 3,
}


def pontos_em(peso: int, fato: date, dia: date) -> float:
    if dia < fato:
        return 0.0
    return peso * 4 * 0.5 ** ((dia - fato).days / MEIA_VIDA_DIAS)


def fatos_da_conta(conta: dict, sinais_por_conta: dict[str, list[dict]]) -> list[tuple[str, int, str, date]]:
    """(rotulo, peso, detalhe, data) de cada sinal + evento de histórico real (exemplo=False)."""
    fatos = []
    for s in sinais_por_conta.get(conta["id"], []):
        if s.get("exemplo"):
            continue
        fatos.append((s["rotulo"], s["peso"], s["porQueAgora"], date.fromisoformat(s["data"])))
    for h in conta.get("historico", []):
        if h.get("exemplo"):
            continue
        peso = PESO_HISTORICO.get(h["tipo"])
        if peso is None:
            continue
        fatos.append((h["rotulo"], peso, h["porQueAgora"], date.fromisoformat(h["data"])))
    return fatos


def main() -> None:
    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()

    sinais_por_conta: dict[str, list[dict]] = {}
    for s in base.get("sinais", []):
        sinais_por_conta.setdefault(s["contaId"], []).append(s)

    for conta in base["contas"]:
        fatos = fatos_da_conta(conta, sinais_por_conta)

        def score_em(dia: date, fatos=fatos) -> int:
            return min(100, round(sum(pontos_em(peso, f, dia) for _, peso, _, f in fatos)))

        score = score_em(hoje)
        serie = [score_em(hoje - timedelta(days=3 * (30 - i))) for i in range(31)]
        tendencia = score - score_em(hoje - timedelta(days=14))

        composicao = [
            {"rotulo": rotulo, "detalhe": detalhe, "pontos": round(pontos_em(peso, f, hoje)), "data": f.isoformat()}
            for rotulo, peso, detalhe, f in fatos
        ]
        excesso = sum(c["pontos"] for c in composicao) - score  # teto de 100 ou arredondamento
        if excesso:
            composicao.append({"rotulo": "Ajuste", "detalhe": "Teto de 100 pontos", "pontos": -excesso})

        conta["score"], conta["tendencia"], conta["serie"], conta["composicao"] = score, tendencia, serie, composicao

    base["sinais"].sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    com_sinal = sum(1 for c in base["contas"] if c["score"] > 0)
    print(f"{len(base['contas'])} contas recalculadas · {com_sinal} com score acima de 0")
    print(f"maior score: {max(c['score'] for c in base['contas'])}")


if __name__ == "__main__":
    main()
