"""Radar de sinais ABM da Velora. Uso: python manager.py <comando> [opções]. Veja python manager.py -h."""

from __future__ import annotations

import argparse
import sys

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

    s = sub.add_parser("execucoes", help="últimas execuções dos conectores")
    s.add_argument("--limite", type=int, default=20)
    s.set_defaults(f=cmd_execucoes)

    args = p.parse_args(argv)
    args.f(args)


if __name__ == "__main__":
    sys.exit(main())
