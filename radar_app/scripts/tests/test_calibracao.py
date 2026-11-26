"""Propriedades dos modelos da calibração 3.3 (proposta, não vigente). Rodar: python3 -m unittest discover -s scripts/tests"""

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "calibracao"))
import modelos as m  # noqa: E402


def C(s, cat="expansao"):
    return m.Contrib(s, cat)


class TestDominanteCorroboracao(unittest.TestCase):
    def test_reproduz_o_motor_atual(self):
        # fórmula 3.0: 100·[1 − Π(1 − 0,5·s/100)] + bônus
        self.assertAlmostEqual(m.atual([C(80)]), 40.0, places=2)
        self.assertAlmostEqual(m.atual([C(80, "lideranca"), C(60)], 5), 100 * (1 - 0.6 * 0.7) + 5, places=2)

    def test_um_sinal_sozinho_nao_passa_de_100a(self):
        self.assertEqual(m.dc([C(100)]), 85.0)
        self.assertEqual(m.dc([C(100, "intencao")], a=0.9), 90.0)

    def test_90_exige_corroboracao_forte(self):
        self.assertLess(m.dc([C(95, "lideranca")]), 90)
        self.assertGreaterEqual(m.dc([C(95, "lideranca"), C(85)]), 90)
        self.assertLess(m.dc([C(95, "lideranca"), C(40, "contratacao")]), 90)

    def test_sdr_fica_muito_abaixo_de_cro_e_expansao(self):
        sdr, cro, exp = m.dc([C(20, "contratacao")]), m.dc([C(95, "lideranca")]), m.dc([C(85)])
        self.assertLessEqual(sdr, 25)
        self.assertGreater(cro - sdr, 50)
        self.assertGreater(exp - sdr, 45)

    def test_contexto_nao_corrobora_e_volume_tem_teto(self):
        base = m.dc([C(60, "estrategia")])
        self.assertEqual(m.dc([C(60, "estrategia"), C(45, "contexto"), C(40, "contexto")]), base)
        muitos = [C(60, "estrategia")] + [C(50, "gtm") for _ in range(10)]
        self.assertEqual(m.dc(muitos), m.dc(muitos[:3]))

    def test_limites_monotonia_e_composicao(self):
        rnd = random.Random(7)
        cats = ["lideranca", "expansao", "gtm", "contratacao", "estrategia", "intencao", "contexto"]
        for _ in range(500):
            cs = [C(rnd.uniform(0, 100), rnd.choice(cats)) for _ in range(rnd.randint(1, 6))]
            v = m.dc(cs)
            self.assertTrue(0 <= v <= 100)
            # acrescentar evidência nunca derruba o score
            self.assertGreaterEqual(m.dc(cs + [C(rnd.uniform(0, 100), rnd.choice(cats))]) + 1e-9, v)
            # aumentar a intensidade de um sinal nunca derruba o score
            i = rnd.randrange(len(cs))
            mais = cs[:i] + [C(min(100, cs[i].s + 10), cs[i].categoria)] + cs[i + 1:]
            self.assertGreaterEqual(m.dc(mais) + 1e-9, v)
            # as parcelas fecham com o score (sem penalidade)
            self.assertAlmostEqual(sum(m.dc_marginais(cs)), v, places=1)

    def test_penalidade_subtrai_depois_e_negativo_nao_soma(self):
        self.assertEqual(m.dc([C(80, "lideranca"), C(30, "negativo")]), round(m.dc([C(80, "lideranca")]) - 30, 2))
        self.assertEqual(m.dc([C(30, "negativo")]), 0.0)

    def test_independe_do_tier(self):
        # a função não recebe tier: a mesma evidência dá o mesmo número em A, B ou C
        self.assertNotIn("tier", m.dc.__code__.co_varnames)

    def test_curva_d_e_monotonica_e_preserva_extremos(self):
        vs = [m.curva(x) for x in range(0, 101)]
        self.assertEqual(vs[0], 0)
        self.assertEqual(vs[-1], 100)
        self.assertTrue(all(b >= a for a, b in zip(vs, vs[1:])))


if __name__ == "__main__":
    unittest.main()
