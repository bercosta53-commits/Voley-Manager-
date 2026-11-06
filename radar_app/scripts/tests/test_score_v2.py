"""Testes do VSCS 3.0 (velora_radar_abm_modelo_pontuacao_v3.md). Rodar: python3 -m unittest discover -s scripts/tests"""

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import score_v2 as s  # noqa: E402

HOJE = date(2026, 11, 6)


def ev(tipo, dias_atras=0, sinal="", porque="", **extra):
    return {"tipo": tipo, "data": (HOJE - timedelta(days=dias_atras)).isoformat(), "sinal": sinal or "x",
            "porQueAgora": porque, "fonte": "Teste", "url": f"u-{tipo}-{dias_atras}-{sinal}", **extra}


def contrib(s_, categoria="expansao", dias=0):
    return s.Contribuicao("k", "t", categoria, "A", 100, 1.0, 1.0, 1.0, s_, (HOJE - timedelta(days=dias)).isoformat(), "")


CONTA = {"id": "c", "nome": "Conta", "uf": "SC", "icp": {"tier": "A"}, "comite": [
    {"nome": "Ana Souza", "cargo": "CMO", "area": "marketing", "papel": "decisor", "papelAbm": "decisor", "email": "ana@conta.com"}]}
CONTA_B = {**CONTA, "icp": {"tier": "B"}}
CONTA_SEM_CONTATO = {"id": "d", "nome": "Outra", "uf": "SP", "icp": {"tier": "A"}, "comite": []}
CRO = dict(sinal="Novo CRO: Ana Souza", porque="Contratou Ana Souza como CRO.")
DIRETOR = dict(sinal="Novo diretor comercial", porque="Contratou João como diretor comercial.")
SERIE_A = "Série A de R$ 30 milhões"


class Combinacao(unittest.TestCase):
    """Seção 3.3: exemplos da tabela (sinais já ajustados, categorias distintas)."""

    def base(self, valores):
        cats = ["lideranca", "expansao", "gtm", "contratacao", "estrategia", "intencao"]
        return round(s.vscs_base([contrib(v, cats[i % len(cats)]) for i, v in enumerate(valores)]), 1)

    def test_um_sinal_vale_no_maximo_50(self):
        self.assertEqual(self.base([90]), 45.0)
        self.assertEqual(self.base([100]), 50.0)

    def test_exemplos_da_tabela(self):
        self.assertEqual(self.base([90, 85]), 68.4)
        self.assertEqual(self.base([90, 85, 80]), 81.0)
        self.assertEqual(self.base([90, 85, 80, 75]), 88.1)
        self.assertEqual(self.base([90, 85, 80, 75, 70, 65]), 94.8)
        self.assertEqual(self.base([65, 65]), 54.4)
        self.assertEqual(self.base([50, 50, 50, 50]), 68.4)
        self.assertEqual(self.base([100, 40]), 60.0)

    def test_quinto_sinal_continua_contando(self):
        self.assertGreater(self.base([90, 85, 80, 75, 70]), self.base([90, 85, 80, 75]))

    def test_bonus_de_convergencia(self):
        dois = [contrib(65, "lideranca"), contrib(65, "expansao", 20)]
        self.assertEqual(s.bonus_convergencia(dois), 5)
        self.assertEqual(s.vscs(dois), 59.44)
        tres = dois + [contrib(65, "contratacao", 40)]
        self.assertEqual(s.bonus_convergencia(tres), 8)
        self.assertAlmostEqual(s.vscs(tres), 77.2, places=1)

    def test_sem_bonus_fora_da_janela_mesma_categoria_ou_s_abaixo_de_40(self):
        self.assertEqual(s.bonus_convergencia([contrib(65, "lideranca"), contrib(65, "expansao", 50)]), 0)
        self.assertEqual(s.bonus_convergencia([contrib(65, "lideranca"), contrib(39, "expansao", 5)]), 0)
        self.assertEqual(s.bonus_convergencia([contrib(65, "lideranca"), contrib(65, "lideranca", 5)]), 0)

    def test_teto_100(self):
        cats = ("lideranca", "expansao", "gtm", "contratacao", "estrategia")
        self.assertEqual(s.vscs([contrib(100, c) for c in cats] * 2), 100.0)


