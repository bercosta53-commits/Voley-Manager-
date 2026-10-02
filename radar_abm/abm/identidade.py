"""Identidade de uma conta: CNPJ, domínio e nome normalizados.

É o que decide se duas linhas de planilha são a mesma empresa. Matriz e filiais compartilham os oito
primeiros dígitos do CNPJ (a raiz); o domínio é reduzido ao registrável (``alfa.com.br``, não
``www.blog.alfa.com.br``); e-mails, redes sociais e sites gratuitos não identificam empresa nenhuma.
"""

from __future__ import annotations

import re
import unicodedata

# Segundo nível de registro no .br e sufixos compostos comuns: o domínio registrável tem três partes.
SUFIXOS_COMPOSTOS = {
    "com.br", "net.br", "org.br", "adv.br", "coop.br", "ind.br", "eng.br", "srv.br", "tec.br",
    "emp.br", "agr.br", "art.br", "eco.br", "edu.br", "gov.br", "inf.br", "med.br", "not.br",
    "psi.br", "rec.br", "seg.br", "tur.br", "tv.br", "etc.br", "ong.br", "leg.br", "jus.br",
    "co.uk", "com.ar", "com.mx", "com.pt", "com.co", "com.uy",
}

# Provedores de e-mail, redes e hospedagens gratuitas: não servem de identidade de conta.
DOMINIOS_GENERICOS = {
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br",
    "live.com", "msn.com", "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "uol.com.br",
    "bol.com.br", "terra.com.br", "ig.com.br", "globo.com", "r7.com", "zipmail.com.br",
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
    "wixsite.com", "wordpress.com", "blogspot.com", "google.com", "sites.google.com", "linktr.ee",
}

_SUFIXOS_JURIDICOS = re.compile(
    r"\b(ltda|limitada|s\s*/?\s*a|sa|eireli|me|epp|mei|cia|companhia|"
    r"sociedade de advogados|advogados associados|sociedade individual de advocacia)\b\.?"
)


def so_digitos(valor: object) -> str:
    return re.sub(r"\D", "", str(valor or ""))


def cnpj_valido(valor: object) -> bool:
    d = so_digitos(valor)
    if len(d) != 14 or d == d[0] * 14:
        return False

    def dv(base: str) -> int:
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][-len(base):]
        resto = sum(int(n) * p for n, p in zip(base, pesos)) % 11
        return 0 if resto < 2 else 11 - resto

    return dv(d[:12]) == int(d[12]) and dv(d[:13]) == int(d[13])


def cnpj_normalizado(valor: object) -> str | None:
    """CNPJ com 14 dígitos se for válido; planilhas costumam perder zeros à esquerda."""
    d = so_digitos(valor)
    if 11 <= len(d) < 14:
        d = d.zfill(14)
    return d if cnpj_valido(d) else None


def cnpj_raiz(cnpj: str | None) -> str | None:
    return cnpj[:8] if cnpj else None


def e_matriz(cnpj: str) -> bool:
    return cnpj[8:12] == "0001"


def normalizar_dominio(valor: object) -> str | None:
    """Reduz site, URL ou e-mail ao domínio registrável, em minúsculas. None se não parecer domínio."""
    texto = str(valor or "").strip().lower()
    if not texto:
        return None
    if "@" in texto:
        texto = texto.rsplit("@", 1)[1]
    texto = re.sub(r"^[a-z][a-z0-9+.-]*://", "", texto)
    texto = re.split(r"[/?#\s]", texto, maxsplit=1)[0].split(":")[0].strip(".")
    texto = unicodedata.normalize("NFKC", texto)
    partes = [p for p in texto.split(".") if p]
    if len(partes) < 2 or not all(re.fullmatch(r"[a-z0-9-]+", p) for p in partes):
        return None
    if not re.fullmatch(r"[a-z]{2,}", partes[-1]):
        return None
    tamanho = 3 if ".".join(partes[-2:]) in SUFIXOS_COMPOSTOS else 2
    if len(partes) < tamanho:
        return None
    return ".".join(partes[-tamanho:])


def dominio_generico(dominio: str | None) -> bool:
    return bool(dominio) and dominio in DOMINIOS_GENERICOS


def sem_acentos(texto: object) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(texto or "")) if unicodedata.category(c) != "Mn")


def normalizar_nome(valor: object) -> str:
    """Nome comparável: sem acento, sem forma jurídica, sem pontuação."""
    texto = re.sub(r"[.,]", " ", sem_acentos(valor).lower())
    texto = _SUFIXOS_JURIDICOS.sub(" ", texto)
    texto = re.sub(r"[^a-z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_chave(valor: object) -> str:
    """Cabeçalho de planilha comparável: 'Razão Social' -> 'razao_social'."""
    return re.sub(r"[^a-z0-9]+", "_", sem_acentos(valor).lower()).strip("_")


# Marcadores que planilhas usam no lugar de "vazio".
_VAZIOS = {"nao encontrado", "nao encontrada", "n/a", "na", "nd", "n/d", "-", "--", "null", "none", "?", "sem", "sem informacao"}

UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}


def limpo(valor: object) -> str:
    """Texto sem espaços nas pontas; marcadores como 'NÃO ENCONTRADO' viram vazio."""
    texto = re.sub(r"\s+", " ", str(valor if valor is not None else "")).strip()
    return "" if sem_acentos(texto).lower() in _VAZIOS else texto


def normalizar_uf(valor: object) -> str | None:
    uf = limpo(valor).upper()
    return uf if uf in UFS else None
