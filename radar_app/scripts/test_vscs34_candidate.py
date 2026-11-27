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
    def test_vagas_zero(self):
        e=event("v","vaga_gerencia",70,"2026-11-25","Vaga gerente comercial","contratacao")
        r=run([e],{"v":{"chave":"vaga_gerencia","base":70}})
        self.assertEqual(r["vscs"],0)
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
    def test_vaga_does_not_reinforce(self):
        a=event("n","nomeacao_diretoria_receita",85,"2026-11-01","Diretor comercial assume","lideranca",pessoa="Pessoa Exemplo")
        b=event("v","vaga_gerencia",70,"2026-11-20","Vaga gerente comercial","contratacao")
        rev={"n":{"chave":"nomeacao_diretoria_receita","base":85},"v":{"chave":"vaga_gerencia","base":70}}
        self.assertEqual(run([a],rev)["vscs"],run([a,b],rev)["vscs"])
if __name__=="__main__":
    unittest.main()
