"""Testes do score v2.2 (v2.1 + calibração de 2026-11-06) (spec 06-score-sinais.md, seção 11). Rodar: python3 -m unittest discover scripts/tests"""

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


CONTA = {"id": "c", "nome": "Conta", "uf": "SC", "comite": [
    {"nome": "Ana Souza", "cargo": "CMO", "area": "marketing", "papel": "decisor", "email": "ana@conta.com"}]}
CONTA_SEM_CONTATO = {"id": "d", "nome": "Outra", "uf": "SP", "comite": []}
CMO = dict(sinal="Nova CMO: Ana Souza", porque="Contratou Ana Souza como CMO.")


class Curva(unittest.TestCase):
    def test_cmo_platô_60_dias_e_decai_depois(self):
        p = s.P["troca_lideranca_owner"]
        for d in (0, 20, 60):
            self.assertEqual(s.curva(p, d), 1.0)
        self.assertGreaterEqual(s.curva(p, 60), 0.5)
        # meia-vida aprovada em 2026-11-06: 60 d (a tabela 2.2 dizia 45 e o teste do spec pedia ~0.25 no dia 120)
        self.assertAlmostEqual(s.curva(p, 120), 0.5, places=3)
        self.assertAlmostEqual(s.curva(p, 150), 0.5 ** 1.5, places=3)
        self.assertEqual(s.curva(p, 151), 0.0)

    def test_evento_futuro_vale_o_mesmo_que_no_dia_nunca_mais(self):
        p = s.P["presenca_patrocinador"]
        self.assertEqual(s.curva(p, -15), s.curva(p, 0))
        self.assertLessEqual(s.curva(p, -15), 1.0)
        self.assertEqual(s.curva(p, -31), 0.0)

    def test_captacao_serie_a_platô_90_dias(self):
        c = s.contribuicoes([ev("captacao", 80, "Série A de R$ 15 milhões")], HOJE)
        self.assertEqual(c[0].nivel, "A")
        self.assertEqual(c[0].curva, 1.0)


class Pesos(unittest.TestCase):
    def test_cmo_vale_8x_palestra(self):
        # 2.2: CMO/CRO novo baixou de 1.0 para 0.8 — é janela, não demanda
        cmo = s.contribuicoes([ev("executivo_chegou", 10, **CMO)], HOJE)[0]
        pal = s.contribuicoes([ev("palestra_evento", 10)], HOJE)[0]
        self.assertAlmostEqual(cmo.peso / pal.peso, 8)

    def test_vaga_de_lideranca_growth_vale_mais_que_cro_novo(self):
        vaga = s.contribuicoes([ev("vaga_lideranca_alvo", 5, "Contratação de Head de Growth", focoGrowthRevenue=True)], HOJE)[0]
        cro = s.contribuicoes([ev("executivo_chegou", 5, **CMO)], HOJE)[0]
        self.assertGreater(vaga.peso, cro.peso)

    def test_cinco_vagas_de_sdr_contam_como_uma(self):
        vagas = [ev("vaga_area_alvo", i, f"Vaga SDR {i}", fonte="Página de carreiras") for i in range(5)]
        c = s.contribuicoes(vagas, HOJE)
        self.assertEqual(len(c), 1)

    def test_confianca_baixa_nao_pontua(self):
        e = ev("executivo_chegou", 5, **CMO, match_confidence=0.55, classification_confidence=0.9)
        self.assertEqual(s.contribuicoes([e], HOJE), [])

    def test_seed_e_nivel_b(self):
        c = s.contribuicoes([ev("captacao", 5, "Rodada seed de R$ 2 milhões")], HOJE)[0]
        self.assertEqual((c.nivel, c.peso), ("B", 0.50))

    def test_cargo_operacional_nao_pontua(self):
        self.assertEqual(s.contribuicoes([ev("executivo_chegou", 5, "Novo analista", "Contratou analista.")], HOJE), [])


class Timing(unittest.TestCase):
    def test_gatilho_sozinho_vale_60_por_cento(self):
        c = s.contribuicoes([ev("executivo_chegou", 5, **CMO)], HOJE)
        self.assertAlmostEqual(s.timing(c), 0.6 * c[0].valor, places=3)

    def test_segundo_gatilho_forte_confirma_o_primeiro(self):
        so = s.timing(s.contribuicoes([ev("executivo_chegou", 5, **CMO)], HOJE))
        com = s.timing(s.contribuicoes([ev("executivo_chegou", 5, **CMO), ev("captacao", 5, "Série A")], HOJE))
        self.assertLess(so, 0.5)
        self.assertGreater(com, 0.85)

    def test_vaga_de_lideranca_growth_vale_inteira_sozinha(self):
        c = s.contribuicoes([ev("vaga_lideranca_alvo", 5, "Contratação de Head de Growth", focoGrowthRevenue=True)], HOJE)
        self.assertAlmostEqual(s.timing(c), c[0].valor, places=3)
        self.assertEqual(s.calcular(CONTA, [ev("vaga_lideranca_alvo", 5, "Contratação de Head de Growth",
                                                focoGrowthRevenue=True)], HOJE).anel, 1)

    def test_fit_baixo_derruba_a_forca(self):
        self.assertAlmostEqual(s.forca(0.8, 1.0), 0.8)
        self.assertAlmostEqual(s.forca(0.8, 0.0), 0.32)

    def test_tres_sinais_fortes_ficam_abaixo_de_1_e_ordenaveis(self):
        tres = s.timing(s.contribuicoes([ev("executivo_chegou", 5, **CMO), ev("captacao", 5, "Série A"),
                                         ev("fusao_aquisicao", 5)], HOJE))
        dois = s.timing(s.contribuicoes([ev("executivo_chegou", 5, **CMO), ev("captacao", 5, "Série A")], HOJE))
        self.assertLess(tres, 1.0)
        self.assertGreater(tres, dois)

    def test_so_contexto_fica_no_teto_e_sem_sinal_ativo(self):
        contexto = [ev("palestra_evento", 1), ev("parceria", 1), ev("lancamento_produto", 1), ev("premio", 1),
                    ev("presenca_evento", -10, evento={"papel": "patrocinador"})]
        r = s.calcular(CONTA, contexto, HOJE)
        self.assertLessEqual(r.timing, 0.25)
        self.assertFalse(r.sinal_ativo)
        self.assertNotEqual(r.anel, 1)


