import copy
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vscs import motor33
from vscs.missao import extrair, TIPOS

HOJE = date(2026, 11, 26)
def mandato(tipo="grandes_contas", texto="abrir grandes contas", **kw):
    return {"tipo": tipo, "texto": texto, "especifica": True, "meta": None, "praca": None, "confianca": .9, **kw}
def ev(m=None, **kw):
    e = {"id": "e1", "tipo": "executivo_chegou", "data": (HOJE-timedelta(days=36)).isoformat(),
         "sinal": "Fulana assume como CRO", "pessoa": "Fulana", "cargo": "CRO",
         "fonte": "Exame", "url": "https://example.invalid/anuncio", **kw}
    if m is not None:
        e["missao"] = m
    return e

class TestMissao(unittest.TestCase):
    def calc(self, events, enabled=True, rel=None):
        p32, p33 = motor33.parametros()
        p33["missao"]["habilitada"] = enabled
        return motor33.calcular(events, HOJE, "Empresa fictícia", p32=p32, p33=p33, relacionamentos=rel)
    def test_catalogo(self):
        self.assertEqual(len(TIPOS), 11)
    def test_fatores(self):
        for m, f in [(mandato("generica", "liderar o crescimento"),1),
                     (mandato(),1.15),
                     (mandato(texto="dobrar a receita enterprise até 2027",meta="dobrar"),1.2),
                     (mandato(texto="abrir grandes contas até 2027",meta="2027"),1.15),
                     (mandato(confianca=.59),1)]:
            self.assertEqual(extrair(ev(m))["fator"],f)
    def test_fallback_nao_contorna_confianca(self):
        self.assertEqual(extrair(ev(mandato(confianca=.5),tituloOriginal="Novo CRO para abrir grandes contas"))["fator"],1)
        self.assertIsNone(extrair(ev(sinal="Novo CRO para abrir grandes contas")))
        self.assertEqual(extrair(ev(tituloOriginal="Novo CRO para abrir grandes contas"))["fator"],1.15)
    def test_flag_e_tetos(self):
        e=ev(mandato(texto="dobrar a receita enterprise",meta="dobrar"))
        base=self.calc([e],False)
        novo=self.calc([e])
        self.assertGreater(novo["vscs"],base["vscs"])
        self.assertEqual(len(novo["movimentos"]),1)
        self.assertLessEqual(novo["vscs"],85)
        rel={"Fulana":{"nota":5,"em":HOJE.isoformat()}}
        self.assertEqual(self.calc([e],rel=rel)["vscs"],85)
    def test_vaga_sem_amplificar(self):
        e=ev(mandato(),tipo="vaga_lideranca_alvo",sinal="Head Comercial",cargo="Head Comercial")
        a,b=self.calc([e]),self.calc([e],False)
        self.assertEqual(a["vscs"],b["vscs"])
        self.assertEqual(a["movimentos"][0]["acontecimentos"][0]["missao"]["fator"],1)
    def test_mandato_nao_duplica_documento(self):
        e=ev(mandato())
        outro=ev(mandato(),id="e2",url="https://example.invalid/republicacao")
        r=self.calc([e,outro])
        self.assertEqual(len(r["movimentos"]),1)
        self.assertEqual(len(r["movimentos"][0]["acontecimentos"]),1)
        self.assertLessEqual(r["vscs"],85)
    def test_meta_nao_inventada(self):
        self.assertEqual(extrair(ev(mandato(meta="dobrar")) )["fator"],1.15)
    def test_substituida(self):
        self.assertIsNone(extrair(ev(mandato(ativa=False))))

    def test_mandato_nominal_e_elegibilidade_pendente(self):
        m=mandato(texto="expansão do portfólio de clientes enterprise")
        self.assertEqual(extrair(ev(m))["fator"],1.15)
        self.assertEqual(extrair(ev(m,missaoRevisao={"status":"confirmada_pendente_elegibilidade"}))["fator"],1)
    def test_hipoteses_nao_pontuam(self):
        m=mandato(tensaoExecucao={"nivel":"alta"},aderenciaVelora={"nivel":"muito_alta"})
        self.assertEqual(extrair(ev(m))["fator"],1.15)
        self.assertEqual(extrair(ev(m))["tensaoExecucao"]["nivel"],"alta")
