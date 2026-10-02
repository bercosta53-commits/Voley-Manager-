"""Configuração lida do arquivo .env (segredos nunca ficam no código).

O .env é um arquivo de texto com linhas CHAVE=valor. Variáveis já definidas no ambiente têm prioridade.
"""

from __future__ import annotations

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def carregar_env(caminho: Path | None = None) -> None:
    caminho = caminho or RAIZ / ".env"
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def valor(chave: str, padrao: str = "") -> str:
    return os.environ.get(chave, padrao)


def caminho_banco() -> Path:
    return Path(valor("RADAR_DB", str(RAIZ / "dados" / "radar.db")))


def pasta_logs() -> Path:
    return Path(valor("RADAR_LOGS", str(RAIZ / "logs")))


def pasta_saidas() -> Path:
    return Path(valor("RADAR_SAIDAS", str(RAIZ / "saidas")))
