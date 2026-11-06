#!/usr/bin/env python3
"""Conector de CNPJ e firmografia: acha o CNPJ no site da empresa e enriquece via Receita Federal.

uso: python3 scripts/coletar_cnpj.py [--limite N] [--dormir SEGUNDOS]

Não existe busca por nome gratuita na Receita Federal — só por CNPJ já conhecido (ver 05-conectores-
-fontes.md, categoria 3.1). Como nenhuma das contas reais tem CNPJ ainda, o primeiro passo é achar o
número: toda empresa brasileira é obrigada a publicar o CNPJ em algum lugar do próprio site (rodapé,
termos de uso, política de privacidade) — então para cada conta com domínio:
  1. busca o padrão XX.XXX.XXX/XXXX-XX na home;
  2. se não achar, lê os links do rodapé da home, filtra os que parecem levar a termos/privacidade/
     política/LGPD e busca nessas páginas (até 2);
  3. valida o dígito verificador antes de aceitar (evita casar um número parecido que não é CNPJ de
     verdade);
  4. com o CNPJ validado, consulta a BrasilAPI (gratuita, sem chave) e grava razão social, CNAE, porte,
     situação cadastral, capital social, data de abertura e quadro de sócios.
Respeita robots.txt de cada site. Idempotente: pula conta que já tem CNPJ.

Isso não acha todo mundo — a spec já avisa: "validar antes de implementar". Testado numa amostra real
antes da rodada completa (ver relatório final: achou X de Y). Quem não tiver CNPJ publicado em nenhuma
dessas páginas fica sem, em vez de arriscar gravar o CNPJ errado.
"""

from __future__ import annotations

import argparse
import html
import http.client
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
TIMEOUT_SEGUNDOS = 8
MAX_PAGINAS_CANDIDATAS = 2
USER_AGENT = "Mozilla/5.0 (compatible; VeloraRadarBot/1.0; +coletor de CNPJ publico; uso interno)"

PADRAO_CNPJ = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
PADRAO_LINK = re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
# "termos de uso" tende a dizer "este site é operado por X" — identifica a própria empresa. "privacidade"
# e companhia costumam citar o CNPJ de outro alguém (o advogado/DPO responsável pela LGPD, não a empresa) —
# por isso entram por último, só se as primeiras não acharem nada. Ver extrair_cnpj() pra o outro lado
# dessa mesma proteção: rejeitar um CNPJ claramente de terceiro mesmo numa página "boa".
PALAVRAS_RODAPE_EM_ORDEM = (("termo", "condi", "sobre", "legal"), ("privacidade", "política", "politica", "lgpd", "cookies"))
PALAVRAS_TERCEIRO = ("advogad", "sociedade de advogados", "escritorio de advocacia", " dpo", "encarregado de prote", "representada por", "contabilidade", "contador respons")


def sem_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn")


def normalizar(texto: str) -> str:
    return sem_acentos(texto or "").lower().strip()


def digito_verificador(nums: str, pesos: list[int]) -> str:
    soma = sum(int(n) * p for n, p in zip(nums, pesos))
    resto = soma % 11
    return "0" if resto < 2 else str(11 - resto)


