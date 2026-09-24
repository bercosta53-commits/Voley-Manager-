"""Modo DOMÍNIOS: fecha os buracos de identidade até zerar.

1. ``pendencias`` gera a lista de trabalho: contas sem CNPJ ou sem domínio, contas A primeiro.
2. Quem resolve (um agente com Apollo, busca na web ou uma pessoa) devolve um JSON de resoluções.
3. ``aplicar`` valida e grava cada resolução. CNPJ que já pertence a outra conta indica duplicata:
   as duas são mescladas. Domínio que já pertence a outra conta vira conflito para revisão.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import psycopg

from .identidade import cnpj_normalizado, cnpj_raiz, dominio_generico, e_matriz, normalizar_dominio
from .importar import atualizar_buracos, registrar_buraco


def pendencias(conn: psycopg.Connection, limite: int = 500) -> list[dict]:
    return conn.execute(
        """select c.id::text as conta_id, c.nome, c.cidade, c.uf, c.setor, c.abc,
                  c.cnpj_raiz, c.dominio,
                  array_remove(array[
                    case when c.cnpj_raiz is null then 'cnpj' end,
                    case when c.dominio is null then 'dominio' end], null) as falta
           from conta c
           where c.cnpj_raiz is null or c.dominio is null
           order by coalesce(c.abc, 'Z'), c.nome
           limit %s""",
        (limite,),
    ).fetchall()


@dataclass
class Aplicacao:
    dominios: int = 0
    cnpjs: int = 0
    mescladas: int = 0
    conflitos: list[str] = field(default_factory=list)
    ignoradas: list[str] = field(default_factory=list)


def aplicar(conn: psycopg.Connection, resolucoes: list[dict]) -> Aplicacao:
    """Cada resolução: {conta_id, dominio?, cnpj?, fonte, confianca?}. Confiança baixa não é gravada."""
    res = Aplicacao()
    with conn.transaction():
        for r in resolucoes:
            conta = conn.execute("select * from conta where id = %s", (r.get("conta_id"),)).fetchone()
            if not conta:
                res.ignoradas.append(f"{r.get('conta_id')}: conta não encontrada")
                continue
            if str(r.get("confianca", "alta")).lower() == "baixa":
                res.ignoradas.append(f"{conta['nome']}: confiança baixa, fica para revisão")
                continue
            fonte = r.get("fonte") or "resolução"

            cnpj = cnpj_normalizado(r.get("cnpj"))
            if r.get("cnpj") and not cnpj:
                res.ignoradas.append(f"{conta['nome']}: CNPJ inválido ({r.get('cnpj')})")
            if cnpj and not conta["cnpj_raiz"]:
                dono = conn.execute("select id from conta where cnpj_raiz = %s", (cnpj_raiz(cnpj),)).fetchone()
                if dono and dono["id"] != conta["id"]:
                    mesclar(conn, manter=dono["id"], remover=conta["id"])
                    res.mescladas += 1
                    conta = conn.execute("select * from conta where id = %s", (dono["id"],)).fetchone()
                else:
                    conn.execute("update conta set cnpj_raiz = %s, atualizado_em = now() where id = %s", (cnpj_raiz(cnpj), conta["id"]))
                    res.cnpjs += 1
                conn.execute(
                    "insert into estabelecimento (cnpj, conta_id, matriz) values (%s, %s, %s) on conflict (cnpj) do nothing",
                    (cnpj, conta["id"], e_matriz(cnpj)),
                )
                _anotar(conn, conta["id"], ("sem_cnpj", "cnpj_invalido"), f"CNPJ por {fonte}")

            dominio = normalizar_dominio(r.get("dominio"))
            if r.get("dominio") and (not dominio or dominio_generico(dominio)):
                res.ignoradas.append(f"{conta['nome']}: domínio inválido ou genérico ({r.get('dominio')})")
            elif dominio and not conta["dominio"]:
                dono = conn.execute("select id, nome from conta where dominio = %s", (dominio,)).fetchone()
                if dono and dono["id"] != conta["id"]:
                    registrar_buraco(conn, conta["id"], "conflito_cnpj_dominio", f"{dominio} já é de {dono['nome']}")
                    res.conflitos.append(f"{conta['nome']}: {dominio} já é de {dono['nome']}")
                else:
                    conn.execute("update conta set dominio = %s, atualizado_em = now() where id = %s", (dominio, conta["id"]))
                    _anotar(conn, conta["id"], ("sem_dominio", "dominio_generico"), f"domínio por {fonte}")
                    res.dominios += 1
        atualizar_buracos(conn)
    return res


def _anotar(conn, conta_id, tipos, resolucao) -> None:
    conn.execute(
        "update buraco set resolucao = %s where conta_id = %s and aberto and tipo = any(%s)",
        (resolucao, conta_id, list(tipos)),
    )


def mesclar(conn: psycopg.Connection, manter, remover) -> None:
    """Junta duas contas que são a mesma empresa. A mantida herda tudo e preenche o que lhe falta."""
    if str(manter) == str(remover):
        return
    a = conn.execute("select * from conta where id = %s", (manter,)).fetchone()
    b = conn.execute("select * from conta where id = %s", (remover,)).fetchone()
    if not a or not b:
        raise ValueError("conta não encontrada para mesclar")
    if a["cnpj_raiz"] and b["cnpj_raiz"] and a["cnpj_raiz"] != b["cnpj_raiz"]:
        raise ValueError("CNPJs de raízes diferentes: são empresas distintas; use grupo econômico")
    campos = ["cnpj_raiz", "dominio", "grupo_economico_id", "uf", "cidade", "setor", "braco", "abc", "headcount",
              "capital_social", "observacoes"]
    herdar = {c: b[c] for c in campos if a[c] is None and b[c] is not None}
    # Chaves únicas saem da removida antes de passar para a mantida.
    conn.execute("update conta set cnpj_raiz = null, dominio = null where id = %s", (remover,))
    for tabela in ("estabelecimento", "sinal", "evento_abordagem", "desfecho"):
        if tabela == "sinal":
            conn.execute(
                """delete from sinal s using sinal m where s.conta_id = %s and m.conta_id = %s
                   and s.tipo = m.tipo and s.data_evento = m.data_evento""",
                (remover, manter),
            )
        conn.execute(f"update {tabela} set conta_id = %s where conta_id = %s", (manter, remover))
    conn.execute("delete from pessoa p using pessoa m where p.conta_id = %s and m.conta_id = %s and p.nome = m.nome", (remover, manter))
    conn.execute("update pessoa set conta_id = %s where conta_id = %s", (manter, remover))
    conn.execute("delete from buraco where conta_id = %s", (remover,))
    conn.execute("delete from conta where id = %s", (remover,))
    if herdar:
        colunas = ", ".join(f"{k} = %({k})s" for k in herdar)
        conn.execute(f"update conta set {colunas}, atualizado_em = now() where id = %(id)s", {**herdar, "id": manter})


def unir_grupo(conn: psycopg.Connection, nome: str, conta_ids: list[str]) -> str:
    """Marca contas de CNPJs diferentes como o mesmo grupo econômico."""
    with conn.transaction():
        g = conn.execute("select id from grupo_economico where nome = %s", (nome,)).fetchone() or conn.execute(
            "insert into grupo_economico (nome) values (%s) returning id", (nome,)
        ).fetchone()
        conn.execute("update conta set grupo_economico_id = %s where id = any(%s::uuid[])", (g["id"], conta_ids))
        atualizar_buracos(conn)
    return str(g["id"])


def resumo_buracos(conn: psycopg.Connection) -> list[dict]:
    return conn.execute(
        """select tipo, count(*) filter (where aberto) as abertos, count(*) filter (where not aberto) as fechados
           from buraco group by tipo order by abertos desc, tipo"""
    ).fetchall()
