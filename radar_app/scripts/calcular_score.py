#!/usr/bin/env python3
"""Calcula score, tendência, série e composição de cada conta a partir dos sinais e do histórico reais.

uso: python3 scripts/calcular_score.py

Os coletores (notícias, CNPJ, vagas) e o classificador só escrevem sinais e histórico — nenhum deles
atualiza o score da conta. Este passo fecha o ciclo: soma o que cada sinal/evento vale hoje (pontos_em():
peso vezes 4, caindo pela metade a cada meia janela do tipo — ver JANELAS) e isso vira o score. Sinal que
passou da janela do tipo sai da caixa de Hoje e vai pro histórico da conta.

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
    "palestra_evento": 4,
    "layoffs": 5,
    "noticia_setorial": 0,  # notícia sem fato acionável não esquenta a conta
    "presenca_evento": 6,
    "palestra_lideranca": 7,
}


# Janela de cada tipo (05-conectores-fontes.md, seção 4): (dias ANTES do fato em que já conta, dias DEPOIS
# em que ainda conta). Dentro da janela o sinal vale peso x 4 e cai pela metade a cada metade da janela;
# fora dela vale 0, sai da caixa de Hoje e vai pro histórico. Evento e palestra com data futura abrem a
# janela 30 dias antes: o melhor contato é na preparação e no pós-evento imediato.
JANELAS: dict[str, tuple[int, int]] = {
    "executivo_chegou": (0, 120),
    "executivo_saiu": (0, 90),
    "fusao_aquisicao": (0, 180),
    "captacao": (0, 180),
    "lancamento_ia": (0, 60),
    "lancamento_produto": (0, 60),
    "lancamento_servico": (0, 60),
    "resultados_crescimento": (0, 90),
    "nova_unidade": (0, 120),
    "expansao_mercado": (0, 90),
    "parceria": (0, 90),
    "premio": (0, 60),
    "palestra_evento": (0, 60),
    "layoffs": (0, 60),
    "noticia_setorial": (0, 30),
    "vaga_lideranca_alvo": (0, 90),
    "vaga_area_alvo": (0, 60),
    "vaga_expansao_comercial": (0, 90),
    "presenca_evento": (30, 45),
    "palestra_lideranca": (30, 60),
}
JANELA_PADRAO = (0, 2 * MEIA_VIDA_DIAS)


def janela(tipo: str) -> tuple[int, int]:
    return JANELAS.get(tipo, JANELA_PADRAO)


def pontos_em(peso: int, fato: date, dia: date, tipo: str = "") -> float:
    antes, depois = janela(tipo)
    dias = (dia - fato).days
    if dias < -antes or dias > depois:
        return 0.0
    return peso * 4 * 0.5 ** (max(dias, 0) / (depois / 2))


def vencido(tipo: str, fato: date, dia: date) -> bool:
    return (dia - fato).days > janela(tipo)[1]


def fatos_da_conta(conta: dict, sinais_por_conta: dict[str, list[dict]]) -> list[tuple[str, int, str, date, str]]:
    """(rotulo, peso, detalhe, data, tipo) de cada sinal + evento de histórico real (exemplo=False)."""
    fatos = []
    for s in sinais_por_conta.get(conta["id"], []):
        if s.get("exemplo"):
            continue
        if s["peso"] <= 0:
            continue
        fatos.append((s["rotulo"], s["peso"], s.get("sinal") or s["porQueAgora"], date.fromisoformat(s["data"]), s["tipo"]))
    for h in conta.get("historico", []):
        if h.get("exemplo"):
            continue
        peso = PESO_HISTORICO.get(h["tipo"])
        if not peso:
            continue
        fatos.append((h["rotulo"], peso, h.get("sinal") or h["porQueAgora"], date.fromisoformat(h["data"]), h["tipo"]))
    return fatos


def main() -> None:
    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()

    sinais_por_conta: dict[str, list[dict]] = {}
    for s in base.get("sinais", []):
        sinais_por_conta.setdefault(s["contaId"], []).append(s)

    # sinal que passou da janela do tipo sai da caixa de Hoje e vira histórico da conta
    contas_por_id = {c["id"]: c for c in base["contas"]}
    vencidos = [s for s in base.get("sinais", []) if not s.get("exemplo")
                and vencido(s["tipo"], date.fromisoformat(s["data"]), hoje) and s["contaId"] in contas_por_id]
    for s in vencidos:
        conta = contas_por_id[s["contaId"]]
        if all(h["url"] != s["url"] for h in conta.get("historico", [])):
            conta.setdefault("historico", []).append({k: s[k] for k in (
                "tipo", "rotulo", "sinal", "porQueAgora", "fonte", "data", "url", "exemplo") if k in s})
            conta["historico"].sort(key=lambda h: h["data"], reverse=True)
    ids_vencidos = {s["id"] for s in vencidos}
    base["sinais"] = [s for s in base.get("sinais", []) if s["id"] not in ids_vencidos]
    sinais_por_conta = {}
    for s in base["sinais"]:
        sinais_por_conta.setdefault(s["contaId"], []).append(s)

    for s in base.get("sinais", []):
        s["pontos"] = round(pontos_em(s["peso"], date.fromisoformat(s["data"]), hoje, s["tipo"]))

    for conta in base["contas"]:
        fatos = fatos_da_conta(conta, sinais_por_conta)

        def score_em(dia: date, fatos=fatos) -> int:
            return min(100, round(sum(pontos_em(peso, f, dia, tipo) for _, peso, _, f, tipo in fatos)))

        score = score_em(hoje)
        serie = [score_em(hoje - timedelta(days=3 * (30 - i))) for i in range(31)]
        tendencia = score - score_em(hoje - timedelta(days=14))

        composicao = [
            {"rotulo": rotulo, "detalhe": detalhe, "pontos": round(pontos_em(peso, f, hoje, tipo)), "data": f.isoformat()}
            for rotulo, peso, detalhe, f, tipo in sorted(fatos, key=lambda x: pontos_em(x[1], x[3], hoje, x[4]), reverse=True)
        ]
        composicao = [c for c in composicao if c["pontos"] > 0]
        excesso = sum(c["pontos"] for c in composicao) - score  # teto de 100 ou arredondamento
        if excesso:
            composicao.append({"rotulo": "Ajuste", "detalhe": "Teto de 100 pontos", "pontos": -excesso})

        conta["score"], conta["tendencia"], conta["serie"], conta["composicao"] = score, tendencia, serie, composicao

    base["sinais"].sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    com_sinal = sum(1 for c in base["contas"] if c["score"] > 0)
    print(f"{len(base['contas'])} contas recalculadas · {com_sinal} com score acima de 0")
    print(f"maior score: {max(c['score'] for c in base['contas'])} · {len(vencidos)} sinal(is) passaram da janela e foram pro histórico")


if __name__ == "__main__":
    main()
