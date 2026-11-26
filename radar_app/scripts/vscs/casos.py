"""Contrafactuais sintéticos da 3.3 (nenhum dado real): python3 -m vscs.casos"""
from __future__ import annotations

from datetime import date, timedelta

from . import motor32, motor33
from .simular import f2, variantes

HOJE = date(2026, 11, 26)


def ev(tipo, dias, sinal, fonte="Site da empresa", **x):
    i = x.pop("id", f"{tipo}-{dias}-{abs(hash(sinal)) % 10000}")
    return {"id": i, "tipo": tipo, "data": (HOJE - timedelta(days=dias)).isoformat(), "sinal": sinal, "porQueAgora": sinal,
            "fonte": fonte, "url": x.pop("url", f"https://exemplo.com.br/{i}"), **x}


CENARIOS = [
    ("SDR isolado", [ev("vaga_area_alvo", 0, "SDR")]),
    ("5 vagas operacionais distintas em 30 d (bloco)", [ev("vaga_area_alvo", d, t) for d, t in ((1, "SDR"), (4, "BDR"), (8, "Inside Sales"), (12, "Executivo de Vendas"), (20, "Pré-vendas"))]),
    ("Vaga de Head Comercial aberta há 10 d", [ev("vaga_lideranca_alvo", 10, "Head Comercial")]),
    ("Vaga de Head Comercial aberta há 120 d", [ev("vaga_lideranca_alvo", 120, "Head Comercial")]),
    ("Head Comercial nomeado há 10 d (diagnóstico)", [ev("executivo_chegou", 10, "Fulana assume como Head Comercial")]),
    ("Head Comercial nomeado há 120 d (transição)", [ev("executivo_chegou", 120, "Fulana assume como Head Comercial")]),
    ("Head Comercial nomeado há 300 d (implementação)", [ev("executivo_chegou", 300, "Fulana assume como Head Comercial")]),
    ("Vaga de Head há 90 d + Head nomeado há 10 d (mesmo movimento)", [ev("vaga_lideranca_alvo", 90, "Head Comercial"), ev("executivo_chegou", 10, "Fulana assume como Head Comercial")]),
    ("CRO nomeado há 200 d, imprensa reputada", [ev("executivo_chegou", 200, "Novo CRO assume", fonte="Valor Econômico")]),
    ("Meta de crescimento de 67% (declaração)", [ev("expansao_mercado", 5, "Empresa projeta crescer 67% e planeja meta de R$ 50 mi")]),
    ("Expansão comercial efetiva (6 executivos)", [ev("vaga_expansao_comercial", 5, "Contrata 6 executivos comerciais")]),
    ("México: declaração + escritório + 2 vagas (um movimento)", [ev("expansao_mercado", 40, "Planeja expansão para o México"), ev("nova_unidade", 20, "Abre escritório no México"),
                                                                  ev("vaga_area_alvo", 10, "SDR México"), ev("vaga_area_alvo", 8, "BDR México")]),
    ("Lançamento Orbis + parceria Orbis (um movimento)", [ev("lancamento_produto", 20, "Lança a plataforma Orbis para varejo"), ev("parceria", 10, "Parceria para distribuir a Orbis")]),
    ("Mesmo fato em dois veículos secundários", [ev("expansao_mercado", 5, "Chega a Curitiba com equipe comercial", fonte="Blog X", url="https://blogx.com/a"),
                                                 ev("expansao_mercado", 4, "Chega a Curitiba com equipe comercial", fonte="Jornal Y", url="https://jornaly.com/b")]),
    ("Série B + 8 executivos sem citar o aporte (possível vínculo)", [ev("captacao", 30, "Recebe Série B de R$ 120 milhões"), ev("vaga_expansao_comercial", 5, "Contrata 8 executivos comerciais")]),
    ("CRO há 220 d + expansão efetiva (independentes, primários)", [ev("executivo_chegou", 220, "Nova CRO assume a área de receita"), ev("vaga_expansao_comercial", 5, "Contrata 6 executivos comerciais para nova operação")]),
    ("Idem, expansão com data estimada", [ev("executivo_chegou", 220, "Nova CRO assume a área de receita"), ev("vaga_expansao_comercial", 5, "Contrata 6 executivos comerciais para nova operação", dataEstimada=True)]),
    ("Idem, expansão só em blog", [ev("executivo_chegou", 220, "Nova CRO assume a área de receita"), ev("vaga_expansao_comercial", 5, "Contrata 6 executivos comerciais para nova operação", fonte="Blog X")]),
    ("Head nomeado + aquisição pela controladora", [ev("executivo_chegou", 200, "Fulana assume como Head Comercial"), ev("fusao_aquisicao", 30, "Foi adquirida pelo grupo Beta")]),
    ("Quatro notícias médias independentes", [ev("parceria", 10, "Parceria com Alfa"), ev("presenca_evento", 5, "Expositor no evento", evento={"papel": "patrocinador"}),
                                              ev("lancamento_produto", 15, "Lança módulo de relatórios"), ev("premio", 20, "Recebe prêmio de inovação")]),
    ("Pedido de diagnóstico (intenção direta)", [], [{"tipo": "pedido_diagnostico", "data": (HOJE - timedelta(days=2)).isoformat()}]),
]


def main() -> None:
    p32, p33 = motor33.parametros()
    vs = variantes(p33)
    cab = ["Cenário", "3.2 canônica"] + list(vs) + ["pendências 90+ (3.3)"]
    print("| " + " | ".join(cab) + " |")
    print("|---" + "|---:" * (len(cab) - 2) + "|---|")
    for item in CENARIOS:
        nome, evs = item[0], item[1]
        inter = item[2] if len(item) > 2 else None
        linha = [nome, f2(motor32.calcular(evs, HOJE, p32, inter)["vscs"])]
        pend = ""
        for k, pv in vs.items():
            r = motor33.calcular(evs, HOJE, "Empresa Exemplo", inter, p32, pv)
            linha.append(f2(r["vscs"]))
            if k == "DC + dupla janela (3.3)":
                pend = "; ".join(r["requisitos_90_pendentes"]) or ("—" if r["vscs"] < 90 else "cumpridas")
        print("| " + " | ".join(linha + [pend]) + " |")


if __name__ == "__main__":
    main()
