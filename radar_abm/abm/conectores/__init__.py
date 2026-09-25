"""Conectores: cada um vigia uma fonte e segue o mesmo contrato de quatro passos (ver base.py)."""

# Registro dos conectores disponíveis: nome -> classe. Cada fase acrescenta o seu.
CONECTORES: dict[str, type] = {}
