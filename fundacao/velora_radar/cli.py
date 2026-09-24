"""Linha de comando: python -m velora_radar <comando>."""

from __future__ import annotations

import argparse
import json
import sys

from . import db, dominios, importar, rubrica, visao


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="velora_radar", description="Fundação de dados do Radar de Sinais Velora")
    sub = p.add_subparsers(dest="comando", required=True)
    sub.add_parser("migrar", help="aplica as migrações e registra a rubrica inicial")
    imp = sub.add_parser("importar", help="migra uma planilha (CSV ou XLSX) para o banco")
    imp.add_argument("arquivo")
    imp.add_argument("--origem", default="planilha")
    bur = sub.add_parser("buracos", help="mostra os buracos abertos da migração")
    bur.add_argument("--detalhe", action="store_true")
    dom = sub.add_parser("dominios", help="modo DOMÍNIOS: lista de trabalho e aplicação das resoluções")
    dom_sub = dom.add_subparsers(dest="acao", required=True)
    pend = dom_sub.add_parser("pendencias")
    pend.add_argument("--saida", help="grava a lista em JSON")
    pend.add_argument("--limite", type=int, default=500)
    apl = dom_sub.add_parser("aplicar")
    apl.add_argument("arquivo", help="JSON com [{conta_id, dominio?, cnpj?, fonte, confianca?}]")
    mes = sub.add_parser("mesclar", help="junta duas contas que são a mesma empresa")
    mes.add_argument("manter")
    mes.add_argument("remover")
    gru = sub.add_parser("grupo", help="marca contas como o mesmo grupo econômico")
    gru.add_argument("nome")
    gru.add_argument("contas", nargs="+")
    exp = sub.add_parser("exportar", help="gera a planilha (visão) em CSV ou XLSX")
    exp.add_argument("arquivo")
    a = p.parse_args(argv)

    conn = db.conectar()
    if a.comando == "migrar":
        feitas = db.migrar(conn)
        rid = rubrica.garantir_inicial(conn)
        print(f"Migrações aplicadas: {', '.join(feitas) or 'nenhuma nova'}. Rubrica ativa: #{rid}.")
    elif a.comando == "importar":
        rel = importar.importar(conn, importar.ler_planilha(a.arquivo), origem=a.origem)
        print(f"{rel.linhas} linhas: {rel.novas} contas novas, {rel.atualizadas} casadas com contas existentes, "
              f"{rel.estabelecimentos} CNPJs, {rel.pessoas} pessoas.")
        for aviso in rel.avisos:
            print("  " + aviso)
        _imprimir_buracos(conn)
    elif a.comando == "buracos":
        _imprimir_buracos(conn, a.detalhe)
    elif a.comando == "dominios" and a.acao == "pendencias":
        lista = dominios.pendencias(conn, a.limite)
        texto = json.dumps(lista, ensure_ascii=False, indent=2, default=str)
        if a.saida:
            with open(a.saida, "w", encoding="utf-8") as f:
                f.write(texto)
            print(f"{len(lista)} contas com CNPJ ou domínio faltando gravadas em {a.saida}.")
        else:
            print(texto)
    elif a.comando == "dominios" and a.acao == "aplicar":
        with open(a.arquivo, encoding="utf-8") as f:
            res = dominios.aplicar(conn, json.load(f))
        print(f"{res.dominios} domínios e {res.cnpjs} CNPJs gravados, {res.mescladas} duplicatas mescladas.")
        for linha in res.conflitos + res.ignoradas:
            print("  " + linha)
        _imprimir_buracos(conn)
    elif a.comando == "mesclar":
        with conn.transaction():
            dominios.mesclar(conn, a.manter, a.remover)
            importar.atualizar_buracos(conn)
        print("Contas mescladas.")
    elif a.comando == "grupo":
        print(f"Grupo {a.nome}: {dominios.unir_grupo(conn, a.nome, a.contas)}")
    elif a.comando == "exportar":
        print(f"{visao.exportar(conn, a.arquivo)} contas exportadas para {a.arquivo}.")
    return 0


def _imprimir_buracos(conn, detalhe: bool = False) -> None:
    resumo = dominios.resumo_buracos(conn)
    abertos = sum(r["abertos"] for r in resumo)
    print(f"Buracos abertos: {abertos}")
    for r in resumo:
        if r["abertos"]:
            print(f"  {r['tipo']}: {r['abertos']}")
    if detalhe:
        for b in conn.execute(
            """select b.tipo, coalesce(c.nome, '(sem conta)') as conta, b.detalhe, b.linha_origem
               from buraco b left join conta c on c.id = b.conta_id where b.aberto order by b.tipo, conta"""
        ):
            linha = f" (linha {b['linha_origem']})" if b["linha_origem"] else ""
            print(f"    [{b['tipo']}] {b['conta']}{linha}: {b['detalhe'] or ''}")


if __name__ == "__main__":
    sys.exit(main())
