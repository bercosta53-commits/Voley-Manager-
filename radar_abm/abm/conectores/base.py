"""Contrato único de conector. Todo conector herda de Conector e faz quatro passos, para cada conta:

1. BUSCA    buscar(conta): vai até a fonte e traz a resposta como ela vem (a "resposta bruta").
2. TRADUZ   traduzir(resposta_bruta): converte a resposta para o nosso formato (um dicionário simples).
3. COMPARA  comparar(novo, snapshot_anterior): olha a foto da coleta anterior e diz o que mudou.
4. ENTREGA  entregar(itens): grava as novidades no banco.

Depois da entrega, a base guarda a foto nova (snapshot) para a próxima comparação.

O método executar() cuida do resto, igual para todos: percorre as contas, mostra cada passo na tela,
conta itens e erros, registra a execução (tabela execucoes e logs/radar.log) e, no modo dry-run,
faz a busca mas não grava nada: nem itens, nem foto, nem registro de execução no banco.

Durante os passos, a conta em andamento fica em self.conta.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

from ..db import agora, novo_id
from ..registro import Execucao
from .http import ClienteHTTP


@dataclass
class Item:
    """Uma novidade encontrada por um conector, com a evidência de onde veio."""

    conta_id: str
    tipo: str
    titulo: str
    url: str | None = None
    trecho: str = ""
    data_fato: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def resumo(self) -> str:
        data = f" [{self.data_fato}]" if self.data_fato else ""
        return f"{self.tipo}: {self.titulo}{data}"


class Conector(ABC):
    nome: str = "base"
    descricao: str = ""

    def __init__(self, conn: sqlite3.Connection, http: ClienteHTTP | None = None, dry_run: bool = False,
                 saida: Callable[[str], None] = print):
        self.conn = conn
        self.http = http or ClienteHTTP()
        self.dry_run = dry_run
        self.saida = saida
        self.conta: sqlite3.Row | dict | None = None

    # --- os quatro passos: cada conector implementa ---------------------------------------------

    @abstractmethod
    def buscar(self, conta) -> Any: ...

    @abstractmethod
    def traduzir(self, resposta_bruta: Any) -> dict: ...

    @abstractmethod
    def comparar(self, novo: dict, snapshot_anterior: dict | None) -> list[Item]: ...

    @abstractmethod
    def entregar(self, itens: list[Item]) -> int: ...

    # --- ganchos opcionais ----------------------------------------------------------------------

    def pode_rodar(self, conta) -> str:
        """Devolve o motivo para pular a conta (ex.: 'sem CNPJ'), ou '' se dá para rodar."""
        return ""

    def descrever_busca(self, conta) -> str:
        return "consultando a fonte"

    # --- orquestração comum ---------------------------------------------------------------------

    def passo(self, texto: str) -> None:
        self.saida(texto)

    def executar(self, contas: list) -> Execucao:
        ex = Execucao(self.nome, self.dry_run)
        ex.comecar()
        aviso = "  (DRY-RUN: nada será gravado)" if self.dry_run else ""
        self.passo(f"== {self.nome}: {len(contas)} conta(s){aviso}")
        for conta in contas:
            self.conta = conta
            motivo = self.pode_rodar(conta)
            if motivo:
                self.passo(f"-- {conta['id']} {conta['nome_fantasia']}: pulada ({motivo})")
                continue
            self.passo(f"-- {conta['id']} {conta['nome_fantasia']}")
            try:
                self.passo(f"   1. BUSCA    {self.descrever_busca(conta)}")
                bruto = self.buscar(conta)
                novo = self.traduzir(bruto)
                self.passo(f"   2. TRADUZ   {self._resumo_traducao(novo)}")
                anterior = self.snapshot_anterior(conta["id"])
                itens = self.comparar(novo, anterior)
                base = "primeira coleta, sem foto anterior" if anterior is None else "comparado com a foto anterior"
                self.passo(f"   3. COMPARA  {base}: {len(itens)} novidade(s)")
                for item in itens:
                    self.passo(f"               - {item.resumo()}")
                if self.dry_run:
                    self.passo(f"   4. ENTREGA  (simulado) gravaria {len(itens)} item(ns) e a foto nova")
                else:
                    # Itens e foto nova entram juntos: se algo falhar, nada desta conta fica gravado pela metade.
                    gravados = self.entregar(itens)
                    self.salvar_snapshot(conta["id"], novo, anterior)
                    self.conn.commit()
                    self.passo(f"   4. ENTREGA  {gravados} item(ns) gravado(s)")
                ex.itens += len(itens)
            except Exception as e:  # um erro numa conta não derruba a coleta das outras
                self.conn.rollback()
                ex.erros.append(f"{conta['id']}: {e}")
                self.passo(f"   ERRO: {e}")
        ex.terminar(self.conn)
        self.passo(f"== fim: {ex.itens} novidade(s), {len(ex.erros)} erro(s)")
        return ex

    def _resumo_traducao(self, novo: dict) -> str:
        partes = [f"{k}: {len(v)}" if isinstance(v, (list, dict)) else f"{k}: {v}" for k, v in list(novo.items())[:6]]
        return ", ".join(partes) or "(vazio)"

    # --- utilidades para os conectores ----------------------------------------------------------

    def snapshot_anterior(self, conta_id: str) -> dict | None:
        r = self.conn.execute(
            "select conteudo_json from snapshots where conta_id = ? and conector = ? order by data desc limit 1",
            (conta_id, self.nome),
        ).fetchone()
        return json.loads(r["conteudo_json"]) if r else None

    def salvar_snapshot(self, conta_id: str, novo: dict, anterior: dict | None) -> None:
        if novo == anterior:
            return  # nada mudou: não precisa de foto nova
        self.conn.execute(
            "insert into snapshots (conta_id, conector, data, conteudo_json) values (?, ?, ?, ?)",
            (conta_id, self.nome, datetime.now().isoformat(timespec="microseconds"),
             json.dumps(novo, ensure_ascii=False, sort_keys=True)),
        )

    @staticmethod
    def impressao_digital(*partes: str) -> str:
        return hashlib.sha256("|".join(p or "" for p in partes).encode("utf-8")).hexdigest()[:32]

    def gravar_item_bruto(self, item: Item, hash_: str | None = None) -> bool:
        """Grava o item em itens_brutos. Devolve False se ele já tinha sido visto (mesmo hash)."""
        hash_ = hash_ or self.impressao_digital(self.nome, item.conta_id, item.tipo, item.url or "", item.titulo)
        feito = self.conn.execute(
            """insert into itens_brutos (id, conector, conta_id, url, titulo, trecho, data_publicacao, data_coleta, hash)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict (hash) do nothing""",
            (novo_id(), self.nome, item.conta_id, item.url, item.titulo, item.trecho, item.data_fato, agora(), hash_),
        ).rowcount
        return bool(feito)


def selecionar_contas(conn: sqlite3.Connection, ids: list[str] | None = None, tier: str | None = None,
                      limite: int | None = None) -> list[sqlite3.Row]:
    sql, args = "select * from contas where 1 = 1", []
    if ids:
        sql += f" and id in ({', '.join('?' for _ in ids)})"
        args += ids
    if tier:
        sql += " and tier = ?"
        args.append(tier.upper())
    sql += " order by coalesce(tier, 'Z'), nome_fantasia"
    if limite:
        sql += " limit ?"
        args.append(limite)
    return conn.execute(sql, args).fetchall()