def cnpj_valido(digitos: str) -> bool:
    """Confere os 2 dígitos verificadores do CNPJ (algoritmo oficial) — evita aceitar um número com a
    cara de CNPJ que na verdade é outra coisa (telefone, protocolo, CNPJ de exemplo no template)."""
    if len(digitos) != 14 or len(set(digitos)) == 1:
        return False
    d1 = digito_verificador(digitos[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = digito_verificador(digitos[:12] + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return digitos[12:] == d1 + d2


def cnpj_matriz(cnpj: str) -> str:
    """Troca o sufixo (filial 0002, 0003...) por 0001 e recalcula os dígitos verificadores — mesma
    empresa, mas a matriz, que costuma ser o CNPJ usado como referência. Ver uso em main(): uma filial
    fechada não significa que a empresa fechou (ela pode ter fechado só aquele endereço)."""
    raiz = cnpj[:8] + "0001"
    d1 = digito_verificador(raiz, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = digito_verificador(raiz + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return raiz + d1 + d2


# ---------- busca do CNPJ no site da própria empresa ----------


def buscar_pagina(url: str) -> str | None:
    # 1 nova tentativa: na prática boa parte das falhas aqui são do túnel do proxy desta sandbox
    # (CONNECT falha por um instante), não do site de verdade — confirmado batendo de novo nos mesmos
    # domínios que "falharam" e vendo responder normalmente.
    for tentativa in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
                return r.read(900_000).decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, ValueError, ConnectionError, http.client.InvalidURL):
            if tentativa == 0:
                time.sleep(1.5)
    return None


def permitido_por_robots(base_url: str, caminho: str, cache: dict[str, urllib.robotparser.RobotFileParser]) -> bool:
    if base_url not in cache:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(base_url + "/robots.txt")
        try:
            rp.read()
            # urllib.robotparser tem um bug conhecido: não entende vários "User-agent:" seguidos
            # compartilhando um bloco de regras (um padrão comum hoje, com a lista enorme de bots de IA
            # que cada site lista) — lê o arquivo mas não guarda regra nenhuma. Sem nenhuma entrada, o
            # padrão da lib é negar; o padrão correto (e o mesmo que já uso quando o robots.txt não existe)
            # é permitir quando não dá pra determinar a regra.
            if not rp.entries and not rp.default_entry:
                rp = None
        except Exception:
            rp = None  # sem robots.txt ou inacessível: segue (padrão de permitir quando não há regra)
        cache[base_url] = rp
    rp = cache[base_url]
    return rp.can_fetch(USER_AGENT, caminho) if rp else True


def extrair_cnpj(corpo: str, nome_empresa: str) -> str | None:
    """Entre vários CNPJ válidos numa página, prefere um com o nome da empresa por perto (forte sinal de
    que é dela mesma) e rejeita um com "advogados"/"DPO"/"contabilidade" por perto (quase sempre é o
    responsável pela LGPD ou a contabilidade terceirizada, não a empresa) — foi exatamente o que aconteceu
    com a política de privacidade da A3Data, que cita o CNPJ do escritório de advocacia do DPO deles."""
    texto_visivel = re.sub(r"<[^>]+>", " ", corpo)
    nome_normalizado = normalizar(nome_empresa)
    candidato_reserva = None
    for m in PADRAO_CNPJ.finditer(texto_visivel):
        digitos = re.sub(r"\D", "", m.group(0))
        if not cnpj_valido(digitos):
            continue
        ao_redor = normalizar(texto_visivel[max(0, m.start() - 250) : m.end() + 60])
        if any(p in ao_redor for p in PALAVRAS_TERCEIRO):
            continue
        if nome_normalizado and nome_normalizado in ao_redor:
            return digitos
        if candidato_reserva is None:
            candidato_reserva = digitos
    return candidato_reserva


def candidatos_rodape(corpo: str, base_url: str) -> list[str]:
    """Links do rodapé com cara de termos/privacidade — só no mesmo domínio da home (nunca segue link
    pra fora, tipo WhatsApp ou rede social, mesmo que o texto do link contenha uma das palavras).
    Página de "termos" vem antes de "privacidade" na lista — ver PALAVRAS_RODAPE_EM_ORDEM."""
    domino_base = urllib.parse.urlparse(base_url).netloc

    def normalizar_url(href: str) -> str | None:
        if re.search(r"[\s<>]", href):
            return None  # lixo de template não renderizado (ex.: "<?php echo base_url(...)"), não é URL
        url_completa = urllib.parse.urljoin(base_url, href)
        partes = urllib.parse.urlparse(url_completa)
        if partes.netloc != domino_base or partes.scheme not in ("http", "https"):
            return None
        url_normalizada = partes._replace(fragment="").geturl()
        return None if url_normalizada.rstrip("/") == base_url.rstrip("/") else url_normalizada

    candidatos: list[str] = []
    for grupo_palavras in PALAVRAS_RODAPE_EM_ORDEM:
        for href, texto in PADRAO_LINK.findall(corpo):
            texto_limpo = re.sub("<[^>]+>", "", html.unescape(texto)).strip().lower()
            alvo = f"{href} {texto_limpo}".lower()
            if not any(p in alvo for p in grupo_palavras):
                continue
            url = normalizar_url(href)
            if url and url not in candidatos:
                candidatos.append(url)
    return candidatos[:MAX_PAGINAS_CANDIDATAS]


def achar_cnpj_no_site(nome_empresa: str, dominio: str, robots_cache: dict) -> tuple[str | None, str | None]:
    """Retorna (cnpj_ou_None, erro_ou_None)."""
    for base_url in (f"https://{dominio}", f"https://www.{dominio}"):
        if not permitido_por_robots(base_url, "/", robots_cache):
            continue
        corpo = buscar_pagina(base_url)
        if corpo is None:
            continue
        achado = extrair_cnpj(corpo, nome_empresa)
        if achado:
            return achado, None
        for candidato in candidatos_rodape(corpo, base_url):
            caminho = urllib.parse.urlparse(candidato).path or "/"
            if not permitido_por_robots(base_url, caminho, robots_cache):
                continue
            corpo2 = buscar_pagina(candidato)
            if corpo2:
                achado2 = extrair_cnpj(corpo2, nome_empresa)
                if achado2:
                    return achado2, None
        # segunda chance: páginas legais nos endereços de costume (muito rodapé lista só "Política" sem link
        # rastreável) e a home renderizada com JavaScript (site montado no navegador não traz o rodapé no HTML)
        for caminho in CAMINHOS_LEGAIS:
            if not permitido_por_robots(base_url, caminho, robots_cache):
                continue
            corpo3 = buscar_pagina(base_url + caminho)
            achado3 = extrair_cnpj(corpo3, nome_empresa) if corpo3 else None
            if achado3:
                return achado3, None
        renderizado = renderizar(base_url)
        achado4 = extrair_cnpj(renderizado, nome_empresa) if renderizado else None
        if achado4:
            return achado4, None
        return None, None  # home respondeu, nada encontrado — não tenta o outro esquema (www/sem www)
    return None, "site não respondeu (https:// nem https://www.)"


CAMINHOS_LEGAIS = ("/politica-de-privacidade", "/privacidade", "/termos-de-uso", "/termos", "/lgpd",
                   "/privacy-policy", "/politica-de-privacidade/", "/contato", "/sobre")
RENDERIZADOR = RAIZ / "scripts" / "renderizar_pagina.js"


def renderizar(url: str) -> str | None:
    import subprocess
    try:
        r = subprocess.run(["node", str(RENDERIZADOR), url], capture_output=True, timeout=30, cwd=RAIZ)
        return r.stdout.decode("utf-8", errors="replace") if r.returncode == 0 and r.stdout else None
    except (subprocess.SubprocessError, OSError):
        return None


# ---------- enriquecimento via BrasilAPI ----------


def consultar_brasilapi(cnpj: str) -> dict | None:
    req = urllib.request.Request(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


def titulo(texto: str) -> str:
    return " ".join(p.capitalize() for p in texto.split()) if texto else texto


def aplicar_enriquecimento(conta: dict, cnpj: str, dados: dict) -> None:
    conta["cnpj"] = f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
    # a importação copia o nome fantasia pra razão social; a Receita manda nela, na cidade e na UF (inclusive
    # por cima de UF que veio do endereço do site ou de pesquisa — ver classificar_contas.py)
    if dados.get("razao_social") and (not conta.get("razaoSocial") or conta.get("razaoSocial") == conta.get("nome")):
        conta["razaoSocial"] = titulo(dados["razao_social"])
    if dados.get("municipio"):
        conta["cidade"] = titulo(dados["municipio"])
    if dados.get("uf"):
        conta["uf"] = dados["uf"]
        conta["ufFonte"] = "receita"
    if not conta.get("segmento") and dados.get("cnae_fiscal_descricao"):
        conta["segmento"] = dados["cnae_fiscal_descricao"]
    if dados.get("cnae_fiscal") and dados.get("cnae_fiscal_descricao"):
        codigo = str(dados["cnae_fiscal"])
        conta["cnae"] = f"{codigo[:4]}-{codigo[4]}/{codigo[5:]} {dados['cnae_fiscal_descricao']}"
    if dados.get("porte"):
        conta["porte"] = titulo(dados["porte"])
    if dados.get("descricao_situacao_cadastral"):
        conta["situacaoCadastral"] = titulo(dados["descricao_situacao_cadastral"])
    if dados.get("data_inicio_atividade"):
        conta["dataAbertura"] = dados["data_inicio_atividade"]
    if dados.get("capital_social") is not None:
        conta["capitalSocial"] = dados["capital_social"]
    socios = [
        {"nome": titulo(s["nome_socio"]), "qualificacao": s.get("qualificacao_socio", "")}
        for s in dados.get("qsa", [])
        if s.get("nome_socio")
    ]
    if socios:
        conta["socios"] = socios


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limite", type=int, default=None, help="só as N primeiras contas sem CNPJ (pra testar rápido)")
    ap.add_argument("--dormir", type=float, default=0.3, help="segundos de espera entre contas (padrão 0.3)")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))

    pendentes = [c for c in base["contas"] if c.get("dominio") and not c.get("cnpj")]
    if args.limite:
        pendentes = pendentes[: args.limite]

    robots_cache: dict = {}
    achados_site = achados_brasilapi = sem_cnpj = 0
    erros: list[tuple[str, str]] = []

    for i, conta in enumerate(pendentes, 1):
        try:
            cnpj, erro = achar_cnpj_no_site(conta["nome"], conta["dominio"], robots_cache)
            if erro:
                erros.append((conta["nome"], erro))
            elif cnpj:
                achados_site += 1
                dados = consultar_brasilapi(cnpj)
                if dados and dados.get("identificador_matriz_filial") == 2:
                    # achou o CNPJ de uma filial (ex.: citado numa página regional) — prefere a matriz
                    # quando ela existir, pra não mostrar "baixada" só porque aquele endereço fechou.
                    cnpj_da_matriz = cnpj_matriz(cnpj)
                    dados_matriz = consultar_brasilapi(cnpj_da_matriz)
                    if dados_matriz and "razao_social" in dados_matriz:
                        cnpj, dados = cnpj_da_matriz, dados_matriz
                if dados and "razao_social" in dados:
                    aplicar_enriquecimento(conta, cnpj, dados)
                    achados_brasilapi += 1
                else:
                    erros.append((conta["nome"], f"achou CNPJ {cnpj} no site mas a BrasilAPI não confirmou"))
            else:
                sem_cnpj += 1
        except Exception as e:
            # um site que falha de um jeito inesperado (ex.: o lixo de template do caso acima, antes do
            # fix) não pode derrubar a rodada inteira e perder o progresso já feito nas outras contas —
            # grava o erro e segue.
            erros.append((conta["nome"], f"erro inesperado: {e}"))

        if i % 25 == 0 or i == len(pendentes):
            print(f"  {i}/{len(pendentes)} contas processadas...", file=sys.stderr)
        time.sleep(args.dormir)

    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{len(pendentes)} contas sem CNPJ verificadas")
    print(f"{achados_site} CNPJ achado e validado no site · {achados_brasilapi} enriquecido(s) com sucesso via BrasilAPI")
    print(f"{sem_cnpj} sem CNPJ publicado em nenhuma página testada")
    if erros:
        print(f"{len(erros)} erro(s):")
        for nome, msg in erros[:10]:
            print(f"  - {nome}: {msg}")
        if len(erros) > 10:
            print(f"  ... e mais {len(erros) - 10}")


if __name__ == "__main__":
    main()
