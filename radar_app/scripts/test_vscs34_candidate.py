"""Synthetic regression tests; no customer data or credentials."""
import unittest
from datetime import date
from vscs import motor34, agrupar34, horizonte

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

class TestHorizonte(unittest.TestCase):
    def setUp(self):
        self.cfg=P34["horizonte_planos"]
        self.a=date(2026,11,27)
        self.h={"tipo":"meta_anual","dataAnuncio":"2026-11-27","inicio":"2027-01-01",
                "fim":"2027-12-31","status":"anunciado","ultimaConfirmacaoEm":"2026-11-27",
                "fonte":"https://example.org/meta","justificativa":"Meta de receita para 2027."}
    def fator(self, dia, h=None):
        return horizonte.avaliar(h or self.h,self.a,date.fromisoformat(dia),self.cfg)
    def test_ano_alvo(self):
        self.assertEqual(self.fator("2026-11-26")["fator"],0)
        self.assertEqual(self.fator("2026-11-27")["fator"],1)
        self.assertAlmostEqual(self.fator("2027-01-01")["fator"],2**(-35/365),places=8)
        self.assertAlmostEqual(self.fator("2027-12-31")["fator"],.75*2**(-35/365),places=8)
        self.assertAlmostEqual(self.fator("2028-02-29")["fator"],.5*.75*2**(-35/365),places=8)
        self.assertEqual(self.fator("2028-07-01")["fator"],0)
        self.assertTrue(self.fator("2027-07-01")["a_revalidar"])
    def test_confirmacao_nao_rejuvenesce(self):
        h=dict(self.h,ultimaConfirmacaoEm="2027-07-01")
        self.assertEqual(self.fator("2027-07-01",h)["fator"],self.fator("2027-07-01")["fator"])
        self.assertFalse(self.fator("2027-07-01",h)["a_revalidar"])
        self.assertEqual(self.fator("2027-03-01",h)["ultimaConfirmacaoConsiderada"],"2026-11-27")
    def test_cancelamento_sem_retroagir(self):
        h=dict(self.h,status="cancelado",dataMudanca="2027-04-01")
        self.assertGreater(self.fator("2027-03-31",h)["fator"],0)
        self.assertEqual(self.fator("2027-04-01",h)["fator"],0)
    def test_horizonte_invalido(self):
        for h in (dict(self.h,fim="2026-01-01"),dict(self.h,fonte=""),dict(self.h,status="cancelado"),dict(self.h,dataAnuncio="2027-01-01")):
            self.assertIsNone(horizonte.avaliar(h,self.a,date(2027,1,1),self.cfg))
    def test_plurianual_e_exercicio_em_andamento(self):
        h=dict(self.h,tipo="programa_plurianual",inicio="2026-01-01",fim="2029-12-31")
        self.assertGreater(self.fator("2028-12-31",h)["fator"],.75)
        self.assertEqual(self.fator("2026-11-27",h)["fator"],1)
    def test_um_dia_continuo(self):
        h=dict(self.h,inicio="2027-01-01",fim="2027-01-01")
        self.assertAlmostEqual(self.fator("2027-01-02",h)["fator"],self.fator("2027-01-01",h)["fator"]*2**(-1/60))
    def test_integracao_motor_e_revisao(self):
        e=event("p","declaracao_meta",65,"2026-11-27","Meta de receita para 2027","estrategia")
        rev={"p":{"chave":"declaracao_meta","base":65,"horizontePlano":self.h}}
        r=motor34.calcular([e],date(2027,12,31),revisoes=rev)
        self.assertGreater(r["vscs"],30)
        ac=r["movimentos"][0]["acontecimentos"][0]
        self.assertEqual(ac["horizontePlano"]["fase"],"periodo_alvo")
        self.assertTrue(ac["horizontePlano"]["a_revalidar"])
        self.assertEqual(motor34.calcular([e],date(2027,12,31),revisoes={"p":{"chave":"declaracao_meta","base":65}})["vscs"],0)

if __name__=="__main__":
    unittest.main()
