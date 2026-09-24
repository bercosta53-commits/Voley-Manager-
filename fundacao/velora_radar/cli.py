"""Linha de comando: python -m velora_radar <comando>."""

from __future__ import annotations

import argparse
import json
import sys

from . import db, dominios, importar, rubrica, visao
from .sinais import classificador, pipeline


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
    sin = sub.add_parser("sinais", help="radar de sinais: coletar, classificar e revisar")
    sin_sub = sin.add_subparsers(dest="acao", required=True)
    col = sin_sub.add_parser("coletar", help="busca notícias, CNPJ e CVM das contas")
    col.add_argument("--fontes", default=",".join(pipeline.FONTES))
    col.add_argument("--limite", type=int, help="quantas contas (A primeiro)")
    imp_s = sin_sub.add_parser("importar", help="itens trazidos pelo agente de captação (vagas etc.)")
    imp_s.add_argument("arquivo", help="JSON [{conta_id, titulo, url, fonte, texto?, publicado_em?}]")
    imp_s.add_argument("--coletor", default="vagas")
    cla = sin_sub.add_parser("classificar", help="transforma itens em sinais (Claude ou regras)")
    cla.add_argument("--regras", action="store_true", help="usa as regras mesmo com credencial da API")
    cla.add_argument("--limite", type=int, default=300)
    sin_sub.add_parser("pendentes", help="sinais esperando revisão")
    apr = sin_sub.add_parser("aprovar")
    apr.add_argument("ids", nargs="+")
    des = sin_sub.add_parser("descartar")
    des.add_argument("ids", nargs="+")
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
    elif a.comando == "sinais":
        _sinais(conn, a)
    elif a.comando == "exportar":
        print(f"{visao.exportar(conn, a.arquivo)} contas exportadas para {a.arquivo}.")
    return 0


def _sinais(conn, a) -> None:
    if a.acao == "coletar":
        fontes = [f.strip() for f in a.fontes.split(",") if f.strip()]
        res = pipeline.coletar(conn, fontes=fontes, limite=a.limite)
        print("Itens novos: " + ", ".join(f"{f} {n}" for f, n in res.novos.items()))
        for erro in res.erros:
            print("  erro: " + erro)
    elif a.acao == "importar":
        with open(a.arquivo, encoding="utf-8") as f:
            print(f"{pipeline.importar(conn, json.load(f), a.coletor)} itens novos.")
    elif a.acao == "classificar":
        cls = classificador.padrao(forcar_regras=a.regras)
        print(f"Classificador: {cls.nome}")
        res = pipeline.classificar(conn, cls, limite=a.limite)
        print(f"{res.sinais} sinais para revisão, {res.ruido} itens descartados como ruído, {res.duplicados} já registrados.")
        if res.falha:
            print(f"  parou antes do fim: {res.falha}")
    elif a.acao == "pendentes":
        for s in pipeline.pendentes(conn):
            print(f"{s['id']}  {s['conta']} · {s['tipo']} · {s['data_evento']} · peso {s['peso']} · {s['confianca']} · {s['classificador']}")
            print(f"    {s['detalhe']}")
            print(f"    “{s['evidencia_trecho']}” {s['evidencia_url'] or ''}")
    elif a.acao in ("aprovar", "descartar"):
        print(f"{pipeline.revisar(conn, a.ids, a.acao == 'aprovar')} sinais atualizados.")


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
