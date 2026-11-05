#!/usr/bin/env python3
"""Conector de vagas: acha vagas comerciais abertas na página de carreiras de cada conta e grava sinais.

uso: python3 scripts/coletar_vagas.py [--limite N] [--dormir SEGUNDOS]

Pra cada conta com domínio, acha o link de carreiras/vagas no site (em qualquer lugar da home, não só no
rodapé) e lê as vagas abertas — ou direto no domínio da empresa, ou num ATS linkado de lá: Greenhouse e
Lever têm API pública documentada (usa ela, não HTML); Gupy e outros ATS de SPA só mostram vaga depois de
rodar o JS da página, então usa o helper scripts/renderizar_pagina.js (Playwright, já instalado no
ambiente) pra essas.

Classifica pelo CARGO, não pelo volume (ver 05-conectores-fontes.md, categoria 3.2): só vaga de marketing,
vendas, growth, parcerias etc. gera sinal — vaga só de engenharia não entra, é indício de crescimento, não
de dor comercial. Vaga de liderança (Head/diretor/VP) nessas áreas pesa mais que uma vaga de área sozinha.
Várias vagas-alvo abertas ao mesmo tempo também geram um sinal à parte (expansão comercial).

LinkedIn Jobs fica de fora: a própria spec marca "não automatizar" (termos de uso), e repete a mesma regra
pra qualquer coleta do LinkedIn em geral. Indeed também está na spec como fonte, mas só existe aqui via
MCP (sem endpoint HTTP direto pra um script bater) — roda à parte, fora deste conector.

Como as outras fontes: idempotente (não duplica por id do sinal), respeita robots.txt de cada site, só
segue link pro próprio domínio da empresa ou pra um ATS reconhecido (nunca rede social ou link de rodapé
qualquer). Sem data confiável de publicação em boa parte das fontes (só Greenhouse e Lever informam),
então o sinal usa a data da coleta como aproximação — ver campo "data" x "alertaEm" no tipo Sinal.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import http.client
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
RENDERIZADOR = RAIZ / "scripts" / "renderizar_pagina.js"
TIMEOUT_SEGUNDOS = 8
TIMEOUT_RENDER_SEGUNDOS = 20
MAX_PAGINAS_CANDIDATAS = 3
MAX_VAGAS_POR_CONTA = 5
MEIA_VIDA_DIAS = 60  # mesmo decaimento de gerar_dados.py, pra pontos_em() ficar comparável
USER_AGENT = "Mozilla/5.0 (compatible; VeloraRadar/1.0; coletor de vagas; uso interno)"

PADRAO_LINK = re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
PALAVRAS_CARREIRA = (
    "carreira", "carreiras", "vaga", "vagas", "trabalhe conosco", "trabalhe com a gente",
    "junte-se", "join us", "careers", "career", "work with us", "estamos contratando",
)
# host (sufixo) -> "api" quando dá pra usar API pública documentada, "spa" quando só renderizando o JS.
ATS_HOSTS = {
    "boards.greenhouse.io": "greenhouse",
    "job-boards.greenhouse.io": "greenhouse",
    "jobs.lever.co": "lever",
    "gupy.io": "spa",
    "workable.com": "spa",
    "recrutei.com.br": "spa",
    "inhire.app": "spa",
    "solides.com.br": "spa",
}

PALAVRAS_PATH_VAGA = ("vaga", "job", "oportunidade", "posicao", "position", "opening", "opportunity")
NIVEL_LIDERANCA = ("head", "diretor", "diretora", "director", "vp", "vice-presidente", "vice presidente")
AREA_ALVO = (
    "marketing", "growth", "demand gen", "geracao de demanda", "product marketing",
    "sdr", "bdr", "account executive", "inside sales", "vendas", "comercial", "sales",
    "partner manager", "channel manager", "parcerias", "partnerships", "revops",
    "crm", "customer success", "expansao", "receita", "revenue",
)


def sem_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn")


def normalizar(texto: str) -> str:
    return sem_acentos(texto or "").lower().strip()


def contem_palavra(texto_normalizado: str, palavras: tuple[str, ...]) -> bool:
    return any(re.search(r"\b" + re.escape(p) + r"\b", texto_normalizado) for p in palavras)


# ---------- classificação por cargo (ver docstring: por área, não por volume) ----------


def classificar_vaga(titulo: str) -> tuple[str, int, str] | None:
    """None quando o cargo não é de área-alvo (inclui vaga só de engenharia — não gera sinal, ver spec)."""
    t = normalizar(titulo)
    if not contem_palavra(t, AREA_ALVO):
        return None
    if contem_palavra(t, NIVEL_LIDERANCA):
        return "vaga_lideranca_alvo", 9, "Vaga de liderança comercial"
    return "vaga_area_alvo", 5, "Vaga em área-alvo"


def pontos_em(peso: int, fato: date, hoje: date) -> float:
    """Mesmo decaimento de gerar_dados.py: peso x 4, caindo pela metade a cada MEIA_VIDA_DIAS dias."""
    if hoje < fato:
        return 0.0
    return peso * 4 * 0.5 ** ((hoje - fato).days / MEIA_VIDA_DIAS)


# ---------- busca da página e descoberta do link de carreiras ----------


def buscar_pagina(url: str) -> str | None:
    for tentativa in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
                return r.read(900_000).decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, ValueError, ConnectionError, http.client.InvalidURL):
            if tentativa == 0:
                time.sleep(1.5)
    return None


def renderizar_pagina(url: str) -> str | None:
    """Pra ATS de SPA (Gupy e companhia): só mostra vaga depois do JS rodar — ver renderizar_pagina.js."""
    try:
        r = subprocess.run(
            ["node", str(RENDERIZADOR), url], capture_output=True, timeout=TIMEOUT_RENDER_SEGUNDOS, cwd=RAIZ
        )
        return r.stdout.decode("utf-8", errors="replace") if r.returncode == 0 and r.stdout else None
    except (subprocess.SubprocessError, OSError):
        return None


def permitido_por_robots(base_url: str, caminho: str, cache: dict[str, urllib.robotparser.RobotFileParser]) -> bool:
    if base_url not in cache:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(base_url + "/robots.txt")
        try:
            rp.read()
            # mesmo bug do stdlib documentado em coletar_cnpj.py: múltiplos "User-agent:" seguidos no
            # mesmo bloco não são parseados, entries fica vazio — sem entrada nenhuma, assume permitir.
            if not rp.entries and not rp.default_entry:
                rp = None
        except Exception:
            rp = None
        cache[base_url] = rp
    rp = cache[base_url]
    return rp.can_fetch(USER_AGENT, caminho) if rp else True


def tipo_ats(url: str) -> str | None:
    host = urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")
    for sufixo, tipo in ATS_HOSTS.items():
        if host == sufixo or host.endswith("." + sufixo):
            return tipo
    return None


def candidatos_carreira(corpo: str, base_url: str) -> list[str]:
    """Links de carreiras/vagas na home — mesmo domínio da empresa OU um ATS reconhecido (nunca rede
    social nem qualquer outro link externo, mesmo que o texto do link contenha uma das palavras)."""
    dominio_base = urllib.parse.urlparse(base_url).netloc

    def normalizar_url(href: str) -> str | None:
        if re.search(r"[\s<>]", href):
            return None  # lixo de template não renderizado, não é URL de verdade
        url_completa = urllib.parse.urljoin(base_url, href)
        partes = urllib.parse.urlparse(url_completa)
        if partes.scheme not in ("http", "https"):
            return None
        if partes.netloc != dominio_base and tipo_ats(url_completa) is None:
            return None
        return partes._replace(fragment="").geturl()

    candidatos: list[str] = []
    for href, texto in PADRAO_LINK.findall(corpo):
        texto_limpo = re.sub("<[^>]+>", "", html.unescape(texto)).strip().lower()
        alvo = f"{href} {texto_limpo}".lower()
        if not any(p in alvo for p in PALAVRAS_CARREIRA):
            continue
        url = normalizar_url(href)
        if url and url not in candidatos:
            candidatos.append(url)
    return candidatos[:MAX_PAGINAS_CANDIDATAS]


# ---------- extração de vagas por fonte ----------


def extrair_vagas_do_html(corpo: str, base_url: str) -> list[tuple[str, str]]:
    """Caminho genérico (site próprio ou ATS de SPA já renderizado). Não basta o TEXTO do link bater com
    uma palavra de área-alvo — uma página de carreiras normalmente tem, no menu ou no rodapé, outros links
    que por acaso contêm a mesma palavra sem ser vaga nenhuma (ex.: "Vendas" linkando pra uma landing page
    de "fale com um consultor", ou "Expansão de Talentos" linkando pra uma página de serviço que a empresa
    vende, não contrata). Por isso também exige que o link em si pareça o de uma vaga de verdade (caminho
    com "vaga"/"job"/"oportunidade"/"posição"...) — achado real, não suposição: ver relatório final."""
    vistos: list[tuple[str, str]] = []
    for href, texto_bruto in PADRAO_LINK.findall(corpo):
        titulo = re.sub("<[^>]+>", "", html.unescape(texto_bruto)).strip()
        if not titulo or len(titulo) > 120:
            continue
        url = urllib.parse.urljoin(base_url, href)
        partes = urllib.parse.urlparse(url)
        if partes.scheme not in ("http", "https"):
            continue
        if not contem_palavra(normalizar(partes.path), PALAVRAS_PATH_VAGA):
            continue
        vistos.append((titulo, url))
    return vistos


def extrair_token_ats(url: str) -> str | None:
    """O token normalmente vem no path (boards.greenhouse.io/empresa, jobs.lever.co/empresa), mas o
    embed do Greenhouse usa query string (boards.greenhouse.io/embed/job_board?for=empresa) — tenta os
    dois formatos."""
    partes = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(partes.query)
    if qs.get("for"):
        return qs["for"][0]
    return partes.path.strip("/").split("/")[0] or None


def buscar_vagas_greenhouse(url_quadro: str) -> list[tuple[str, str, str | None]]:
    token = extrair_token_ats(url_quadro)
    if not token:
        return []
    try:
        req = urllib.request.Request(
            f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs", headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
            dados = json.loads(r.read())
    except (urllib.error.URLError, TimeoutError, ValueError, http.client.InvalidURL):
        return []
    return [
        (vaga["title"], vaga["absolute_url"], (vaga.get("updated_at") or "")[:10] or None)
        for vaga in dados.get("jobs", [])
        if vaga.get("title") and vaga.get("absolute_url")
    ]


def buscar_vagas_lever(url_quadro: str) -> list[tuple[str, str, str | None]]:
    token = extrair_token_ats(url_quadro)
    if not token:
        return []
    try:
        req = urllib.request.Request(
            f"https://api.lever.co/v0/postings/{token}?mode=json", headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
            dados = json.loads(r.read())
    except (urllib.error.URLError, TimeoutError, ValueError, http.client.InvalidURL):
        return []
    resultado = []
    for vaga in dados if isinstance(dados, list) else []:
        if not (vaga.get("text") and vaga.get("hostedUrl")):
            continue
        criada_em = vaga.get("createdAt")
        data_iso = date.fromtimestamp(criada_em / 1000).isoformat() if isinstance(criada_em, (int, float)) else None
        resultado.append((vaga["text"], vaga["hostedUrl"], data_iso))
    return resultado


# ---------- por conta ----------


def achar_vagas_da_conta(nome_empresa: str, dominio: str, robots_cache: dict) -> tuple[list[tuple[str, str, str | None]], str | None]:
    """Retorna (lista de (titulo, link, data_ou_None) já filtrada por área-alvo, erro_ou_None)."""
    for base_url in (f"https://{dominio}", f"https://www.{dominio}"):
        if not permitido_por_robots(base_url, "/", robots_cache):
            continue
        corpo = buscar_pagina(base_url)
        if corpo is None:
            continue

        brutas: list[tuple[str, str, str | None]] = []
        for candidato in candidatos_carreira(corpo, base_url):
            caminho = urllib.parse.urlparse(candidato).path or "/"
            if not permitido_por_robots(f"https://{urllib.parse.urlparse(candidato).netloc}", caminho, robots_cache):
                continue
            tipo = tipo_ats(candidato)
            if tipo == "greenhouse":
                brutas.extend(buscar_vagas_greenhouse(candidato))
            elif tipo == "lever":
                brutas.extend(buscar_vagas_lever(candidato))
            elif tipo == "spa":
                html_renderizado = renderizar_pagina(candidato)
                if html_renderizado:
                    brutas.extend((t, l, None) for t, l in extrair_vagas_do_html(html_renderizado, candidato))
            else:
                corpo_candidato = buscar_pagina(candidato)
                if corpo_candidato:
                    brutas.extend((t, l, None) for t, l in extrair_vagas_do_html(corpo_candidato, candidato))

        classificadas: list[tuple[str, str, str | None]] = []
        links_vistos: set[str] = set()
        for titulo, link, data_iso in brutas:
            if link in links_vistos or classificar_vaga(titulo) is None:
                continue
            links_vistos.add(link)
            classificadas.append((titulo, link, data_iso))
        return classificadas[:MAX_VAGAS_POR_CONTA], None
    return [], "site não respondeu (https:// nem https://www.)"


def id_sinal(conta_id: str, link: str) -> str:
    return f"{conta_id}-vaga-{hashlib.sha1(link.encode()).hexdigest()[:10]}"


def montar_sinais(conta: dict, vagas: list[tuple[str, str, str | None]], hoje: date) -> list[dict]:
    comite = conta.get("comite", [])
    decisor = next((p for p in comite if p.get("papel") == "decisor"), None)
    pessoa = decisor or (comite[0] if comite else None)
    abordar = (
        {"nome": pessoa["nome"], "cargo": pessoa.get("cargo", ""), "papel": pessoa.get("papel", "influenciador")}
        if pessoa
        else {"nome": "", "cargo": "", "papel": "influenciador"}
    )

    sinais = []
    for titulo, link, data_iso in vagas:
        tipo, peso, rotulo = classificar_vaga(titulo)  # já passou pelo filtro em achar_vagas_da_conta
        data_fato = date.fromisoformat(data_iso) if data_iso else hoje
        sinais.append({
            "id": id_sinal(conta["id"], link), "contaId": conta["id"], "tipo": tipo, "rotulo": rotulo,
            "peso": peso, "porQueAgora": titulo, "fonte": "Página de carreiras", "data": data_fato.isoformat(),
            "alertaEm": hoje.isoformat(), "url": link, "exemplo": False, "abordar": abordar,
            "pontos": round(pontos_em(peso, data_fato, hoje)),
        })

    if len([s for s in sinais if s["tipo"] in ("vaga_area_alvo", "vaga_lideranca_alvo")]) >= 3:
        cargos = ", ".join(s["porQueAgora"] for s in sinais[:3])
        sinais.append({
            "id": f"{conta['id']}-vaga-expansao-{hoje.isoformat()}", "contaId": conta["id"],
            "tipo": "vaga_expansao_comercial", "rotulo": "Expansão comercial", "peso": 7,
            "porQueAgora": f"{len(sinais)} vagas comerciais abertas ao mesmo tempo: {cargos}...",
            "fonte": "Página de carreiras", "data": hoje.isoformat(), "alertaEm": hoje.isoformat(),
            "url": sinais[0]["url"], "exemplo": False, "abordar": abordar,
            "pontos": round(pontos_em(7, hoje, hoje)),
        })
    return sinais


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limite", type=int, default=None, help="só as N primeiras contas (pra testar rápido)")
    ap.add_argument("--dormir", type=float, default=0.4, help="segundos de espera entre contas (padrão 0.4)")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    hoje = date.today()

    ids_conhecidos = {s["id"] for s in base.get("sinais", [])}
    for c in base["contas"]:
        ids_conhecidos |= {e.get("id") for e in c.get("historico", []) if e.get("id")}

    contas = [c for c in base["contas"] if c.get("dominio")]
    if args.limite:
        contas = contas[: args.limite]

    robots_cache: dict = {}
    total_com_vaga_alvo = total_novos_sinais = 0
    erros: list[tuple[str, str]] = []

    for i, conta in enumerate(contas, 1):
        try:
            vagas, erro = achar_vagas_da_conta(conta["nome"], conta["dominio"], robots_cache)
            if erro:
                erros.append((conta["nome"], erro))
            elif vagas:
                novos = [s for s in montar_sinais(conta, vagas, hoje) if s["id"] not in ids_conhecidos]
                if novos:
                    base["sinais"].extend(novos)
                    ids_conhecidos |= {s["id"] for s in novos}
                    total_com_vaga_alvo += 1
                    total_novos_sinais += len(novos)
        except Exception as e:
            # um site com algo inesperado não pode derrubar a rodada inteira — grava o erro e segue
            # (lição do coletor de CNPJ: a rodada inteira travou e perdeu tudo por causa disso uma vez).
            erros.append((conta["nome"], f"erro inesperado: {e}"))

        if i % 25 == 0 or i == len(contas):
            print(f"  {i}/{len(contas)} contas processadas...", file=sys.stderr)
        time.sleep(args.dormir)

    base["geradoEm"] = hoje.isoformat()
    base["sinais"].sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{len(contas)} contas com domínio verificadas")
    print(f"{total_com_vaga_alvo} com vaga de área-alvo · {total_novos_sinais} sinais novos")
    if erros:
        print(f"{len(erros)} erro(s):")
        for nome, msg in erros[:10]:
            print(f"  - {nome}: {msg}")
        if len(erros) > 10:
            print(f"  ... e mais {len(erros) - 10}")


if __name__ == "__main__":
    main()
