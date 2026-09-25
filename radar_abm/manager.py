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
    nomes = [args.conector] if args.conector else [n for n in ("cnpj", "noticias", "apollo") if n in CONECTORES]
    ids = [i.strip() for i in args.contas.split(",")] if args.contas else None
    contas = selecionar_contas(conn, ids=ids, tier=args.tier, limite=args.limite)
    resumo = []
    for nome in nomes:
        http = ClienteLocal(f"{args.fixtures}/{nome}") if args.fixtures else None
        if args.fixtures and not Path(args.fixtures, nome).is_dir():
            print(f"== {nome}: sem respostas salvas em {args.fixtures}/{nome}; conector pulado")
            continue
        ex = CONECTORES[nome](conn, http=http, dry_run=args.dry_run).executar(contas)
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
    r.add_argument("--saida", default="aliases_revisar.csv")
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
    s.add_argument("--conector", choices=["cnpj", "noticias", "apollo"], help="só este conector")
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
    s.add_argument("--conector", choices=["cnpj", "noticias", "apollo"], help=argparse.SUPPRESS)
    s.add_argument("--contas", help="ids separados por vírgula")
    s.add_argument("--tier")
    s.add_argument("--limite", type=int)
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--fixtures", metavar="PASTA", help=argparse.SUPPRESS)
    s.set_defaults(f=cmd_semana)

    s = sub.add_parser("execucoes", help="últimas execuções dos conectores")
    s.add_argument("--limite", type=int, default=20)
    s.set_defaults(f=cmd_execucoes)

    args = p.parse_args(argv)
    args.f(args)


if __name__ == "__main__":
    sys.exit(main())
