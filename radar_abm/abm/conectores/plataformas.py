"""Plataformas de vagas que o conector de vagas sabe ler: onde fica a lista de vagas e como traduzi-la.

Todas são públicas e sem chave: são as páginas de carreiras que as próprias empresas publicam.

| Plataforma | Página de carreiras               | O que o conector lê                                          |
| ---------- | --------------------------------- | ------------------------------------------------------------ |
| Gupy       | https://<empresa>.gupy.io         | a própria página (lista de vagas)                            |
| Greenhouse | https://boards.greenhouse.io/<x>  | https://boards-api.greenhouse.io/v1/boards/<x>/jobs (JSON)   |
| Lever      | https://jobs.lever.co/<x>         | https://api.lever.co/v0/postings/<x>?mode=json (JSON)        |
| Ashby      | https://jobs.ashbyhq.com/<x>      | https://api.ashbyhq.com/posting-api/job-board/<x> (JSON)     |
| Sólides    | https://<x>.vagas.solides.com.br  | a própria página (links /vaga/<número>)                      |

Glassdoor não entra aqui: não tem API aberta e bloqueia acesso automático. Suas vagas costumam vir destas
mesmas plataformas e do Indeed (que entram pelo arquivo; veja VAGAS_ROTINA.md).
"""

from __future__ import annotations

import html as html_lib
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Callable

from ..identidade import sem_acentos

_MESES = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}
_MESES.update({m: i for i, m in enumerate(["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto",
                                           "setembro", "outubro", "novembro", "dezembro"], 1)})


def ler_data(texto) -> str | None:
    """'2026-09-15', '15/09/2026', 'September 15, 2026' ou milissegundos desde 1970 -> '2026-09-15'."""
    if isinstance(texto, (int, float)):
        return datetime.fromtimestamp(texto / 1000, tz=timezone.utc).date().isoformat()
    t = str(texto or "").strip()
    if not t:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(t[:10], fmt).date().isoformat()
        except ValueError:
            pass
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", sem_acentos(t))
    if m and m.group(1).lower() in _MESES:
        return date(int(m.group(3)), _MESES[m.group(1).lower()], int(m.group(2))).isoformat()
    return None


