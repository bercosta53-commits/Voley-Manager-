"""Conectores: cada um vigia uma fonte e segue o mesmo contrato de quatro passos (ver base.py)."""

from .apollo import ConectorApollo
from .cnpj import ConectorCNPJ
from .noticias import ConectorNoticias

# Registro dos conectores disponíveis: nome -> classe. Cada fase acrescenta o seu.
CONECTORES: dict[str, type] = {c.nome: c for c in (ConectorCNPJ, ConectorNoticias, ConectorApollo)}
