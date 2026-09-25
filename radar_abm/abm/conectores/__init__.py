"""Conectores: cada um vigia uma fonte e segue o mesmo contrato de quatro passos (ver base.py)."""

from .cnpj import ConectorCNPJ

# Registro dos conectores disponíveis: nome -> classe. Cada fase acrescenta o seu.
CONECTORES: dict[str, type] = {ConectorCNPJ.nome: ConectorCNPJ}
