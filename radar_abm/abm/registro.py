"""Log em arquivo (logs/radar.log) e na tabela execucoes: início, fim, itens obtidos e erros de cada rodada."""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field

from . import config
from .db import agora, novo_id


def logger() -> logging.Logger:
    log = logging.getLogger("radar")
    destino = (config.pasta_logs() / "radar.log").resolve()
    atuais = [h for h in log.handlers if isinstance(h, logging.FileHandler)]
    if atuais and atuais[0].baseFilename == str(destino):
        return log
    for h in atuais:  # a pasta de logs mudou (outro .env, outro teste): troca o arquivo
        log.removeHandler(h)
        h.close()
    destino.parent.mkdir(parents=True, exist_ok=True)
    arquivo = logging.FileHandler(destino, encoding="utf-8")
    arquivo.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(arquivo)
    log.setLevel(logging.INFO)
    return log


@dataclass
class Execucao:
    conector: str
    dry_run: bool = False
    id: str = field(default_factory=novo_id)
    inicio: str = field(default_factory=agora)
    fim: str | None = None
    itens: int = 0
    erros: list[str] = field(default_factory=list)

    def comecar(self) -> None:
        logger().info("[%s] início%s", self.conector, " (dry-run)" if self.dry_run else "")

    def terminar(self, conn: sqlite3.Connection | None) -> None:
        """No dry-run nada é gravado no banco; o log em arquivo registra a simulação."""
        self.fim = agora()
        logger().info("[%s] fim: %d itens, %d erros", self.conector, self.itens, len(self.erros))
        for erro in self.erros:
            logger().warning("[%s] erro: %s", self.conector, erro)
        if conn is None or self.dry_run:
            return
        conn.execute(
            "insert into execucoes (id, conector, inicio, fim, itens, erros, detalhe) values (?, ?, ?, ?, ?, ?, ?)",
            (self.id, self.conector, self.inicio, self.fim, self.itens, len(self.erros), "\n".join(self.erros) or None),
        )
        conn.commit()
