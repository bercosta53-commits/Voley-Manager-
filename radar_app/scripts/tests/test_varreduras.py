import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from varreduras import registrar  # noqa: E402
from importar_chatgpt import blocos  # noqa: E402


class TestVarreduras(unittest.TestCase):
    def test_registra_ultima_por_conta_e_fonte(self):
        b = {}
        registrar(b, "c1", "google-news", "sem_fato", 0, em="2026-11-20")
        registrar(b, "c1", "google-news", "com_fato", 2, em="2026-11-25")
        registrar(b, "c1", "carreiras", "sem_fato", em="2026-11-24")
        self.assertEqual(b["varreduras"]["c1"]["google-news"], {"em": "2026-11-25", "resultado": "com_fato", "itens": 2})
        self.assertEqual(set(b["varreduras"]["c1"]), {"google-news", "carreiras"})

    def test_erro_nao_apaga_leitura_valida(self):
        b = {}
        registrar(b, "c1", "x", "sem_fato", em="2026-11-20")
        registrar(b, "c1", "x", "erro", em="2026-11-26")
        self.assertEqual(b["varreduras"]["c1"]["x"]["resultado"], "sem_fato")
        self.assertEqual(b["varreduras"]["c1"]["x"]["ultimoErroEm"], "2026-11-26")
        registrar(b, "c2", "x", "erro", em="2026-11-26")
        self.assertEqual(b["varreduras"]["c2"]["x"]["resultado"], "erro")

    def test_resultado_invalido(self):
        with self.assertRaises(ValueError):
            registrar({}, "c1", "x", "talvez")

    def test_bloco_varreduras_do_chatgpt(self):
        texto = "VARREDURAS\nid;fonte;data;resultado;itens;consulta\nc1;pesquisa-web-validada;2026-11-26;sem_fato;0;empresa exemplo vagas\n"
        r = blocos(texto)["VARREDURAS"]
        self.assertEqual(r[0]["resultado"], "sem_fato")


if __name__ == "__main__":
    unittest.main()
