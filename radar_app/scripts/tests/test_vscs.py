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
from vscs.fontes import classificar_fonte, corroborar, testemunhos  # noqa: E402
from vscs import adaptador  # noqa: E402
from vscs.classificar import cargo_do_evento  # noqa: E402
from vscs.agrupar import Acontecimento, Documento  # noqa: E402
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
                 "CRO": "clevel_receita", "VP de Vendas": "diretoria_receita", "Customer Success Manager": "sdr_bdr",
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
        nomeado = calc([ev("executivo_chegou", 200, "Fulana assume como Head Comercial", vinculoAtual=True)])
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
        r = calc([ev("executivo_chegou", 200, "Nova Diretora de Marketing assume", vinculoAtual=True), ev("vaga_area_alvo", 100, "Analista de Marketing"),
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
        return [ev("executivo_chegou", 220, "Nova CRO assume a área de receita", vinculoAtual=True),
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
        so = calc([ev("executivo_chegou", 200, "Fulana assume como Head Comercial", vinculoAtual=True)])
        com = calc([ev("executivo_chegou", 200, "Fulana assume como Head Comercial", vinculoAtual=True), ev("fusao_aquisicao", 30, "Foi adquirida pelo grupo Beta")])
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
                 ({"sinal": "x", "fonte": "Blog"}, "secundaria"),
                 ({"sinal": "x", "fonte": "Blog", "classification_confidence": 0.7}, "indicio"),
                 ({"sinal": "x", "fonte": "Blog", "classification_confidence": 0.5}, "descartado"),
                 ({"sinal": "x", "fonte": "Blog", "fontes": [{"fonte": "A", "url": "https://a.com/1"}, {"fonte": "B", "url": "https://b.com/2"}]}, "secundaria")]
        for e, nivel in casos:
            self.assertEqual(classificar_fonte(e, P33)[0], nivel, e)  # o documento sozinho nunca se promove


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


# ---------------------------------------------------------------- correções pedidas em 26/11 (segunda rodada)


def _corrob(*evs):
    docs = []
    for i, e in enumerate(evs):
        n, _ = classificar_fonte(e, P33)
        docs.append((n, testemunhos(e, n, f"d{i}", P33)))
    return corroborar([(n, classificar_fonte(e, P33)[1]) for (n, _), e in zip(docs, evs)], [x for _, ts in docs for x in ts], P33)[0]


class TestCorrecoes26(unittest.TestCase):
    # 1. scoreModelo e revisoesPorSinal
    def test_scoremodelo_sobrepoe_parametros_e_reporta_diferencas(self):
        modelo = {"K": 0.5, "cargosReceita": {"head": 82}, "chaveNova": 1, "revisoesPorSinal": {"s1": {"base": 10}}}
        p, difs, sobras = adaptador.parametros_do_modelo(modelo, P32)
        self.assertEqual(p["cargos_receita"]["head"], 82)
        self.assertIn(("cargos_receita.head", 80, 82), difs)
        self.assertIn("chaveNova", sobras)
        self.assertEqual(P32["cargos_receita"]["head"], 80)  # o original não muda

    def test_reconciliador_le_scoremodelo_e_revisoes_do_payload(self):
        import io, json, tempfile, contextlib
        from vscs import reconciliar
        payload = {"geradoEm": "2026-11-26", "scoreVersao": "teste",
                   "scoreModelo": {"cargosReceita": {"head": 80}, "revisoesPorSinal": {"s1": {"pontua": False}, "fantasma": {"base": 1}}},
                   "contas": [{"id": "c", "nome": "Conta Sintética", "tier": "A", "score": 0.0, "v2": {"contribuicoes": []}}],
                   "sinais": [dict(ev("vaga_lideranca_alvo", 1, "Head Comercial", id="s1"), contaId="c")]}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"payload": payload}, f)
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            sys.argv = ["reconciliar", "--snapshot", f.name]
            reconciliar.main()
        txt = saida.getvalue()
        self.assertIn("2 revisões · 1 sem sinal correspondente", txt)
        self.assertIn("1 de 1 contas batem", txt)  # o sinal revisado com pontua=False não pontua: 0 = 0

    def test_revisoes_por_sinal_aceitam_dict_ou_lista_e_guardam_chaves_desconhecidas(self):
        por_dict = adaptador.revisoes({"revisoesPorSinal": {"s1": {"tipoSpec": "nomeacao_head", "baseScore": 75, "x": 1}}})
        self.assertEqual(por_dict["s1"]["chave"], "nomeacao_head")
        self.assertEqual(por_dict["s1"]["base"], 75)
        self.assertEqual(por_dict["s1"]["_desconhecidas"], ["x"])
        por_lista = adaptador.revisoes({"revisoesPorSinal": [{"sinalId": "s2", "pontua": False}]})
        self.assertFalse(por_lista["s2"]["pontua"])

    # 2. revisão individual preservada
    def test_revisao_individual_prevalece_sobre_a_inferencia(self):
        e = ev("executivo_chegou", 10, "Novo CRO assume", id="s1")
        sem = calc([e])
        com = motor33.calcular([e], HOJE, "Empresa Exemplo", None, P32, P33, None, {"s1": {"chave": "nomeacao_head", "base": 80}})
        a = com["movimentos"][0]["acontecimentos"][0]
        self.assertEqual((a["chave"], a["base"], a["revisado"]), ("nomeacao_head", 80, True))
        self.assertLess(com["vscs"], sem["vscs"])
        fora = motor33.calcular([e], HOJE, "Empresa Exemplo", None, P32, P33, None, {"s1": {"pontua": False}})
        self.assertEqual(fora["vscs"], 0.0)

    # 2. cargo do ocupante ou da vaga, não palavras soltas
    def test_cargo_vem_do_papel_no_fato(self):
        self.assertEqual(nivel_cargo(cargo_do_evento({"tipo": "executivo_chegou", "sinal": "Ex-CRO da Beta assume como gerente de parcerias"})[0]), "gerencia")
        self.assertEqual(nivel_cargo(cargo_do_evento({"tipo": "executivo_chegou", "sinal": "Ex-VP da Oracle assume diretoria de vendas"})[0]), "diretoria_receita")
        vaga = {"tipo": "vaga_area_alvo", "sinal": "Vaga de SDR", "porQueAgora": "O time reporta ao CRO e ao Head de Growth"}
        self.assertEqual(nivel_cargo(cargo_do_evento(vaga)[0]), "sdr_bdr")
        self.assertEqual(cargo_do_evento({"tipo": "executivo_chegou", "sinal": "x", "cargo": "Diretora de Marketing"}), ("diretora de marketing", "cargo"))
        self.assertEqual(cargo_do_evento({"tipo": "executivo_chegou", "sinal": "Nova Diretora de Marketing assume"})[0], "diretora de marketing")

    # 3. VP de receita = diretoria executiva (85), salvo evidência de C-level
    def test_vp_de_receita_e_diretoria_salvo_evidencia_clevel(self):
        r = calc([ev("executivo_chegou", 10, "Maria é a nova VP de Vendas")])
        self.assertEqual(r["movimentos"][0]["acontecimentos"][0]["base"], 85)
        r = calc([ev("executivo_chegou", 10, "Maria é a nova VP de Vendas", responsabilidadeClevel=True)])
        self.assertEqual(r["movimentos"][0]["acontecimentos"][0]["base"], 95)

    # 4. corroborar: replicação, release e confiança
    def test_corroboracao_respeita_independencia_e_confianca(self):
        a = {"sinal": "x", "fonte": "Blog A", "url": "https://a.com/1"}
        b = {"sinal": "x", "fonte": "Blog B", "url": "https://b.com/2"}
        self.assertEqual(_corrob(a, b), "secundaria_corroborada")
        self.assertEqual(_corrob(a, dict(b, url="https://a.com/outra")), "secundaria")  # mesmo domínio
        self.assertEqual(_corrob(dict(a, release=True), dict(b, release=True), dict(b, url="https://c.com/3", release=True)), "secundaria")  # mesmo release
        self.assertEqual(_corrob(a, dict(b, release=True), dict(b, url="https://c.com/3", release=True)), "secundaria_corroborada")  # apuração própria + release
        rel = dict(a, release=True, fontes=[{"fonte": "B", "url": "https://b.com/2"}, {"fonte": "C", "url": "https://c.com/3"}])
        self.assertEqual(_corrob(rel), "secundaria")
        rep = dict(a, fontes=[{"fonte": "B", "url": "https://b.com/2", "replicado": True}])
        self.assertEqual(_corrob(rep), "secundaria")
        baixa = dict(b, classification_confidence=0.7)
        self.assertEqual(_corrob(a, baixa), "secundaria")  # indício não testemunha
        self.assertEqual(_corrob(dict(a, classification_confidence=0.7), baixa), "indicio")  # indício nunca é promovido
        com_fontes = dict(a, fontes=[{"fonte": "B", "url": "https://b.com/2"}])
        self.assertEqual(_corrob(com_fontes), "secundaria_corroborada")  # duas fontes independentes listadas no mesmo registro

    # 5. liderança em transição fora da faixa 90+
    def test_lideranca_em_transicao_nao_e_elegivel_a_90(self):
        def mov(i, s, janela, nomeacao, mat="aplicada: x"):
            d = Documento(i, {"sinal": "x"}, {}, HOJE, "institucional", 1.0, [])
            cl = {"chave": "nomeacao_clevel_receita" if nomeacao else "expansao_comercial", "tipo": "troca_lideranca" if nomeacao else "expansao_comercial",
                  "categoria": "lideranca" if nomeacao else "expansao", "base": 95, "nomeacao": nomeacao}
            a = Acontecimento(i, [d], cl, HOJE - timedelta(days=5), "institucional", 1.0, None, s, 1.0, janela, mat if nomeacao else None)
            return Movimento(i, [a], s=s, categoria=cl["categoria"])
        for janela, esperado in (("transicao", True), ("residual", True), ("implementacao", False), ("diagnostico", False)):
            falta = motor33.requisitos_90([(mov("a", 95, janela, True), 80.0), (mov("b", 85, None, False), 10.0)], [], 0.0, HOJE, P33)
            self.assertEqual(any("transicao" in f or "residual" in f for f in falta), esperado, (janela, falta))

    # 6. adaptador dos sinais históricos
    def test_adaptador_interpreta_precisao_confianca_e_fontes(self):
        e = adaptador.adaptar({"id": "h1", "tipo": "vaga_expansao_comercial", "sinal": "x", "data": "2026-11-01", "dataPrecisao": "mes", "confianca": "baixa"}, None, P33)
        self.assertTrue(e["dataEstimada"])
        self.assertEqual(classificar_fonte(e, P33)[0], "indicio")
        self.assertNotIn("dataEstimada", adaptador.adaptar({"dataPrecisao": "dia"}, None, P33))
        self.assertEqual(adaptador.adaptar({"confianca": 0.9}, None, P33)["classification_confidence"], 0.9)
        self.assertEqual(adaptador.adaptar({"confianca": 72}, None, P33)["classification_confidence"], 0.72)
        r = calc([dict(ev("vaga_expansao_comercial", 5, "Contrata 6 executivos comerciais"), dataPrecisao="estimada"),
                  ev("executivo_chegou", 220, "Nova CRO assume a área de receita", vinculoAtual=True)])
        self.assertTrue(any("data estimada" in f for f in r["requisitos_90_pendentes"]))

    # 7. maturação: vínculo atual, mandato de receita e relevância comercial
    def test_maturacao_exige_vinculo_atual_confirmado(self):
        e = ev("executivo_chegou", 300, "Fulano assume como Diretor Comercial", pessoa="Fulano de Tal")
        sem = calc([e])
        a = sem["movimentos"][0]["acontecimentos"][0] if sem["movimentos"] else None
        self.assertTrue(a is None or a["maturacao"].startswith("suspensa"))
        conta_ok = {"comite": [{"nome": "Fulano de Tal", "cargo": "Diretor Comercial"}]}
        ok = motor33.calcular([e], HOJE, "Empresa Exemplo", None, P32, P33, conta_ok)
        self.assertTrue(ok["movimentos"][0]["acontecimentos"][0]["maturacao"].startswith("aplicada"))
        self.assertGreater(ok["vscs"], 70)
        reconfirmar = {"comite": [{"nome": "Fulano de Tal", "cargo": "Diretor Comercial", "statusValidacao": "RECONFIRMAR_VINCULO"}]}
        self.assertLess(motor33.calcular([e], HOJE, "Empresa Exemplo", None, P32, P33, reconfirmar)["vscs"], 10)
        mudou = {"comite": [{"nome": "Fulano de Tal", "cargo": "Conselheiro"}]}
        self.assertLess(motor33.calcular([e], HOJE, "Empresa Exemplo", None, P32, P33, mudou)["vscs"], 10)
        saiu = calc([dict(e, vinculoAtual=False)])
        self.assertLess(saiu["vscs"], 10)

    def test_sem_mandato_de_receita_nao_amadurece(self):
        for titulo in ("Novo CEO assume", "Nova CFO assume", "Fulana assume como Coordenadora de Marketing"):
            r = calc([ev("executivo_chegou", 300, titulo, vinculoAtual=True)])
            for m in r["movimentos"]:
                for a in m["acontecimentos"]:
                    self.assertTrue(a["maturacao"].startswith("sem maturação"), (titulo, a["maturacao"]))
            self.assertLess(r["vscs"], 10, titulo)

    def test_contexto_limitado_e_noticia_setorial_zero(self):
        self.assertEqual(calc([ev("noticia_setorial", 2, "Setor de software cresce 10%")])["vscs"], 0.0)
        ctx = calc([ev("presenca_evento", 2, "Patrocina evento", evento={"papel": "patrocinador"})])
        self.assertLessEqual(ctx["vscs"], 0.85 * 45 + 1e-6)