class Declaracao(unittest.TestCase):
    def test_generica_vale_015_e_nunca_anel_1(self):
        r = s.calcular(CONTA, [ev("resultados_crescimento", 3, "Cresceu 30%", "Cresceu 30% no ano.")], HOJE)
        self.assertEqual(r.contribuicoes[0]["peso"], 0.15)
        self.assertNotEqual(r.anel, 1)

    def test_plano_com_meta_vale_055(self):
        c = s.contribuicoes([ev("expansao_mercado", 3, "Meta de entrar no México", "Mira entrar no México em 2027.")], HOJE)[0]
        self.assertEqual((c.nivel, c.peso), ("B", 0.55))

    def test_promessa_cumprida_encerra_a_declaracao(self):
        c = s.contribuicoes([ev("expansao_mercado", 40, "Meta de entrar no México", "Mira o México em 2027."),
                             ev("expansao_mercado", 5, "Entrada no México", "Abriu operação no México.")], HOJE)
        self.assertEqual([x.tipo for x in c], ["expansao_comercial"])


class Aneis(unittest.TestCase):
    def test_toda_conta_cai_em_um_anel(self):
        for conta in (CONTA, CONTA_SEM_CONTATO, {**CONTA, "uf": "BA"}):
            for evs in ([], [ev("executivo_chegou", 5, **CMO)], [ev("palestra_evento", 1)]):
                self.assertIn(s.calcular(conta, evs, HOJE).anel, (1, 2, 3, 4))

    def test_cmo_novo_e_captacao_sem_contato_mapeado_vai_pro_anel_2(self):
        r = s.calcular(CONTA_SEM_CONTATO, [ev("executivo_chegou", 20, **CMO), ev("captacao", 10, "Série A")], HOJE)
        self.assertEqual(r.anel, 2)
        self.assertIn("mapear", r.frase)

    def test_cmo_novo_e_captacao_com_contato_vai_pro_anel_1(self):
        self.assertEqual(s.calcular(CONTA, [ev("executivo_chegou", 20, **CMO), ev("captacao", 10, "Série A")], HOJE).anel, 1)

    def test_cmo_novo_sozinho_nao_vai_pro_anel_1(self):
        # calibração 2.2 (caso Neogrid): CRO novo, sem outro fato, não abre conversa
        self.assertNotEqual(s.calcular(CONTA, [ev("executivo_chegou", 20, **CMO)], HOJE).anel, 1)

    def test_cadencia_sem_resposta_bloqueia_anel_1_por_60_dias_salvo_gatilho_novo(self):
        fim = (HOJE - timedelta(days=10)).isoformat()
        conta = {**CONTA, "supressoes": {"cadencia_sem_resposta_em": fim}}
        antigo = ev("executivo_chegou", 30, **CMO)
        self.assertNotEqual(s.calcular(conta, [antigo], HOJE).anel, 1)
        novo = ev("captacao", 2, "Série B de R$ 50 milhões")
        self.assertEqual(s.calcular(conta, [antigo, novo], HOJE).anel, 1)

    def test_opt_out_tira_de_tudo(self):
        r = s.calcular({**CONTA, "supressoes": {"opt_out": True}}, [ev("executivo_chegou", 5, **CMO)], HOJE)
        self.assertIsNone(r.anel)

    def test_uf_fora_da_regiao_zera_o_fit(self):
        self.assertEqual(s.calcular({**CONTA, "uf": "BA"}, [], HOJE).anel, 4)

    def test_histerese(self):
        # força ~0.46 (meta de expansão + CMO de 130 dias, já decaindo): não entra no anel 1 (precisa de 0.5),
        # mas quem já está nele só sai abaixo de 0.4
        evs = [ev("expansao_mercado", 3, "Meta de entrar no Chile", "Mira o Chile em 2027."), ev("executivo_chegou", 130, **CMO)]
        fora = s.calcular(CONTA, evs, HOJE, anterior=None)
        dentro = s.calcular(CONTA, evs, HOJE, anterior={"anel": 1, "proximity": 0.5})
        self.assertNotEqual(fora.anel, 1)
        self.assertEqual(dentro.anel, 1)


if __name__ == "__main__":
    unittest.main()
