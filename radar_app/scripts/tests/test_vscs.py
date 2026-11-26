"""Testes do VSCS 3.2 canônico e da proposta 3.3-DC (scripts/vscs). Rodar: python3 -m unittest discover -s scripts/tests"""

import random
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vscs import motor32, motor33  # noqa: E402
from vscs.agrupar import Movimento  # noqa: E402
from vscs.classificar import nivel_cargo  # noqa: E402
from vscs.fontes import classificar_fonte  # noqa: E402
from vscs.tempo import exponencial, janela_lideranca, lideranca_nomeada  # noqa: E402

HOJE = date(2026, 11, 26)
P32, P33 = motor33.parametros()
_n = [0]


def ev(tipo, dias, sinal, fonte="Site da empresa", **extra):
    _n[0] += 1
    i = extra.pop("id", f"e{_n[0]}")
    return {"id": i, "tipo": tipo, "data": (HOJE - timedelta(days=dias)).isoformat(), "sinal": sinal, "porQueAgora": sinal,
            "fonte": fonte, "url": extra.pop("url", f"https://exemplo.com.br/{i}"), **extra}


def calc(evs, empresa="Empresa Exemplo"):
    return motor33.calcular(evs, HOJE, empresa, None, P32, P33)


class Test32Cargos(unittest.TestCase):
    def test_tabela_de_cargos(self):
        casos = {"SDR": "sdr_bdr", "Analista de RevOps": "especialista_gtm", "Coordenador de Marketing": "coordenacao",
                 "Gerente de Vendas Enterprise": "gerencia", "Head Comercial": "head", "Diretora de Marketing": "diretoria_receita",
                 "CRO": "clevel_receita", "VP de Vendas": "clevel_receita", "Customer Success Manager": "sdr_bdr",
                 "Gerente de TI": None, "Diretor Financeiro": None}
        for titulo, nivel in casos.items():
            self.assertEqual(nivel_cargo(titulo), nivel, titulo)

    def test_pesos_da_32(self):
        r = motor32.calcular([ev("vaga_lideranca_alvo", 0, "Head Comercial")], HOJE, P32)
        self.assertEqual(r["contribuicoes"][0]["base"], 80)
        r = motor32.calcular([ev("vaga_area_alvo", 0, "SDR")], HOJE, P32)
        self.assertEqual(r["contribuicoes"][0]["base"], 20)
        self.assertEqual(r["vscs"], 10.0)  # K = 0,5 da 3.2

    def test_vaga_fora_de_receita_nao_pontua(self):
        self.assertEqual(motor32.calcular([ev("vaga_lideranca_alvo", 0, "Diretor Financeiro")], HOJE, P32)["contribuicoes"], [])

    def test_bloco_substitui_as_vagas_e_republicacao_nao_conta(self):
        evs = [ev("vaga_area_alvo", d, t) for d, t in ((2, "SDR"), (5, "BDR"), (9, "Executivo de Vendas"), (12, "Inside Sales"), (20, "Pré-vendas"))]
        evs.append(ev("vaga_area_alvo", 1, "SDR"))  # republicação do SDR
        cs = motor32.calcular(evs, HOJE, P32)["contribuicoes"]
        self.assertEqual(len(cs), 1)
        self.assertEqual(cs[0]["base"], 70)
        dois = motor32.calcular(evs[:2], HOJE, P32)["contribuicoes"]
        self.assertEqual((len(dois), dois[0]["base"]), (1, 30))

    def test_vagas_fora_da_janela_formam_blocos_separados(self):
        evs = [ev("vaga_area_alvo", 5, "SDR"), ev("vaga_area_alvo", 50, "BDR")]
        self.assertEqual(len(motor32.calcular(evs, HOJE, P32)["contribuicoes"]), 2)


class Test33Tempo(unittest.TestCase):
    def test_vaga_aberta_decai_e_nomeacao_amadurece(self):
        self.assertAlmostEqual(exponencial("contratacao", 60), 0.5 ** (60 / 45))
        self.assertEqual(exponencial("contratacao", 136), 0.0)
        self.assertEqual(lideranca_nomeada(30, P33), 0.85)
        self.assertEqual(lideranca_nomeada(240, P33), 1.0)
        self.assertLess(lideranca_nomeada(120, P33), 0.85)
        self.assertEqual(lideranca_nomeada(721, P33), 0.0)
        self.assertEqual([janela_lideranca(d, P33) for d in (10, 120, 300, 500)], ["diagnostico", "transicao", "implementacao", "residual"])

    def test_vaga_de_head_nao_amadurece_como_head_contratado(self):
        vaga = calc([ev("vaga_lideranca_alvo", 200, "Head Comercial")])
        nomeado = calc([ev("executivo_chegou", 200, "Fulana assume como Head Comercial")])
        self.assertEqual(vaga["vscs"], 0.0)  # 200 dias > 3 meias-vidas de vaga
        self.assertGreater(nomeado["vscs"], 60)


