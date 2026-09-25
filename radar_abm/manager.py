"""Radar de sinais ABM da Velora. Uso: python manager.py <comando> [opções]. Veja python manager.py -h."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from abm import aliases, config, db, importador, qualidade


def _conn():
    config.carregar_env()
    conn = db.conectar(config.caminho_banco())
    db.migrar(conn)
    return conn


def cmd_iniciar(args) -> None:
    config.carregar_env()
    conn = db.conectar(config.caminho_banco())
    feitas = db.migrar(conn)
    print(f"Banco em {config.caminho_banco()}: " + (f"aplicadas {', '.join(feitas)}" if feitas else "já estava atualizado"))


def cmd_importar(args) -> None:
    conn = _conn()
    planilha = importador.ler(args.arquivo)
    print(f"Aba de contas: '{planilha.contas.nome}', cabeçalho na linha {planilha.contas.linha_cabecalho}, "
          f"{len(planilha.contas.linhas)} linhas")
    if planilha.pessoas:
        print(f"Aba de pessoas: '{planilha.pessoas.nome}', cabeçalho na linha {planilha.pessoas.linha_cabecalho}, "
              f"{len(planilha.pessoas.linhas)} linhas")
    rel = importador.importar(conn, planilha, dry_run=args.dry_run)
    print(("DRY-RUN: nada foi gravado. " if args.dry_run else "")
          + f"{rel.linhas} linhas: {rel.novas} contas novas, {rel.atualizadas} atualizadas, {rel.pessoas} pessoas novas")
    for titulo, lista in (("Filiais registradas", rel.filiais), ("Contas juntadas", rel.mescladas),
                          ("CNPJ inválido", rel.cnpj_invalidos), ("Avisos", rel.avisos)):
        if lista:
            print(f"{titulo} ({len(lista)}):")
            for linha in lista[:15]:
                print(f"  {linha}")
            if len(lista) > 15:
                print(f"  ... e mais {len(lista) - 15}")
    if not args.dry_run:
        r = aliases.gerar(conn)
        print(f"Aliases: {r['criados']} criados, {r['ambiguos']} ambíguos para revisar "
              "(python manager.py aliases revisar)")
        print("Próximo passo: python manager.py qualidade")


def cmd_qualidade(args) -> None:
    conn = _conn()
    qualidade.imprimir(qualidade.relatorio(conn), limite=args.limite)
    if args.pendencias:
        n = qualidade.exportar_pendencias(conn, args.pendencias)
        print(f"\n{n} contas sem CNPJ ou sem site em {args.pendencias}. Preencha as colunas cnpj e site e rode "
              f"python manager.py importar {args.pendencias}")


def cmd_aliases(args) -> None:
    conn = _conn()
    if args.acao == "gerar":
        r = aliases.gerar(conn)
        print(f"{r['criados']} aliases criados, {r['ambiguos']} ambíguos")
    elif args.acao == "revisar":
        args.saida = args.saida or str(config.pasta_saidas() / "aliases_revisar.csv")
        n = aliases.exportar_revisao(conn, args.saida)
        print(f"{n} aliases ambíguos em {args.saida}.")
        print("Na coluna 'usar', escreva sim ou nao. Em 'termos_negativos', palavras que indicam outra empresa,")
        print(f"separadas por ponto e vírgula. Depois: python manager.py aliases aplicar {args.saida}")
    elif args.acao == "aplicar":
        r = aliases.aplicar_revisao(conn, args.arquivo)
        print(f"{r['ligados']} ligados, {r['desligados']} desligados, {r['ignorados']} linhas sem decisão")
    elif args.acao == "listar":
        for a in conn.execute("select * from aliases where conta_id = ? order by tipo", (args.conta,)):
            estado = "ligado" if a["ativo"] else "desligado"
            ambiguo = f"  ambíguo: {a['motivo']}" if a["ambiguo"] else ""
            negativos = f"  negativos: {a['termos_negativos']}" if a["termos_negativos"] else ""
            print(f"{a['tipo']:<9} {estado:<9} {a['termo']}{ambiguo}{negativos}")
    elif args.acao == "adicionar":
        aliases.adicionar(conn, args.conta, args.termo, args.negativos or "")
        print(f"Alias '{args.termo}' ligado para {args.conta}")


def cmd_coletar(args) -> None:
    from abm.conectores import CONECTORES
    from abm.conectores.base import selecionar_contas
    from abm.conectores.http import ClienteLocal

    conn = _conn()
    # Ordem: CNPJ primeiro (completa razão social, que vira alias), depois notícias, depois Apollo.
    nomes = [args.conector] if args.conector else [n for n in ("cnpj", "noticias", "vagas", "apollo") if n in CONECTORES]
    ids = [i.strip() for i in args.contas.split(",")] if args.contas else None
    contas = selecionar_contas(conn, ids=ids, tier=args.tier, limite=args.limite)
    resumo = []
    for nome in nomes:
        http = ClienteLocal(f"{args.fixtures}/{nome}") if args.fixtures else None
        if args.fixtures and not Path(args.fixtures, nome).is_dir():
            print(f"== {nome}: sem respostas salvas em {args.fixtures}/{nome}; conector pulado")
            continue
        extra = {}
        if nome == "vagas":
            from abm.conectores.vagas import ler_arquivo

            arquivo_vagas = getattr(args, "arquivo_vagas", None)
            extra = {"arquivo": ler_arquivo(arquivo_vagas) if arquivo_vagas else None,
                     "usar_paginas": not getattr(args, "sem_paginas", False)}
        ex = CONECTORES[nome](conn, http=http, dry_run=args.dry_run, **extra).executar(contas)
        resumo.append(f"{nome}: {ex.itens} novidade(s), {len(ex.erros)} erro(s)")
        if nome == "cnpj" and not args.dry_run:
            r = aliases.gerar(conn)  # razões sociais novas viram aliases antes da busca de notícias
            if r["criados"]:
                print(f"Aliases: {r['criados']} novos a partir das razões sociais ({r['ambiguos']} ambíguos)")
        contas = selecionar_contas(conn, ids=ids, tier=args.tier, limite=args.limite)  # relê: CNPJ pode ter completado dados
    print("\nResumo da coleta: " + " | ".join(resumo))


def _taxonomia():
    from abm.taxonomia import TaxonomiaInvalida, carregar

    try:
        return carregar()
    except TaxonomiaInvalida as e:
        sys.exit(f"sinais.yaml inválido: {e}")


def cmd_taxonomia(args) -> None:
    config.carregar_env()
    tax = _taxonomia()
    print(f"sinais.yaml v{tax.versao} válido: {len(tax.tipos)} tipos, limiar de confiança {tax.limiar_confianca}")
    for braco in ("servicos_profissionais", "servicos_financeiros", "tecnologia"):
        print(f"\n{braco}:")
        for t in tax.tipos_para(braco):
            print(f"  {t.id:<24} peso {t.peso:>2}  meia-vida {t.meia_vida_dias:>3}d  acorda {t.membro_comite:<13} {t.rotulo}")


def cmd_classificar(args) -> None:
    from abm import classificador

    conn = _conn()
    tax = _taxonomia()
    c = classificador.ClassificadorRegras() if args.regras else classificador.padrao()
    ids = [i.strip() for i in args.contas.split(",")] if args.contas else None
    classificador.classificar(conn, c, tax, dry_run=args.dry_run, contas=ids, limite=args.limite)


def cmd_sinais(args) -> None:
    conn = _conn()
    sql = "select s.*, c.nome_fantasia from sinais s join contas c on c.id = s.conta_id where 1 = 1"
    params: list = []
    if args.status:
        sql += " and s.status = ?"
        params.append(args.status)
    if args.conta:
        sql += " and s.conta_id = ?"
        params.append(args.conta)
    linhas = conn.execute(sql + " order by s.data_alerta desc limit ?", (*params, args.limite)).fetchall()
    if not linhas:
        print("Nenhum sinal.")
    for s in linhas:
        print(f"{s['id']}  {s['status']:<10} {s['conta_id']:<7} {s['nome_fantasia'][:28]:<28} {s['tipo']:<24} "
              f"conf {s['confianca'] or 0:.2f}  fato {s['data_fato'] or '-'}")
        if s["por_que_agora"]:
            print(f"      por que agora: {s['por_que_agora'][:150]}")
        print(f"      evidência: {(s['evidencia_trecho'] or '')[:150]}  {s['evidencia_url'] or ''}")


def cmd_sinal(args) -> None:
    conn = _conn()
    feito = conn.execute("update sinais set status = ? where id = ?", (args.status, args.id)).rowcount
    conn.commit()
    print(f"Sinal {args.id}: {args.status}" if feito else f"Sinal {args.id} não encontrado")


def cmd_score(args) -> None:
    from abm.score import pontuar

    conn = _conn()
    ranking = pontuar(conn, _taxonomia())
    if not ranking:
        print("Nenhuma conta com sinal em alerta ainda.")
    for pos, c in enumerate(ranking[: args.top], 1):
        print(f"{pos:>3}. {c.score:>6.2f}  {c.conta_id:<7} {c.nome[:40]:<40} tier {c.tier or '-'}")
        for p in c.parcelas[:3]:
            print(f"          {p.valor:>5.2f} = peso {p.peso} × conf {p.confianca:.2f} × meia-vida ({p.idade_dias}d de {p.meia_vida_dias}d)  {p.tipo}")


def cmd_digest(args) -> None:
    from datetime import date

    from abm import digest

    conn = _conn()
    hoje = date.today()
    destino = args.saida or str(config.pasta_saidas() / f"digest-{hoje.isoformat()}.html")
    d = digest.gerar(conn, _taxonomia(), destino, hoje=hoje, top=args.top)
    print(f"Digest em {destino}: {d['total_esquentaram']} conta(s) esquentaram, "
          f"{sum(len(c['sinais']) for c in d['contas'])} sinal(is) novo(s), {len(d['revisar'])} para revisar")


def cmd_feedback(args) -> None:
    from abm.metricas import SinalNaoEncontrado, registrar_feedback

    conn = _conn()
    try:
        status = registrar_feedback(conn, args.id, args.avaliacao, args.comentario or "")
    except SinalNaoEncontrado as e:
        sys.exit(str(e))
    efeito = {"descartado": "descartado: saiu do score", "alerta": "em alerta: conta no score"}.get(status, status)
    print(f"Feedback '{args.avaliacao}' registrado para {args.id}. Sinal {efeito}.")


def cmd_metricas(args) -> None:
    from abm import metricas

    metricas.imprimir(metricas.calcular(_conn(), dias=args.dias))


def cmd_semana(args) -> None:
    """A rotina da semana num comando só: coletar, classificar, gerar o digest."""
    cmd_coletar(args)
    print()
    cmd_classificar(argparse.Namespace(regras=False, contas=args.contas, limite=None, dry_run=args.dry_run))
    if not args.dry_run:
        print()
        cmd_digest(argparse.Namespace(saida=None, top=15))


def cmd_vagas(args) -> None:
    conn = _conn()
    if args.acao == "importar":
        # Só as vagas do arquivo, sem visitar as páginas de carreiras.
        cmd_coletar(argparse.Namespace(conector="vagas", contas=None, tier=None, limite=None, dry_run=args.dry_run,
                                       fixtures=None, arquivo_vagas=args.arquivo, sem_paginas=True))
    elif args.acao in ("pagina", "paginas"):
        from abm.conectores.plataformas import reconhecer

        if args.acao == "pagina":
            pares = [(args.conta, args.url)]
        else:
            import csv as _csv

            with open(args.arquivo, encoding="utf-8-sig") as f:
                pares = [((r.get("id_conta") or "").strip(), (r.get("url") or "").strip()) for r in _csv.DictReader(f)]
        for conta_id, url in pares:
            if not conn.execute("select 1 from contas where id = ?", (conta_id,)).fetchone():
                print(f"{conta_id}: conta não encontrada")
                continue
            if url != "-" and not reconhecer(url):
                print(f"{conta_id}: {url} não é de uma plataforma conhecida (Gupy, Greenhouse, Lever, Ashby, Sólides); "
                      "as vagas dessa empresa entram pelo arquivo")
                continue
            conn.execute("update contas set vagas_url = ? where id = ?", (url, conta_id))
            print(f"{conta_id}: " + ("página de vagas desligada" if url == "-" else f"{reconhecer(url)[0].nome} {url}"))
        conn.commit()
    elif args.acao == "consultorias":
        from abm import pistas

        tax = _taxonomia()
        linhas = pistas.ler_arquivo(args.arquivo)
        print(f"{len(linhas)} vaga(s) de consultorias no arquivo" + ("  (DRY-RUN: nada será gravado)" if args.dry_run else ""))
        r = pistas.importar(conn, linhas, tax, dry_run=args.dry_run)
        print(f"Resumo: {r.novas} nova(s) ({r.com_candidatas} pista(s) com contas candidatas, {r.ligadas} ligada(s) direto "
              f"pelo nome, {r.sem_candidata} sem conta na cidade, {r.fora_do_icp} fora do ICP); "
              f"{len(r.fora_dos_grupos)} fora dos grupos de vaga; {r.repetidas} já vista(s)")
        if r.com_candidatas and not args.dry_run:
            if config.valor("ANTHROPIC_API_KEY") and not args.sem_claude:
                from abm import ordenar_pistas

                print()
                ordenar_pistas.ordenar(conn, ordenar_pistas.OrdenadorClaude())
            else:
                print("Sem ANTHROPIC_API_KEY: as candidatas ficam na ordem por pontos (cidade, setor, tier). "
                      "Com a chave: python manager.py vagas ordenar")
            print("Confirme a empresa de cada pista: python manager.py vagas atribuir <pista> <conta>  (ou - para descartar)")
    elif args.acao == "ordenar":
        from abm import ordenar_pistas

        if not config.valor("ANTHROPIC_API_KEY") and not args.dry_run:
            sys.exit("Ordenar as candidatas usa a API do Claude: preencha ANTHROPIC_API_KEY no .env (ou use --dry-run).")
        ordenar_pistas.ordenar(conn, ordenar_pistas.OrdenadorClaude(), pista_id=args.pista, refazer=args.refazer,
                               dry_run=args.dry_run)
    elif args.acao == "pistas":
        from abm import pistas

        abertas = pistas.abertas(conn)
        if not abertas:
            print("Nenhuma pista aberta.")
        for p in abertas:
            print(f"{p['id']}  {p['consultoria']}: {p['titulo']} ({p['local'] or '-'})  {p['url'] or ''}")
            print(f"      {(p['descricao'] or '')[:160]}")
            if p.get("ordenado_por"):
                print(f"      ordenadas por {p['ordenado_por']}" + (f"; sugestão: {p['sugestao_conta']}" if p.get("sugestao_conta") else ""))
            for c in p["candidatas"]:
                prob = f"prob. {c['prob']:.2f}" if c.get("prob") is not None else f"{c['pontos']} pts"
                print(f"      candidata {c['conta_id']:<7} {c['nome'][:35]:<35} {prob}: {c.get('motivo_ia') or '; '.join(c['motivos'])}")
    elif args.acao == "atribuir":
        from abm import pistas

        try:
            r = pistas.atribuir(conn, args.pista, args.conta, _taxonomia())
        except pistas.PistaInvalida as e:
            sys.exit(str(e))
        print(f"Pista {args.pista} descartada." if r == "descartada" else f"Pista {args.pista} ligada a {args.conta}: sinal {r} em alerta.")
    elif args.acao == "contas":
        # Lista para a rotina do Indeed (VAGAS_ROTINA.md): quem procurar e onde.
        destino = args.saida
        import csv as _csv

        with open(destino, "w", newline="", encoding="utf-8") as f:
            w = _csv.writer(f)
            w.writerow(["id_conta", "empresa", "cidade", "uf", "tier", "site", "pagina_vagas"])
            for c in conn.execute("select * from contas where (? is null or tier = ?) order by coalesce(tier, 'Z'), nome_fantasia",
                                  (args.tier, args.tier)):
                w.writerow([c["id"], c["nome_fantasia"], c["cidade"] or "", c["uf"] or "", c["tier"] or "",
                            c["dominio"] or "", c["vagas_url"] or ""])
        print(f"Lista de contas para a rotina de vagas em {destino}")


def cmd_execucoes(args) -> None:
    conn = _conn()
    linhas = conn.execute("select * from execucoes order by inicio desc limit ?", (args.limite,)).fetchall()
    if not linhas:
        print("Nenhuma execução registrada ainda.")
    for e in linhas:
        print(f"{e['inicio']}  {e['conector']:<14} {e['itens']:>4} itens  {e['erros']:>3} erros  fim {e['fim']}")
        if e["detalhe"]:
            for linha in e["detalhe"].splitlines()[:5]:
                print(f"    {linha}")


def cmd_painel(args) -> None:
    import json

    from abm import painel

    conn = _conn()
    contas = painel.ContasDoPainel.ler(args.painel_baixado, args.espaco)
    if not contas.carregado:
        print("Sem --painel-baixado: a conta do painel é achada só pela raiz do CNPJ, e não confiro o que o painel já tem.")
    res = painel.exportar(conn, args.espaco, contas, reenviar=args.reenviar, dry_run=args.dry_run)
    for titulo, lista in (("Sem tipo equivalente no painel", res.sem_tipo), ("Conta não achada no painel", sorted(set(res.sem_conta)))):
        if lista:
            print(f"{titulo} ({len(lista)}): " + "; ".join(lista[:10]) + (" ..." if len(lista) > 10 else ""))
    if args.dry_run or not res.documentos:
        return
    destino = Path(args.saida or config.pasta_saidas() / f"painel_caixa_{args.espaco}.json")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"artifact": args.artifact, "espaco": args.espaco,
                                   "lotes": painel.lotes(args.espaco, res.documentos)}, ensure_ascii=False, indent=1),
                       encoding="utf-8")
    print(f"Arquivo pronto em {destino}. Peça ao Claude: \"grave no painel os lotes de {destino.name}\" "
          "(ele usa a ferramenta de dados do artifact, um lote por vez). No painel, os sinais aparecem na caixa "
          "Captados pela IA, na aba Sinais, esperando aprovação.")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="manager.py", description="Radar de sinais ABM da Velora")
    sub = p.add_subparsers(dest="comando", required=True)

    sub.add_parser("iniciar", help="cria o banco (ou aplica migrações novas)").set_defaults(f=cmd_iniciar)

    s = sub.add_parser("importar", help="importa contas e pessoas de CSV, XLSX ou XLSM")
    s.add_argument("arquivo")
    s.add_argument("--dry-run", action="store_true", help="mostra o que faria, sem gravar")
    s.set_defaults(f=cmd_importar)

    s = sub.add_parser("qualidade", help="relatório do que falta na base")
    s.add_argument("--pendencias", metavar="ARQUIVO.csv", help="exporta contas sem CNPJ ou site para preencher")
    s.add_argument("--limite", type=int, default=10, help="quantos exemplos mostrar por item")
    s.set_defaults(f=cmd_qualidade)

    s = sub.add_parser("aliases", help="nomes usados nas buscas")
    acoes = s.add_subparsers(dest="acao", required=True)
    acoes.add_parser("gerar", help="cria os aliases que faltam")
    r = acoes.add_parser("revisar", help="exporta os ambíguos para você decidir")
    r.add_argument("--saida", help="padrão: saidas/aliases_revisar.csv (fora do Git)")
    r = acoes.add_parser("aplicar", help="aplica a planilha de revisão")
    r.add_argument("arquivo")
    r = acoes.add_parser("listar", help="mostra os aliases de uma conta")
    r.add_argument("conta")
    r = acoes.add_parser("adicionar", help="acrescenta um alias seu")
    r.add_argument("conta")
    r.add_argument("termo")
    r.add_argument("--negativos", help="termos negativos separados por ;")
    s.set_defaults(f=cmd_aliases)

    s = sub.add_parser("coletar", help="roda os conectores (todos, ou um com --conector)")
    s.add_argument("--conector", choices=["cnpj", "noticias", "vagas", "apollo"], help="só este conector")
    s.add_argument("--arquivo-vagas", metavar="CSV", help="vagas trazidas de outras fontes (Indeed etc.; veja VAGAS_ROTINA.md)")
    s.add_argument("--sem-paginas", action="store_true", help="vagas: não visitar as páginas de carreiras")
    s.add_argument("--contas", help="ids separados por vírgula (ex.: T-001,F-003)")
    s.add_argument("--tier", help="só contas deste tier (A, B ou C)")
    s.add_argument("--limite", type=int, help="no máximo N contas")
    s.add_argument("--dry-run", action="store_true", help="mostra passo a passo o que faria, sem gravar")
    s.add_argument("--fixtures", metavar="PASTA", help="usa respostas salvas em PASTA/<conector>/ em vez da internet")
    s.set_defaults(f=cmd_coletar)

    sub.add_parser("taxonomia", help="confere o sinais.yaml e lista os tipos por braço").set_defaults(f=cmd_taxonomia)

    s = sub.add_parser("classificar", help="classifica as notícias pendentes (Claude, ou regras sem chave)")
    s.add_argument("--contas", help="ids separados por vírgula")
    s.add_argument("--limite", type=int, help="no máximo N notícias")
    s.add_argument("--regras", action="store_true", help="usa o classificador por regras mesmo com chave")
    s.add_argument("--dry-run", action="store_true", help="mostra o que faria, sem gravar (com Claude, nem chama a API)")
    s.set_defaults(f=cmd_classificar)

    s = sub.add_parser("sinais", help="lista sinais (ex.: --status revisar)")
    s.add_argument("--status", choices=["alerta", "revisar", "descartado"])
    s.add_argument("--conta")
    s.add_argument("--limite", type=int, default=30)
    s.set_defaults(f=cmd_sinais)

    s = sub.add_parser("sinal", help="muda o status de um sinal (aprovar um 'revisar', por exemplo)")
    s.add_argument("id")
    s.add_argument("status", choices=["alerta", "revisar", "descartado"])
    s.set_defaults(f=cmd_sinal)

    s = sub.add_parser("score", help="contas mais quentes: soma dos sinais com decaimento")
    s.add_argument("--top", type=int, default=20)
    s.set_defaults(f=cmd_score)

    s = sub.add_parser("digest", help="gera o HTML semanal com as contas que mais esquentaram")
    s.add_argument("--saida", help="arquivo de saída (padrão: saidas/digest-AAAA-MM-DD.html)")
    s.add_argument("--top", type=int, default=15)
    s.set_defaults(f=cmd_digest)

    s = sub.add_parser("feedback", help="avalia um sinal: util aprova, ruido descarta")
    s.add_argument("id")
    s.add_argument("avaliacao", choices=["util", "ruido"])
    s.add_argument("--comentario")
    s.set_defaults(f=cmd_feedback)

    s = sub.add_parser("metricas", help="precisão, latência e volume por conector")
    s.add_argument("--dias", type=int, default=30, help="período (0 = tudo)")
    s.set_defaults(f=cmd_metricas)

    s = sub.add_parser("semana", help="coletar + classificar + digest, em sequência")
    s.add_argument("--conector", choices=["cnpj", "noticias", "vagas", "apollo"], help=argparse.SUPPRESS)
    s.add_argument("--arquivo-vagas", metavar="CSV", help="vagas trazidas de outras fontes (Indeed etc.)")
    s.add_argument("--sem-paginas", action="store_true", help=argparse.SUPPRESS)
    s.add_argument("--contas", help="ids separados por vírgula")
    s.add_argument("--tier")
    s.add_argument("--limite", type=int)
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--fixtures", metavar="PASTA", help=argparse.SUPPRESS)
    s.set_defaults(f=cmd_semana)

    s = sub.add_parser("vagas", help="vagas: importar arquivo, definir páginas de carreiras, listar contas para a rotina")
    acoes = s.add_subparsers(dest="acao", required=True)
    r = acoes.add_parser("importar", help="importa um CSV de vagas (Indeed e outras fontes)")
    r.add_argument("arquivo")
    r.add_argument("--dry-run", action="store_true")
    r = acoes.add_parser("pagina", help="define a página de carreiras da conta (Gupy, Greenhouse, Lever, Ashby, Sólides; - desliga)")
    r.add_argument("conta")
    r.add_argument("url")
    r = acoes.add_parser("paginas", help="define páginas de carreiras em lote (CSV com id_conta,url)")
    r.add_argument("arquivo")
    r = acoes.add_parser("consultorias", help="importa vagas de consultorias (Michael Page, Robert Half...) como pistas")
    r.add_argument("arquivo")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--sem-claude", action="store_true", help="não pedir ao Claude para ordenar as candidatas")
    r = acoes.add_parser("ordenar", help="o Claude ordena as contas candidatas das pistas abertas")
    r.add_argument("--pista", help="só esta pista")
    r.add_argument("--refazer", action="store_true", help="ordena de novo as que já foram ordenadas")
    r.add_argument("--dry-run", action="store_true")
    acoes.add_parser("pistas", help="lista as pistas abertas com as contas candidatas")
    r = acoes.add_parser("atribuir", help="confirma a conta de uma pista (vira sinal) ou descarta com -")
    r.add_argument("pista")
    r.add_argument("conta")
    r = acoes.add_parser("contas", help="exporta a lista de contas para a rotina do Indeed")
    r.add_argument("--saida", default="saidas/contas_vagas.csv")
    r.add_argument("--tier")
    s.set_defaults(f=cmd_vagas)

    s = sub.add_parser("painel", help="prepara os sinais para a caixa Captados pela IA do painel publicado")
    s.add_argument("--espaco", default="velora-cnpj70", help="id do espaço no painel (padrão: velora-cnpj70)")
    s.add_argument("--artifact", default="https://claude.ai/artifact/7cRJtmAGEYnia4TdvF5wK8")
    s.add_argument("--painel-baixado", help="pasta com o banco do painel baixado (contas, sinais e caixa) para achar as contas e não repetir")
    s.add_argument("--reenviar", action="store_true", help="inclui sinais já enviados antes")
    s.add_argument("--saida", help="padrão: saidas/painel_caixa_<espaço>.json")
    s.add_argument("--dry-run", action="store_true")
    s.set_defaults(f=cmd_painel)

    s = sub.add_parser("execucoes", help="últimas execuções dos conectores")
    s.add_argument("--limite", type=int, default=20)
    s.set_defaults(f=cmd_execucoes)

    args = p.parse_args(argv)
    args.f(args)


if __name__ == "__main__":
    sys.exit(main())