class Sinal(unittest.TestCase):
    def test_meia_vida_continua_e_corte_em_3_meias_vidas(self):
        p = s.P["troca_lideranca_owner"]  # liderança: meia-vida 60
        self.assertEqual(s.fator_temporal(p, 0), 1.0)
        self.assertAlmostEqual(s.fator_temporal(p, 30), 0.707, places=3)
        self.assertAlmostEqual(s.fator_temporal(p, 60), 0.5)
        self.assertAlmostEqual(s.fator_temporal(p, 180), 0.125)
        self.assertEqual(s.fator_temporal(p, 181), 0.0)
        self.assertAlmostEqual(s.fator_temporal(s.P["vaga_lideranca_growth"], 30), 0.63, places=2)

    def test_evento_futuro_conta_ate_30_dias_antes(self):
        p = s.P["presenca_patrocinador"]
        self.assertEqual(s.fator_temporal(p, -15), 1.0)
        self.assertEqual(s.fator_temporal(p, -31), 0.0)

    def test_fonte_primaria_secundaria_e_sem_classificacao(self):
        self.assertEqual(s.fator_fonte(ev("vaga_area_alvo", fonte="Página de carreiras")), 1.0)
        self.assertEqual(s.fator_fonte(ev("vaga_lideranca_alvo", fonte="Indeed")), 1.0)
        self.assertEqual(s.fator_fonte(ev("captacao")), 0.85)
        self.assertEqual(s.fator_fonte({**ev("captacao"), "sinal": ""}), 0.0)
        self.assertEqual(s.fator_fonte(ev("captacao", match_confidence=0.7)), 0.6)
        self.assertEqual(s.fator_fonte(ev("captacao", match_confidence=0.5)), 0.0)

    def test_cro_novo_vale_95_e_diretor_85(self):
        self.assertEqual(s.contribuicoes([ev("executivo_chegou", 0, **CRO)], HOJE)[0].base, 95)
        self.assertEqual(s.contribuicoes([ev("executivo_chegou", 0, **DIRETOR)], HOJE)[0].base, 85)

    def test_vaga_de_lideranca_growth_vale_85(self):
        c = s.contribuicoes([ev("vaga_lideranca_alvo", 0, "Head de Growth", fonte="Indeed", focoGrowthRevenue=True)], HOJE)[0]
        self.assertEqual((c.base, c.s), (85, 85.0))

    def test_correlacao_tres_vagas_do_mesmo_time(self):
        # seção 2.4: três eventos diferentes da mesma categoria valem 1.0, 0.7 e 0.5
        cs = s.contribuicoes([ev("vaga_lideranca_alvo", 0, f"Head comercial {i}", fonte="Indeed") for i in range(3)], HOJE)
        self.assertEqual([c.correlacao for c in cs], [1.0, 0.7, 0.5])

    def test_mesma_materia_no_inbox_e_no_historico_conta_uma_vez(self):
        e = ev("captacao", 3, SERIE_A)
        self.assertEqual(len(s.contribuicoes([e, dict(e)], HOJE)), 1)

    def test_mesmo_fato_com_urls_diferentes_conta_uma_vez(self):
        a, b = ev("captacao", 3, SERIE_A), {**ev("captacao", 1, SERIE_A), "url": "outra"}
        self.assertEqual(len(s.contribuicoes([a, b], HOJE)), 1)

    def test_cargo_operacional_e_noticia_setorial_nao_pontuam(self):
        self.assertEqual(s.contribuicoes([ev("executivo_chegou", 5, "Novo analista", "Contratou analista.")], HOJE), [])
        self.assertEqual(s.contribuicoes([ev("noticia_setorial", 1)], HOJE), [])

    def test_promessa_cumprida_encerra_a_declaracao(self):
        c = s.contribuicoes([ev("expansao_mercado", 40, "Meta de entrar no México", "Mira o México em 2027."),
                             ev("expansao_mercado", 5, "Entrada no México", "Abriu operação no México.")], HOJE)
        self.assertEqual([x.tipo for x in c], ["expansao_comercial"])