def _texto(fragmento: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", fragmento or ""))).strip()


def _titulo_da_pagina(conteudo: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", conteudo, re.S | re.I)
    return _texto(m.group(1)) if m else ""


def _vaga(id_, titulo, local="", tipo="", url="", data=None) -> dict:
    return {"id": str(id_), "titulo": (titulo or "").strip(), "local": (local or "").strip(), "tipo": tipo or "",
            "url": url or "", "data": data}


# ------------------------------------------------------------------------------------------ leitores

def ler_links(conteudo: str, base: str, padrao: str) -> list[dict]:
    """Lê vagas de uma página HTML pelos links (href que casa com `padrao`, cujo grupo 1 é o id da vaga)."""
    vagas: dict[str, dict] = {}
    for m in re.finditer(rf'<a[^>]+href="({padrao}[^"]*)"[^>]*>(.*?)</a>', conteudo, re.S | re.I):
        href, jid, dentro = m.group(1), m.group(2), m.group(3)
        cabecalho = re.search(r"<h[1-6][^>]*>(.*?)</h[1-6]>", dentro, re.S | re.I)
        partes = [_texto(p) for p in re.split(r"</(?:div|span|h\d|p)>", dentro)]
        partes = [p for p in partes if p]
        nome = _texto(cabecalho.group(1)) if cabecalho else (partes[0] if partes else "")
        resto = [p for p in partes if p != nome]
        url = href if href.startswith("http") else base.rstrip("/") + "/" + href.lstrip("/")
        vagas[jid] = _vaga(jid, nome, resto[0] if resto else "", resto[1] if len(resto) > 1 else "", url.split("?")[0])
    return list(vagas.values())


def _vagas_no_json(no) -> list[dict]:
    """Procura, em qualquer nível de um JSON, listas de vagas (objetos com id e title/name)."""
    if isinstance(no, list):
        if no and all(isinstance(x, dict) and "id" in x and ("title" in x or "name" in x) for x in no):
            saida = []
            for x in no:
                endereco = (x.get("workplace") or {}).get("address") or {}
                cidade = x.get("addressCity") or x.get("city") or endereco.get("city") or ""
                uf = x.get("addressState") or x.get("state") or endereco.get("stateShortName") or endereco.get("state") or ""
                saida.append(_vaga(x["id"], x.get("title") or x.get("name"), " - ".join(p for p in (cidade, uf) if p),
                                   x.get("workplaceType") or (x.get("workplace") or {}).get("workplaceType") or x.get("type") or "",
                                   x.get("jobUrl") or x.get("url") or "",
                                   ler_data(x.get("publishedDate") or x.get("publishedAt") or x.get("published_date"))))
            return saida
        return [v for x in no for v in _vagas_no_json(x)]
    if isinstance(no, dict):
        return [v for x in no.values() for v in _vagas_no_json(x)]
    return []


def ler_gupy(conteudo: str, base: str) -> dict:
    vagas = []
    dados = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', conteudo, re.S)
    if dados:
        try:
            vagas = _vagas_no_json(json.loads(dados.group(1)))
        except (json.JSONDecodeError, KeyError, TypeError):
            vagas = []
    if not vagas:
        vagas = ler_links(conteudo, base, r"(?:https://[a-z0-9-]+\.gupy\.io)?/jobs/(\d+)")
    return {"empresa": _titulo_da_pagina(conteudo), "vagas": vagas}


def ler_greenhouse(conteudo: str, base: str) -> dict:
    dados = json.loads(conteudo)
    vagas = [_vaga(j["id"], j.get("title"), (j.get("location") or {}).get("name", ""), "", j.get("absolute_url", ""),
                   ler_data(j.get("first_published") or j.get("updated_at"))) for j in dados.get("jobs", [])]
    return {"empresa": dados.get("name", ""), "vagas": vagas}


def ler_lever(conteudo: str, base: str) -> dict:
    dados = json.loads(conteudo)
    vagas = [_vaga(j["id"], j.get("text"), (j.get("categories") or {}).get("location", ""),
                   (j.get("categories") or {}).get("commitment", ""), j.get("hostedUrl", ""), ler_data(j.get("createdAt")))
             for j in dados]
    return {"empresa": "", "vagas": vagas}


def ler_ashby(conteudo: str, base: str) -> dict:
    dados = json.loads(conteudo)
    vagas = [_vaga(j["id"], j.get("title"), j.get("location", ""), j.get("employmentType", ""), j.get("jobUrl", ""),
                   ler_data(j.get("publishedAt"))) for j in dados.get("jobs", []) if j.get("isListed", True)]
    return {"empresa": "", "vagas": vagas}


def ler_solides(conteudo: str, base: str) -> dict:
    return {"empresa": _titulo_da_pagina(conteudo),
            "vagas": ler_links(conteudo, base, r"(?:https://[a-z0-9.-]*solides\.com\.br)?/vaga/(\d+)")}


# ------------------------------------------------------------------------------------------ plataformas

@dataclass(frozen=True)
class Plataforma:
    id: str
    nome: str
    pagina: str          # endereço da página de carreiras que a pessoa vê
    lista: str           # endereço de onde o conector lê as vagas
    reconhece: str       # expressão que acha o identificador da empresa num endereço
    ler: Callable[[str, str], dict]
    nome_da_empresa: str | None = None  # endereço que diz o nome da empresa (para conferir um palpite)


PLATAFORMAS = {
    "gupy": Plataforma("gupy", "Gupy", "https://{x}.gupy.io/", "https://{x}.gupy.io/", r"https?://([a-z0-9-]+)\.gupy\.io", ler_gupy),
    "greenhouse": Plataforma("greenhouse", "Greenhouse", "https://boards.greenhouse.io/{x}",
                             "https://boards-api.greenhouse.io/v1/boards/{x}/jobs",
                             r"(?:job-boards|boards)(?:-api)?\.greenhouse\.io/(?:v1/boards/)?([A-Za-z0-9_-]+)", ler_greenhouse,
                             "https://boards-api.greenhouse.io/v1/boards/{x}"),
    "lever": Plataforma("lever", "Lever", "https://jobs.lever.co/{x}", "https://api.lever.co/v0/postings/{x}?mode=json",
                        r"jobs\.lever\.co/([A-Za-z0-9_-]+)", ler_lever),
    "ashby": Plataforma("ashby", "Ashby", "https://jobs.ashbyhq.com/{x}", "https://api.ashbyhq.com/posting-api/job-board/{x}",
                        r"jobs\.ashbyhq\.com/([A-Za-z0-9._-]+)", ler_ashby),
    "solides": Plataforma("solides", "Sólides", "https://{x}.vagas.solides.com.br/", "https://{x}.vagas.solides.com.br/",
                          r"https?://([a-z0-9-]+)\.vagas\.solides\.com\.br", ler_solides),
}


def reconhecer(url: str) -> tuple[Plataforma, str] | None:
    """Qual plataforma e qual identificador da empresa um endereço de página de carreiras indica."""
    for p in PLATAFORMAS.values():
        m = re.search(p.reconhece, url or "")
        if m:
            return p, m.group(1)
    return None
