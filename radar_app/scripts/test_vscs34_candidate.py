"""Synthetic regression tests; no customer data or credentials."""
import unittest
from datetime import date
from vscs import motor34, agrupar34

NOW = date(2026, 11, 26)
P32, P34 = motor34.parametros()

def event(i, key, base, day, label, category, **kw):
    return dict(id=i, tipo="vaga_area_alvo" if key.startswith("vaga_") else "executivo_chegou" if key.startswith("nomeacao_") else "lancamento_produto",
                data=day, sinal=label, fonte="Site da empresa", url="https://example.org/"+i,
                calibracao={"base":base}, fonteFatorRevisado=1.0, fonteNivelRevisado="institucional", **kw)

def run(events, revisions):
    return motor34.calcular(events,NOW,empresa="Exemplo",revisoes=revisions)

class TestMotor34(unittest.TestCase):
    def test_vagas_pontuam_com_teto(self):
        e=event("v","vaga_gerencia",70,"2026-11-25","Vaga gerente comercial","contratacao")
        r=run([e],{"v":{"chave":"vaga_gerencia","base":70}})
        self.assertGreater(r["vscs"],0)
        self.assertLessEqual(r["vscs"],34)
    def test_nomeacao_efetiva(self):
        e=event("n","nomeacao_diretoria_receita",85,"2026-11-25","Diretor comercial assume","lideranca",pessoa="Pessoa Exemplo")
        r=run([e],{"n":{"chave":"nomeacao_diretoria_receita","base":85}})
        self.assertGreater(r["vscs"],50)
    def test_same_erp_not_same_movement(self):
        a=event("a","lancamento_comum",65,"2026-10-01","Lança módulo financeiro ERP","estrategia")
        b=event("b","lancamento_comum",65,"2026-11-01","Lança módulo logístico ERP","estrategia")
        r=run([a,b],{i:{"chave":"lancamento_comum","base":65} for i in ("a","b")})
        self.assertEqual(len(r["movimentos"]),2)
    def test_acquisition_lasts(self):
        a=event("a","aquisicao_feita",85,"2026-06-01","Compra empresa XYZ","estrategia")
        r=run([a],{"a":{"chave":"aquisicao_feita","base":85}})
        self.assertGreater(r["vscs"],30)
    def test_vaga_complements_with_limit(self):
        a=event("n","nomeacao_diretoria_receita",85,"2026-11-01","Diretor comercial assume","lideranca",pessoa="Pessoa Exemplo")
        b=event("v","vaga_gerencia",70,"2026-11-20","Vaga gerente comercial","contratacao")
        rev={"n":{"chave":"nomeacao_diretoria_receita","base":85},"v":{"chave":"vaga_gerencia","base":70}}
        self.assertGreater(run([a,b],rev)["vscs"],run([a],rev)["vscs"])
        self.assertLessEqual(run([a,b],rev)["vscs"]-run([a],rev)["vscs"],12)
    def test_vaga_seniority_decay_and_positive_score(self):
        from datetime import timedelta
        day=(NOW-timedelta(days=60)).isoformat()
        cases={"vaga_sdr_bdr":30,"vaga_especialista_gtm":45,"vaga_bloco":60,"vaga_coordenacao":60,"vaga_gerencia":75,"vaga_head":90,"vaga_diretoria_receita":90,"vaga_clevel_receita":120}
        for key,half_life in cases.items():
            with self.subTest(key=key):
                e=event("v",key,40,day,"Vaga comercial","contratacao")
                r=run([e],{"v":{"chave":key,"base":40}})
                self.assertGreater(r["vscs"],0)
                ac=r["movimentos"][0]["acontecimentos"][0]
                self.assertAlmostEqual(ac["tempo"],0.5**(60/half_life),places=4)
                self.assertEqual(ac["vaga_aberta"],True)
                self.assertEqual(ac["revalidar_vaga"],60>=half_life)
    def test_vaga_contextual_expiry(self):
        from datetime import timedelta
        day=(NOW-timedelta(days=271)).isoformat()
        e=event("v","vaga_diretoria_receita",85,day,"Vaga diretor comercial","contratacao")
        r=run([e],{"v":{"chave":"vaga_diretoria_receita","base":85}})
        self.assertEqual(r["vscs"],0)
        self.assertEqual(r["movimentos"],[])

    def test_multiple_vagas_do_not_create_hot_account(self):
        evs=[event(str(i),"vaga_clevel_receita",95,"2026-11-25",f"Vaga CRO região {i}","contratacao") for i in range(6)]
        rev={str(i):{"chave":"vaga_clevel_receita","base":95} for i in range(6)}
        self.assertLessEqual(run(evs,rev)["vscs"],34)
    def test_closed_vaga(self):
        e=event("v","vaga_head",80,"2026-11-25","Vaga head comercial","contratacao",statusVaga="preenchida")
        self.assertEqual(run([e],{"v":{"chave":"vaga_head","base":80}})["vscs"],0)

if __name__=="__main__":
    unittest.main()
