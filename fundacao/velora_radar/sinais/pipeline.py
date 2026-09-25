"""Pipeline do radar: coletar -> classificar -> revisar.

Os itens brutos ficam em ``coleta_item`` (auditoria do que a fonte publicou). Os relevantes viram
``sinal`` com status pendente, peso, meia-vida, papel afetado e evidência (link e trecho); uma pessoa
aprova ou descarta antes de o sinal contar na fila.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date

import psycopg

from . import coletores
from .catalogo import TIPOS
from .classificador import ClassificacaoFalhou

FONTES = ("noticias", "cnpj", "cvm")


def _contas(conn, limite: int | None) -> list[coletores.Conta]:
    linhas = conn.execute(
        """select c.id::text as id, c.nome, c.cnpj_raiz, c.dominio,
                  coalesce(array_agg(e.cnpj order by e.matriz desc, e.cnpj) filter (where e.cnpj is not null), '{}') as cnpjs
           from conta c left join estabelecimento e on e.conta_id = c.id
           group by c.id order by coalesce(c.abc, 'Z'), c.nome limit %s""",
        (limite,),
    ).fetchall()
    return [coletores.Conta(id=l["id"], nome=l["nome"], cnpj_raiz=l["cnpj_raiz"], cnpjs=list(l["cnpjs"]), dominio=l["dominio"]) for l in linhas]


def registrar_itens(conn: psycopg.Connection, conta_id: str, itens: list[coletores.ItemBruto]) -> int:
    novos = 0
    for it in itens:
        r = conn.execute(
            """insert into coleta_item (conta_id, coletor, chave, fonte, url, titulo, texto, publicado_em, tipo_sugerido, bruto)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               on conflict (coletor, chave) do nothing returning id""",
            (conta_id, it.coletor, it.chave, it.fonte, it.url, it.titulo, it.texto, it.publicado_em, it.tipo_sugerido,
             json.dumps(it.bruto, ensure_ascii=False, default=str)),
        ).fetchone()
        novos += bool(r)
    return novos


@dataclass
class ResultadoColeta:
    novos: dict[str, int] = field(default_factory=dict)
    erros: list[str] = field(default_factory=list)


def coletar(conn: psycopg.Connection, fontes=FONTES, buscar=coletores.buscar_http, hoje: date | None = None, limite: int | None = None) -> ResultadoColeta:
    hoje = hoje or date.today()
    res = ResultadoColeta(novos={f: 0 for f in fontes})
    contas = _contas(conn, limite)
    with conn.transaction():
        for conta in contas:
            if "noticias" in fontes:
                try:
                    res.novos["noticias"] += registrar_itens(conn, conta.id, coletores.coletar_noticias(conta, buscar, hoje))
                except Exception as erro:  # uma fonte fora do ar não derruba a coleta das outras
                    res.erros.append(f"notícias de {conta.nome}: {erro}")
            if "cnpj" in fontes and conta.cnpjs:
                cnpj = conta.cnpjs[0]
                try:
                    atual = coletores.ler_cnpj(coletores.json_de(buscar(coletores.url_cnpj(cnpj))))
                    foto = conn.execute(
                        "select conteudo from fonte_snapshot where conta_id = %s and coletor = 'cnpj'", (conta.id,)
                    ).fetchone()
                    itens = coletores.diff_cnpj(conta, cnpj, atual, foto["conteudo"] if foto else None, hoje)
                    res.novos["cnpj"] += registrar_itens(conn, conta.id, itens)
                    conn.execute(
                        """insert into fonte_snapshot (conta_id, coletor, conteudo) values (%s, 'cnpj', %s::jsonb)
                           on conflict (conta_id, coletor) do update set conteudo = excluded.conteudo, capturado_em = now()""",
                        (conta.id, json.dumps(atual, ensure_ascii=False)),
                    )
                except Exception as erro:
                    res.erros.append(f"CNPJ de {conta.nome}: {erro}")
        if "cvm" in fontes:
            try:
                for conta_id, itens in coletores.coletar_cvm(contas, buscar, hoje).items():
                    res.novos["cvm"] += registrar_itens(conn, conta_id, itens)
            except Exception as erro:
                res.erros.append(f"CVM: {erro}")
    return res


def importar(conn: psycopg.Connection, dados: list[dict], coletor: str = "vagas") -> int:
    novos = 0
    with conn.transaction():
        for conta_id, item in coletores.itens_importados(dados, coletor):
            if conn.execute("select 1 from conta where id::text = %s", (conta_id,)).fetchone():
                novos += registrar_itens(conn, conta_id, [item])
    return novos


@dataclass
class ResultadoClassificacao:
    sinais: int = 0
    ruido: int = 0
    duplicados: int = 0
    falha: str | None = None


def classificar(conn: psycopg.Connection, classificador, limite: int = 300, status_sinal: str = "pendente") -> ResultadoClassificacao:
    res = ResultadoClassificacao()
    itens = conn.execute(
        """select i.*, i.id::text as id, c.nome, c.setor, c.cidade, c.uf, c.dominio, c.braco
           from coleta_item i join conta c on c.id = i.conta_id
           where i.status = 'novo' order by i.coletado_em limit %s""",
        (limite,),
    ).fetchall()
    por_conta: dict[str, list[dict]] = {}
    for i in itens:
        por_conta.setdefault(str(i["conta_id"]), []).append(i)
    for conta_id, lista in por_conta.items():
        conta = {k: lista[0][k] for k in ("nome", "setor", "cidade", "uf", "dominio", "braco")}
        try:
            vereditos = classificador.classificar(conta, lista)
        except ClassificacaoFalhou as erro:
            res.falha = str(erro)
            break  # itens ficam como "novo" para a próxima rodada
        por_id = {i["id"]: i for i in lista}
        with conn.transaction():
            for v in vereditos:
                item = por_id[v.item_id]
                if not v.relevante:
                    conn.execute(
                        "update coleta_item set status = 'ruido', motivo = %s, classificado_em = now() where id = %s",
                        (v.motivo or "ruído", v.item_id),
                    )
                    res.ruido += 1
                    continue
                t = TIPOS[v.tipo]
                criado = conn.execute(
                    """insert into sinal (conta_id, tipo, fonte, data_evento, detalhe, evidencia_url, evidencia_trecho, peso,
                         status, coletor, coleta_item_id, papel_afetado, cargo_afetado, meia_vida_dias, confianca, classificador)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       on conflict (conta_id, tipo, data_evento) do nothing returning id""",
                    (conta_id, v.tipo, item["fonte"], item["publicado_em"] or item["coletado_em"].date(), v.detalhe, item["url"],
                     v.trecho, t.peso(v.confianca), status_sinal, item["coletor"], v.item_id, v.papel, v.cargo,
                     t.meia_vida_dias, v.confianca, v.classificador),
                ).fetchone()
                conn.execute(
                    "update coleta_item set status = 'sinal', motivo = %s, classificado_em = now() where id = %s",
                    (f"{v.tipo}: {v.motivo}" if criado else f"{v.tipo}: já registrado", v.item_id),
                )
                if criado:
                    res.sinais += 1
                else:
                    res.duplicados += 1
    return res


def pendentes(conn: psycopg.Connection) -> list[dict]:
    return conn.execute(
        """select s.id::text as id, c.nome as conta, s.tipo, s.data_evento, s.detalhe, s.fonte, s.evidencia_url,
                  s.evidencia_trecho, s.confianca, s.papel_afetado, s.cargo_afetado, s.peso, s.classificador
           from sinal s join conta c on c.id = s.conta_id where s.status = 'pendente'
           order by s.peso desc, s.data_evento desc"""
    ).fetchall()


def revisar(conn: psycopg.Connection, ids: list[str], aprovar: bool) -> int:
    with conn.transaction():
        r = conn.execute(
            "update sinal set status = %s where status = 'pendente' and id::text = any(%s)",
            ("aprovado" if aprovar else "descartado", ids),
        )
    return r.rowcount