class Status(unittest.TestCase):
    def test_faixas(self):
        for v, st in ((39.9, "Monitoramento"), (40, "Atenção"), (55, "Oportunidade emergente"), (70, "Alta prioridade"),
                      (85, "Prioridade máxima")):
            self.assertEqual(s.status_vscs(v), st)

    def test_cro_novo_sozinho_nao_abre_abordagem(self):
        # caso Neogrid: CRO novo em notícia (95 × 0.85 ≈ 81) dá ~40 de VSCS — no máximo "Atenção"
        r = s.calcular(CONTA, [ev("executivo_chegou", 2, **CRO)], HOJE)
        self.assertLess(r.vscs, 45)
        self.assertFalse(r.sinal_ativo)
        self.assertNotEqual(r.anel, 1)

    def test_dois_fatos_proximos_abrem_abordagem_no_icp_a(self):
        r = s.calcular(CONTA, [ev("executivo_chegou", 10, **CRO), ev("captacao", 5, SERIE_A)], HOJE)
        self.assertGreaterEqual(r.vscs, 55)
        self.assertEqual(r.bonus_convergencia, 5)
        self.assertIn(r.acao, s.ACOES_DE_ABORDAGEM)
        self.assertEqual(r.anel, 1)

    def test_icp_nao_altera_o_vscs_so_a_acao(self):
        evs = [ev("executivo_chegou", 10, **CRO), ev("captacao", 5, SERIE_A)]
        a, b = s.calcular(CONTA, evs, HOJE), s.calcular(CONTA_B, evs, HOJE)
        self.assertEqual(a.vscs, b.vscs)
        self.assertEqual(b.acao, s.MATRIZ["B"][s.faixa(b.vscs)])
        self.assertNotEqual(a.acao, b.acao)

    def test_icp_c_com_score_alto_pede_revisar_icp(self):
        evs = [ev("executivo_chegou", 10, **CRO), ev("captacao", 5, SERIE_A),
               ev("vaga_lideranca_alvo", 5, "Head de Growth", fonte="Indeed", focoGrowthRevenue=True)]
        r = s.calcular({**CONTA, "icp": {"tier": "C"}}, evs, HOJE)
        self.assertGreaterEqual(r.vscs, 70)
        self.assertEqual(r.acao, "Revisar ICP da conta")
        self.assertEqual(r.anel, 4)

    def test_abordagem_sem_contato_vai_pro_anel_2(self):
        r = s.calcular(CONTA_SEM_CONTATO, [ev("executivo_chegou", 10, **CRO), ev("captacao", 5, SERIE_A)], HOJE)
        self.assertEqual(r.anel, 2)
        self.assertIn("mapear", r.frase)

    def test_via_rapida_de_intencao(self):
        r = s.calcular(CONTA, [], HOJE, interacoes=[{"tipo": "pedido_diagnostico", "data": HOJE.isoformat()}])
        self.assertTrue(r.via_rapida)
        self.assertEqual(r.anel, 1)
        self.assertIn("48h", r.frase)
        velha = s.calcular(CONTA, [], HOJE, interacoes=[{"tipo": "pedido_diagnostico",
                                                         "data": (HOJE - timedelta(days=31)).isoformat()}])
        self.assertFalse(velha.via_rapida)


class Supressao(unittest.TestCase):
    def test_opt_out_tira_de_tudo(self):
        r = s.calcular({**CONTA, "supressoes": {"opt_out": True}}, [ev("executivo_chegou", 5, **CRO)], HOJE)
        self.assertIsNone(r.anel)

    def test_cadencia_sem_resposta_bloqueia_anel_1_salvo_gatilho_novo(self):
        fim = (HOJE - timedelta(days=10)).isoformat()
        conta = {**CONTA, "supressoes": {"cadencia_sem_resposta_em": fim}}
        antigos = [ev("executivo_chegou", 30, **CRO), ev("captacao", 25, SERIE_A)]
        self.assertNotEqual(s.calcular(conta, antigos, HOJE).anel, 1)
        novo = ev("expansao_mercado", 2, "Entrada no Paraná", "Abriu operação no Paraná.")
        self.assertEqual(s.calcular(conta, antigos + [novo], HOJE).anel, 1)

    def test_uf_fora_da_regiao_vira_icp_c(self):
        self.assertEqual(s.calcular({**CONTA, "uf": "BA"}, [], HOJE).tier, "C")


if __name__ == "__main__":
    unittest.main()
