"""Cliente HTTP comum a todos os conectores.

- timeout: desiste de uma chamada que demora demais (padrão 20 s) em vez de travar a coleta;
- retry com backoff: se a fonte falha por instabilidade (erro 5xx, timeout, rede), tenta de novo esperando
  2 s, 4 s, 8 s... (o "backoff" é esse intervalo que dobra a cada tentativa);
- rate limit: respeita o limite de chamadas da fonte. Espera um intervalo mínimo entre chamadas ao mesmo
  site e, se a fonte responder 429 ("muitas chamadas"), espera o tempo que ela pedir (cabeçalho Retry-After).
Erros definitivos (404 não encontrado, 401 chave errada) não são repetidos.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urlparse

USER_AGENT = "VeloraRadar/0.1 (+https://velora.com.br)"
REPETIVEIS = {408, 425, 429, 500, 502, 503, 504}


class ErroHTTP(Exception):
    def __init__(self, mensagem: str, status: int | None = None):
        super().__init__(mensagem)
        self.status = status


@dataclass
class ClienteHTTP:
    timeout: float = 20.0
    tentativas: int = 4
    backoff_inicial: float = 2.0
    intervalo_minimo: float = 1.0  # segundos entre chamadas ao mesmo site
    dormir: Callable[[float], None] = time.sleep
    relogio: Callable[[], float] = time.monotonic
    abrir: Callable = urllib.request.urlopen
    _ultima: dict[str, float] = field(default_factory=dict)
    chamadas: int = 0

    def _respeitar_intervalo(self, host: str) -> None:
        ultima = self._ultima.get(host)
        if ultima is not None:
            falta = self.intervalo_minimo - (self.relogio() - ultima)
            if falta > 0:
                self.dormir(falta)
        self._ultima[host] = self.relogio()

    def get(self, url: str, headers: dict[str, str] | None = None) -> bytes:
        return self.requisitar("GET", url, headers=headers)

    def get_json(self, url: str, headers: dict[str, str] | None = None):
        return json.loads(self.get(url, headers).decode("utf-8"))

    def post_json(self, url: str, corpo: dict, headers: dict[str, str] | None = None):
        dados = json.dumps(corpo).encode("utf-8")
        h = {"Content-Type": "application/json", **(headers or {})}
        return json.loads(self.requisitar("POST", url, dados, h).decode("utf-8"))

    def requisitar(self, metodo: str, url: str, dados: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
        host = urlparse(url).netloc
        espera = self.backoff_inicial
        ultimo_erro: ErroHTTP | None = None
        for tentativa in range(1, self.tentativas + 1):
            self._respeitar_intervalo(host)
            self.chamadas += 1
            pedido = urllib.request.Request(url, data=dados, method=metodo, headers={"User-Agent": USER_AGENT, **(headers or {})})
            try:
                with self.abrir(pedido, timeout=self.timeout) as resp:
                    return resp.read()
            except urllib.error.HTTPError as e:
                ultimo_erro = ErroHTTP(f"{metodo} {host} respondeu {e.code}", e.code)
                if e.code not in REPETIVEIS:
                    raise ultimo_erro from e
                pedida = e.headers.get("Retry-After") if e.headers else None
                if pedida and pedida.isdigit():
                    espera = max(espera, float(pedida))
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                ultimo_erro = ErroHTTP(f"{metodo} {host} falhou: {getattr(e, 'reason', e)}")
            if tentativa < self.tentativas:
                self.dormir(espera)
                espera *= 2
        raise ErroHTTP(f"{ultimo_erro} (depois de {self.tentativas} tentativas)", ultimo_erro.status if ultimo_erro else None)