class Test33Agrupamento(unittest.TestCase):
    def test_vaga_concluida_vira_um_movimento_e_a_vaga_sai(self):
        r = calc([ev("vaga_lideranca_alvo", 60, "Head Comercial"), ev("executivo_chegou", 10, "Fulano assume como Head Comercial")])
        self.assertEqual(len(r["movimentos"]), 1)
        regras = [v["regra"] for v in r["movimentos"][0]["vinculos"]]
        self.assertIn("vaga_concluida", regras)
        so_nomeacao = calc([ev("executivo_chegou", 10, "Fulano assume como Head Comercial")])
        self.assertEqual(r["vscs"], so_nomeacao["vscs"])

    def test_tres_manifestacoes_da_mesma_decisao_contam_como_um_gatilho(self):
        mesma = [ev("expansao_mercado", 40, "Empresa planeja expansão para o México em 2027"),
                 ev("nova_unidade", 20, "Abre escritório no México"),
                 ev("vaga_area_alvo", 10, "SDR para o México"), ev("vaga_area_alvo", 8, "BDR México")]
        r = calc(mesma)
        self.assertEqual(sum(1 for m in r["movimentos"] if m["papel"] != "fora"), 1)
        independentes = [ev("nova_unidade", 20, "Abre escritório no México"), ev("executivo_chegou", 200, "Nova CRO assume"),
                         ev("lancamento_produto", 10, "Lança plataforma Orbis para varejo")]
        self.assertGreater(calc(independentes)["vscs"], r["vscs"])

    def test_republicacao_meses_depois_e_o_mesmo_acontecimento(self):
        r = calc([ev("captacao", 120, "Recebe Série A de R$ 40 milhões"), ev("captacao", 20, "Recebe Série A de R$ 40 milhões")])
        self.assertEqual(len(r["movimentos"]), 1)
        self.assertEqual(r["movimentos"][0]["acontecimentos"][0]["data"], (HOJE - timedelta(days=120)).isoformat())

    def test_execucao_reforca_com_teto(self):
        r = calc([ev("executivo_chegou", 200, "Nova Diretora de Marketing assume"), ev("vaga_area_alvo", 100, "Analista de Marketing"),
                  ev("vaga_lideranca_alvo", 100, "Coordenador de Marketing")])
        m = r["movimentos"][0]
        s1 = max(a["s"] for a in m["acontecimentos"] if not a["superado_por"])
        self.assertLessEqual(m["s"], s1 + P33["movimento"]["teto_execucao"] + 1e-6)
        self.assertIn("estruturacao_da_area", [v["regra"] for v in m["vinculos"]])

    def test_corroboracao_documental_sobe_a_fonte_e_nao_o_numero_de_gatilhos(self):
        um = calc([ev("expansao_mercado", 5, "Empresa chega a Curitiba com equipe comercial", fonte="Blog X", url="https://blogx.com/a")])
        dois = calc([ev("expansao_mercado", 5, "Empresa chega a Curitiba com equipe comercial", fonte="Blog X", url="https://blogx.com/a"),
                     ev("expansao_mercado", 4, "Empresa chega a Curitiba com equipe comercial", fonte="Jornal Y", url="https://jornaly.com/b")])
        self.assertEqual(len(dois["movimentos"]), 1)
        self.assertEqual(len(dois["movimentos"][0]["acontecimentos"]), 1)
        self.assertEqual(dois["movimentos"][0]["acontecimentos"][0]["fonte"], "secundaria_corroborada")
        self.assertGreater(dois["vscs"], um["vscs"])