# ---------------------------------------------------------------- regressões da reconciliação preliminar de 26/11


def conta_com(contribs, nome="Empresa Alfa Software"):
    return {"id": "c", "nome": nome, "comite": [], "v2": {"contribuicoes": contribs}}


class TestRegressoes26b(unittest.TestCase):
    def test_aliases_semanticos_do_scoremodelo(self):
        modelo = {"senioridade": {"operacional": 20, "head": 81, "cLevelReceita": 95}, "vagasOperacionais": {"1": 20, "2": 31, "3-4": 50, "5+": 70},
                  "janelaAgrupamentoDias": 30, "meiaVidaDias": 45, "metaQuantificada": 66,
                  "contexto": "texto descritivo da política de cargos", "criterio": "x", "aprovadoEm": "2026-11-26"}
        p, difs, sobras = adaptador.parametros_do_modelo(modelo, P32)
        self.assertEqual(p["cargos_receita"]["head"], 81)
        self.assertEqual(p["blocos_operacionais"]["duas"], 31)
        self.assertEqual(p["meia_vida"]["contratacao"], 45)
        self.assertEqual(p["bases_30"]["declaracao_meta"], 66)
        self.assertEqual(p["contexto"], P32["contexto"])  # a descrição não sobrescreve o objeto de parâmetros
        self.assertFalse([s for s in sobras if s.split(".")[0] in ("senioridade", "vagasOperacionais", "contexto", "criterio", "aprovadoEm")])

    def test_1_aquisicao_sofrida_nao_vira_aquisicao_realizada(self):
        e = ev("fusao_aquisicao", 20, "Grupo Beta adquire a Alfa Software")
        r = motor32.calcular([e], HOJE, P32, None, None, conta_com([]))
        self.assertEqual(r["contribuicoes"][0]["chave"], "foi_adquirida")
        self.assertEqual(r["vscs"], 0.0)
        e2 = ev("fusao_aquisicao", 20, "Alfa Software adquire a startup Beta")
        self.assertEqual(motor32.calcular([e2], HOJE, P32, None, None, conta_com([]))["contribuicoes"][0]["chave"], "aquisicao_feita")
        # registro prevalece sobre o texto
        reg = conta_com([{"id": e2["id"], "chave": "foi_adquirida", "categoria": "negativo", "base": 30, "fonte": 0.85}])
        self.assertEqual(motor32.calcular([e2], HOJE, P32, None, None, reg)["contribuicoes"][0]["chave"], "foi_adquirida")

    def test_2_gerente_hunter_sem_gestao_nao_e_gerencia(self):
        for titulo in ("Executivo/Gerente Hunter", "Gerente Comercial Hunter", "Gerente de Contas", "Gerente de Relacionamento"):
            self.assertEqual(nivel_cargo(titulo), "sdr_bdr", titulo)
        self.assertEqual(nivel_cargo("Gerente de Vendas"), "gerencia")

    def test_3_chave_legada_de_revisao_mantem_lideranca(self):
        e = ev("executivo_chegou", 30, "texto qualquer", id="s1")
        r = motor32.calcular([e], HOJE, P32, None, {"s1": {"chave": "troca_lideranca_head", "base": 80}})
        c = r["contribuicoes"][0]
        self.assertEqual((c["chave"], c["categoria"], c["tipo"]), ("nomeacao_head", "lideranca", "troca_lideranca"))
        for chave in ("vaga_gerencia", "vaga_coordenacao"):
            e = ev("vaga_area_alvo", 5, "texto", id="s2")
            c = motor32.calcular([e], HOJE, P32, None, {"s2": {"chave": chave, "base": 70}})["contribuicoes"][0]
            self.assertEqual((c["tipo"], c["categoria"]), ("vaga_lideranca_alvo", "contratacao"), chave)
        r33 = motor33.calcular([ev("executivo_chegou", 30, "texto qualquer", id="s3")], HOJE, "x", None, P32, P33, None,
                               {"s3": {"chave": "troca_lideranca_head", "base": 80}})
        self.assertEqual(r33["movimentos"][0]["acontecimentos"][0]["janela_lideranca"], "diagnostico")

    def test_4_nomeacao_registrada_nao_se_perde_quando_o_texto_nao_tem_cargo(self):
        e = ev("executivo_chegou", 20, "Empresa anuncia mudança na liderança")
        reg = conta_com([{"id": e["id"], "chave": "troca_lideranca_owner", "categoria": "lideranca", "base": 85, "fonte": 0.85}])
        self.assertEqual(motor32.calcular([e], HOJE, P32, None, None, conta_com([]))["contribuicoes"], [])
        c = motor32.calcular([e], HOJE, P32, None, None, reg)["contribuicoes"][0]
        self.assertEqual((c["chave"], c["base"], c["fonte"]), ("nomeacao_diretoria_receita", 85, 0.85))

    def test_5_bloco_registrado_nao_e_reagrupado_e_familias_nao_se_misturam(self):
        evs = [ev("vaga_area_alvo", 3, "SDR"), ev("vaga_area_alvo", 5, "BDR")]
        reg = conta_com([{"id": evs[0]["id"], "chave": "vaga_area_alvo", "categoria": "contratacao", "base": 20, "fonte": 1.0},
                         {"id": evs[1]["id"], "chave": "vaga_area_alvo", "categoria": "contratacao", "base": 20, "fonte": 1.0}])
        cs = motor32.calcular(evs, HOJE, P32, None, None, reg)["contribuicoes"]
        self.assertEqual(sorted(c["base"] for c in cs), [20, 20])  # cada registro fica como foi validado

    def test_6_contexto_so_pontua_com_classificacao_explicita(self):
        e = ev("presenca_evento", 2, "Patrocina evento do setor", evento={"papel": "patrocinador"})
        self.assertEqual(motor32.calcular([e], HOJE, P32)["contribuicoes"], [])
        reg = conta_com([{"id": e["id"], "chave": "presenca_patrocinador", "categoria": "contexto", "base": 45, "fonte": 1.0}])
        self.assertEqual(len(motor32.calcular([e], HOJE, P32, None, None, reg)["contribuicoes"]), 1)
        decidido = dict(ev("palestra_lideranca", 2, "Palestra"), tipoSpec=None, categoria=None, nivel=None)
        self.assertEqual(motor32.calcular([decidido], HOJE, P32)["contribuicoes"], [])

    def test_7_fonte_efetiva_registrada_e_preservada(self):
        e = ev("expansao_mercado", 5, "Chega a Curitiba com equipe comercial", fonte="Comunicado oficial da empresa")
        reg = conta_com([{"id": e["id"], "chave": "expansao_comercial", "categoria": "expansao", "base": 85, "fonte": 0.85}])
        self.assertEqual(motor32.calcular([e], HOJE, P32, None, None, reg)["contribuicoes"][0]["fonte"], 0.85)
        a = motor33.calcular([e], HOJE, "x", None, P32, P33, reg)["movimentos"][0]["acontecimentos"][0]
        self.assertEqual(a["fator_fonte"], 0.85)
        self.assertEqual(classificar_fonte({"sinal": "x", "fonte": "Site oficial da empresa"}, P33)[0], "institucional")
        self.assertEqual(classificar_fonte({"sinal": "x", "fonte": "Página de Carreiras"}, P33)[0], "institucional")

    def test_8_marco_historico_nao_e_meta(self):
        marco = ev("expansao_mercado", 5, "Empresa fechou 2025 com faturamento de R$ 50 milhões e cresceu 40%")
        meta = ev("expansao_mercado", 5, "Empresa projeta faturar R$ 18 milhões em 2026")
        self.assertNotEqual(motor32.calcular([marco], HOJE, P32)["contribuicoes"][0]["chave"], "declaracao_meta")
        self.assertEqual(motor32.calcular([meta], HOJE, P32)["contribuicoes"][0]["chave"], "declaracao_meta")

    def test_9_registro_nao_congela_o_tempo(self):
        e = ev("vaga_expansao_comercial", 40, "Contrata 6 executivos comerciais")
        reg = conta_com([{"id": e["id"], "chave": "expansao_comercial", "categoria": "expansao", "base": 85, "fonte": 1.0,
                          "tempo": 1.0, "s": 85, "correlacao": 1.0}])
        c = motor32.calcular([e], HOJE, P32, None, None, reg)["contribuicoes"][0]
        self.assertLess(c["tempo"], 1.0)  # o tempo é recalculado na data de referência; s gravado não vira peso permanente

    def test_calibracao_registrada_no_sinal(self):
        absorvida = dict(ev("vaga_area_alvo", 3, "Analista de pré-vendas"), calibracao={"base": 0, "agrupadoEm": "bloco-1"})
        dupla = dict(ev("expansao_mercado", 60, "Planeja expansão internacional"), calibracao={"base": 0, "motivo": "sem dupla contagem"})
        contexto = dict(ev("palestra_lideranca", 3, "CEO palestra no evento"), calibracao={"motivo": "Aceito como contexto; sem pontuação automática."})
        for e in (absorvida, dupla, contexto):
            self.assertEqual(motor32.calcular([e], HOJE, P32)["contribuicoes"], [], e["sinal"])
        decidida = dict(ev("lancamento_produto", 3, "Lança módulo"), calibracao={"base": 50, "versao": "vscs-3.2-contexto-cargos"})
        self.assertEqual(motor32.calcular([decidida], HOJE, P32)["contribuicoes"][0]["base"], 50)
        vaga = dict(ev("vaga_area_alvo", 3, "SDR"), calibracao={"base": 35})
        self.assertEqual(motor32.calcular([vaga], HOJE, P32)["contribuicoes"][0]["base"], 35)
        r33 = motor33.calcular([absorvida, dupla, contexto], HOJE, "x", None, P32, P33)
        self.assertEqual(r33["vscs"], 0.0)

    def test_10_declaracao_so_e_encerrada_pela_mesma_decisao(self):
        meta = ev("expansao_mercado", 60, "Planeja crescer 50% e abrir operação no México em 2027")
        vaga = ev("vaga_lideranca_alvo", 10, "Head de Marketing")
        cs = motor32.calcular([meta, vaga], HOJE, P32)["contribuicoes"]
        self.assertIn("declaracao_meta", [c["chave"] for c in cs])
        execucao = ev("nova_unidade", 10, "Abre escritório no México")
        cs = motor32.calcular([meta, execucao], HOJE, P32)["contribuicoes"]
        self.assertNotIn("declaracao_meta", [c["chave"] for c in cs])
        r = motor33.calcular([ev("expansao_mercado", 60, "Planeja expansão nacional"), ev("nova_unidade", 10, "Abre escritório em Curitiba")], HOJE, "x", None, P32, P33)
        self.assertEqual(len(r["movimentos"]), 2)  # sem vínculo causal, R3 não junta


if __name__ == "__main__":
    unittest.main()
