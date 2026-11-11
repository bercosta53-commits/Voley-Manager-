"""Identidade do anunciante: descobre os IDs candidatos de cada conta no Google e no Meta, para confirmação humana.

Nunca associa automaticamente. O fluxo é:
1. `anuncios descobrir`: procura candidatos e grava em anunciantes_candidatos (status pendente) e num CSV em saidas/.
2. Você marca `sim` ou `nao` na coluna confirmar do CSV.
3. `anuncios confirmar <csv>`: só os confirmados entram em contas.google_advertiser_ids / contas.meta_page_ids.

Como os candidatos são pontuados:
- Google: o nome verificado do anunciante costuma ser a razão social. Nome igual à razão social vale mais; igual ao nome
  fantasia, menos. A biblioteca do Google não mostra o CNPJ, então o CNPJ não entra no casamento (confira pela
  razão social e pela sede, na página do anunciante).
- Meta: nome da página parecido com o da conta, mais o domínio dos links dos anúncios da página. Nas contas de domínio
  compartilhado (Sicredi, Sicoob, Cresol, Unicred: cada central tem página própria), o domínio NÃO conta ponto, e o
  candidato vem marcado para você conferir se a página é a da central.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from .db import agora
from .identidade import normalizar_dominio, sem_acentos

COMPARTILHADOS = {"sicredi.com.br", "sicoob.com.br", "cresol.com.br", "unicred.com.br", "ailos.coop.br"}
MAX_CANDIDATOS = 3
PONTOS_MINIMOS = 2
GENERICAS = {"cooperativa", "central", "banco", "seguros", "seguradora", "consorcios", "consorcio", "administradora",
             "credito", "sistema", "grupo", "brasil", "the", "dos", "das", "de", "e"}


def _norm(t: str) -> str:
    t = re.sub(r"\b(s\.?\s?a\.?|ltda|eireli|me|epp|cia|companhia)\b", " ", sem_acentos(t or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def _parecido(a: str, b: str) -> int:
    """3 igual, 2 um contém o outro, 1 metade das palavras em comum, 0 nada."""
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0
    if a == b:
        return 3
    if f" {a} " in f" {b} " or f" {b} " in f" {a} ":
        return 2
    # Palavra genérica ("cooperativa", "banco", "seguros"...) sozinha não aproxima dois nomes.
    pa = {p for p in a.split() if len(p) > 2 and p not in GENERICAS}
    pb = {p for p in b.split() if len(p) > 2 and p not in GENERICAS}
    comuns = pa & pb
    return 1 if len(comuns) >= 2 or (comuns and comuns == min(pa, pb, key=len)) else 0


def dominio_compartilhado(conn, conta) -> bool:
    dom = normalizar_dominio(conta["dominio"]) if conta["dominio"] else None
    if dom in COMPARTILHADOS:
        return True
    if not dom:
        return False
    return conn.execute("select count(*) from contas where dominio = ?", (dom,)).fetchone()[0] > 1


def _lista_dicts(no) -> list[dict]:
    """Todos os dicionários de qualquer lista da resposta (o formato da busca de anunciantes varia)."""
    achados = []
    if isinstance(no, dict):
        for v in no.values():
            achados += _lista_dicts(v)
    elif isinstance(no, list):
        for x in no:
            if isinstance(x, dict):
                achados.append(x)
                achados += _lista_dicts(x)
    return achados


def candidatos_google(conta, resposta: dict) -> list[dict]:
    saida = {}
    for a in _lista_dicts(resposta):
        aid = str(a.get("id") or a.get("advertiser_id") or "")
        if not aid.startswith("AR"):
            continue
        nome = a.get("name") or a.get("advertiser_name") or ""
        pr = _parecido(nome, conta["razao_social"] or "")
        pf = _parecido(nome, conta["nome_fantasia"] or "")
        pontos = {3: 4, 2: 3, 1: 1, 0: 0}[pr] + {3: 2, 2: 1, 1: 0, 0: 0}[pf]
        regiao = a.get("region") or a.get("location") or ""
        if str(regiao).upper() in ("BR", "BRAZIL", "BRASIL"):
            pontos += 1
        evid = [f"nome verificado '{nome}'"]
        if pr:
            evid.append("igual à razão social" if pr == 3 else "parecido com a razão social")
        elif pf:
            evid.append("parecido com o nome fantasia")
        if regiao:
            evid.append(f"sede: {regiao}")
        n_ads = a.get("ads_count") or a.get("total_ads") or a.get("number_of_ads")
        if n_ads:
            evid.append(f"{n_ads} anúncio(s)")
        if max(pr, pf) >= 2 and pontos >= PONTOS_MINIMOS:  # nome precisa bater de verdade, não só uma palavra
            saida[aid] = {"id": aid, "nome": nome, "pontos": pontos, "evidencia": "; ".join(evid)}
    return sorted(saida.values(), key=lambda c: -c["pontos"])[:MAX_CANDIDATOS]


def candidatos_meta(conta, resposta: dict) -> list[dict]:
    saida = []
    for p in resposta.get("page_results") or []:
        pid = str(p.get("page_id") or p.get("id") or "")
        nome = p.get("name") or p.get("page_name") or ""
        pontos = _parecido(nome, conta["nome_fantasia"] or "")
        if pid and pontos:
            extra = [x for x in (p.get("category"), p.get("ig_username") and f"@{p['ig_username']}",
                                 p.get("verification") == "BLUE_VERIFIED" and "verificada") if x]
            saida.append({"id": pid, "nome": nome, "pontos": pontos,
                          "evidencia": f"página '{nome}'" + (f" ({', '.join(extra)})" if extra else "")})
    return sorted(saida, key=lambda c: -c["pontos"])[:MAX_CANDIDATOS]


def conferir_dominio_meta(candidato: dict, resposta_anuncios: dict, dominio: str | None, compartilhado: bool) -> None:
    """Soma pontos se os links dos anúncios da página levam ao domínio da conta (menos nos domínios compartilhados)."""
    hosts = set()
    for a in resposta_anuncios.get("ads") or []:
        s = a.get("snapshot") or {}
        for link in [s.get("link_url")] + [c.get("link_url") for c in s.get("cards") or []]:
            if link:
                hosts.add((urlparse(link).hostname or "").lower().removeprefix("www."))
    dom = normalizar_dominio(dominio) if dominio else None
    casa = bool(dom) and any(h == dom or h.endswith("." + dom) for h in hosts)
    ativos = sum(1 for a in resposta_anuncios.get("ads") or [] if a.get("is_active"))
    candidato["evidencia"] += f"; {ativos} anúncio(s) ativo(s)"
    if casa and not compartilhado:
        candidato["pontos"] += 3
        candidato["evidencia"] += f"; anúncios levam a {dom}"
    elif casa:
        candidato["evidencia"] += f"; anúncios levam a {dom}, que é COMPARTILHADO: confira se a página é desta central"
    elif hosts:
        candidato["evidencia"] += f"; anúncios levam a {', '.join(sorted(hosts)[:2])}"


@dataclass
class Resultado:
    contas: int = 0
    candidatos: int = 0
    sem_candidato: list[str] = field(default_factory=list)
    chamadas: int = 0


def descobrir(conn, provedor, contas: list, saida=print) -> Resultado:
    res = Resultado()
    for conta in contas:
        res.contas += 1
        compartilhado = dominio_compartilhado(conn, conta)
        achados: list[tuple[str, dict]] = []
        termo_google = conta["razao_social"] or conta["nome_fantasia"]
        try:
            for c in candidatos_google(conta, provedor.google_anunciantes(termo_google)):
                achados.append(("google", c))
        except Exception as e:
            saida(f"   {conta['id']} Google: {e}")
        try:
            paginas = candidatos_meta(conta, provedor.meta_paginas(conta["nome_fantasia"]))
            # só confere (busca paga) as páginas com nome parecido de verdade; nome fraco não vale a busca
            for c in [c for c in paginas if c["pontos"] >= 2 or compartilhado][:2]:
                try:
                    conferir_dominio_meta(c, provedor.meta_anuncios(c["id"]), conta["dominio"], compartilhado)
                except Exception as e:  # sem os anúncios da página, o candidato segue só com o nome
                    c["evidencia"] += f"; anúncios não conferidos ({e})"
            for c in paginas:
                if c["pontos"] >= PONTOS_MINIMOS or compartilhado:
                    achados.append(("meta", c))
        except Exception as e:
            saida(f"   {conta['id']} Meta: {e}")
        if not achados:
            res.sem_candidato.append(conta["nome_fantasia"])
        saida(f"-- {conta['id']} {conta['nome_fantasia']}" + ("  [domínio compartilhado]" if compartilhado else ""))
        for plataforma, c in achados:
            saida(f"   {plataforma:<6} {c['id']:<24} {c['pontos']:>2} pts  {c['evidencia'][:110]}")
            conn.execute(
                """insert into anunciantes_candidatos (conta_id, plataforma, id_externo, nome, evidencia, pontos, descoberto_em)
                   values (?, ?, ?, ?, ?, ?, ?)
                   on conflict (conta_id, plataforma, id_externo) do update set nome = excluded.nome,
                       evidencia = excluded.evidencia, pontos = excluded.pontos""",
                (conta["id"], plataforma, c["id"], c["nome"], c["evidencia"], c["pontos"], agora()))
            res.candidatos += 1
        conn.commit()
    res.chamadas = provedor.chamadas
    return res


def exportar(conn, arquivo: str | Path) -> int:
    linhas = conn.execute(
        """select a.conta_id, c.nome_fantasia, a.plataforma, a.id_externo, a.nome, a.pontos, a.evidencia
           from anunciantes_candidatos a join contas c on c.id = a.conta_id where a.status = 'pendente'
           order by c.tier, c.nome_fantasia, a.plataforma, a.pontos desc""").fetchall()
    Path(arquivo).parent.mkdir(parents=True, exist_ok=True)
    with open(arquivo, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["conta_id", "empresa", "plataforma", "id", "nome_no_anunciante", "pontos", "evidencia", "confirmar"])
        for r in linhas:
            w.writerow([*r, ""])
    return len(linhas)


def _gravar_ids(conn, conta_id: str, plataforma: str) -> None:
    campo = "google_advertiser_ids" if plataforma == "google" else "meta_page_ids"
    ids = [r["id_externo"] for r in conn.execute(
        "select id_externo from anunciantes_candidatos where conta_id = ? and plataforma = ? and status = 'confirmado' order by id_externo",
        (conta_id, plataforma))]
    conn.execute(f"update contas set {campo} = ?, atualizada_em = ? where id = ?", (json.dumps(ids) if ids else None, agora(), conta_id))


def confirmar(conn, conta_id: str, plataforma: str, id_externo: str, sim: bool = True, nome: str = "") -> None:
    """Confirma (ou rejeita) um anunciante. Também serve para um ID achado à mão, que não veio da descoberta."""
    if plataforma not in ("google", "meta"):
        raise ValueError("plataforma deve ser google ou meta")
    if not conn.execute("select 1 from contas where id = ?", (conta_id,)).fetchone():
        raise ValueError(f"conta {conta_id} não existe")
    conn.execute(
        """insert into anunciantes_candidatos (conta_id, plataforma, id_externo, nome, evidencia, pontos, status, descoberto_em, decidido_em)
           values (?, ?, ?, ?, 'informado à mão', 0, ?, ?, ?)
           on conflict (conta_id, plataforma, id_externo) do update set status = excluded.status, decidido_em = excluded.decidido_em""",
        (conta_id, plataforma, id_externo, nome, "confirmado" if sim else "rejeitado", agora(), agora()))
    _gravar_ids(conn, conta_id, plataforma)
    conn.commit()


def confirmar_arquivo(conn, arquivo: str | Path) -> dict:
    feitos = {"confirmados": 0, "rejeitados": 0, "em_branco": 0}
    with open(arquivo, encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            resposta = sem_acentos((linha.get("confirmar") or "").strip().lower())
            if resposta in ("sim", "s", "x", "1"):
                confirmar(conn, linha["conta_id"], linha["plataforma"], linha["id"], True)
                feitos["confirmados"] += 1
            elif resposta in ("nao", "n", "0"):
                confirmar(conn, linha["conta_id"], linha["plataforma"], linha["id"], False)
                feitos["rejeitados"] += 1
            else:
                feitos["em_branco"] += 1
    return feitos