class Test33Faixa90(unittest.TestCase):
    def forte(self):
        return [ev("executivo_chegou", 220, "Nova CRO assume a área de receita"),
                ev("vaga_expansao_comercial", 5, "Contrata 6 executivos comerciais para nova operação")]

    def test_dois_movimentos_fortes_independentes_e_primarios_chegam_a_90(self):
        r = calc(self.forte())
        self.assertGreaterEqual(r["vscs"], 90)
        self.assertTrue(r["excepcional"])
        self.assertEqual(r["requisitos_90_pendentes"], [])

    def test_sem_requisitos_fica_em_89_9_com_o_motivo(self):
        evs = self.forte()
        evs[1]["dataEstimada"] = True
        r = calc(evs)
        self.assertEqual(r["vscs"], 89.9)
        self.assertTrue(any("data estimada" in m for m in r["requisitos_90_pendentes"]))

    def test_um_fato_sozinho_nunca_chega_a_90(self):
        for e in (ev("executivo_chegou", 240, "Novo CRO assume"), ev("vaga_expansao_comercial", 0, "Contrata 10 executivos comerciais")):
            self.assertLess(calc([e])["vscs"], 90)

    def test_penalidade_nunca_some_dentro_de_um_movimento(self):
        so = calc([ev("executivo_chegou", 200, "Fulana assume como Head Comercial")])
        com = calc([ev("executivo_chegou", 200, "Fulana assume como Head Comercial"), ev("fusao_aquisicao", 30, "Foi adquirida pelo grupo Beta")])
        self.assertGreater(com["penalidade"], 0)
        self.assertAlmostEqual(com["vscs"], round(so["vscs"] - com["penalidade"], 2), places=1)

    def test_capital_sem_citacao_do_dinheiro_e_possivel_vinculo(self):
        evs = [ev("captacao", 30, "Recebe Série B de R$ 120 milhões"), ev("vaga_expansao_comercial", 5, "Contrata 8 executivos comerciais")]
        r = calc(evs)
        self.assertTrue(r["possiveis_vinculos"])


class Test33Fonte(unittest.TestCase):
    def test_taxonomia(self):
        casos = [({"sinal": "x", "fonte": "Site da empresa"}, "institucional"),
                 ({"sinal": "x", "fonte": "Entrevista do executivo"}, "declaracao_direta"),
                 ({"sinal": "x", "fonte": "Valor Econômico"}, "imprensa_reputada"),
                 ({"sinal": "x", "fonte": "Blog", "fontes": [{"fonte": "A", "url": "https://a.com/1"}, {"fonte": "B", "url": "https://b.com/2"}]}, "secundaria_corroborada"),
                 ({"sinal": "x", "fonte": "Blog"}, "secundaria"),
                 ({"sinal": "x", "fonte": "Blog", "classification_confidence": 0.7}, "indicio"),
                 ({"sinal": "x", "fonte": "Blog", "classification_confidence": 0.5}, "descartado"),
                 ({"sinal": "x", "fonte": "Blog", "release": True, "fontes": [{"url": "https://a.com/1"}, {"url": "https://b.com/2"}]}, "secundaria")]
        for e, nivel in casos:
            self.assertEqual(classificar_fonte(e, P33)[0], nivel, e)


class Test33Propriedades(unittest.TestCase):
    def test_monotonia_limites_composicao_e_contexto(self):
        rnd = random.Random(11)
        cats = ["lideranca", "expansao", "gtm", "contratacao", "estrategia", "intencao", "contexto"]

        def movs(n):
            return [Movimento(id=str(i), acontecimentos=[], s=rnd.uniform(0, 100), categoria=rnd.choice(cats)) for i in range(n)]

        for _ in range(500):
            ms = movs(rnd.randint(1, 6))
            principal, contexto, parcelas = motor33.agregar(ms, P33)
            v = max(principal, contexto)
            self.assertTrue(0 <= v <= 100)
            self.assertAlmostEqual(sum(x for _, x in parcelas), v, places=6)
            mais = ms + movs(1)
            mais[-1].id = "novo"
            self.assertGreaterEqual(max(motor33.agregar(mais, P33)[:2]) + 1e-9, v)
            i = rnd.randrange(len(ms))
            ms2 = [Movimento(id=m.id, acontecimentos=[], s=min(100, m.s + (10 if j == i else 0)), categoria=m.categoria) for j, m in enumerate(ms)]
            self.assertGreaterEqual(max(motor33.agregar(ms2, P33)[:2]) + 1e-9, v)
        base = [Movimento("a", [], s=60, categoria="estrategia")]
        com_ctx = base + [Movimento("b", [], s=50, categoria="contexto"), Movimento("c", [], s=45, categoria="contexto")]
        self.assertEqual(motor33.agregar(base, P33)[0], motor33.agregar(com_ctx, P33)[0])

    def test_independe_do_tier(self):
        self.assertNotIn("tier", motor33.calcular.__code__.co_varnames)


if __name__ == "__main__":
    unittest.main()
