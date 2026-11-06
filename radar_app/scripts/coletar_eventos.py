#!/usr/bin/env python3
"""Conector de eventos e palestras: presença das contas em eventos de TI e palestras das pessoas do comitê.

uso: python3 scripts/coletar_eventos.py [--sem-pessoas] [--max-pessoas N] [--dormir SEGUNDOS]

Duas frentes (05-conectores-fontes.md, 3.5 e 3.6):

1. Eventos da lista configurável (data/eventos.json): varre cada página de expositores, patrocinadores,
   startups e palestrantes e procura o nome de cada conta e o nome completo de cada pessoa do comitê.
   Página que só mostra conteúdo depois do JavaScript é renderizada com o mesmo helper do coletor de vagas
   (scripts/renderizar_pagina.js). Achou → sinal "presenca_evento" (empresa) ou "palestra_lideranca"
   (pessoa), com a DATA DO EVENTO — que pode ser futura: o score conta 30 dias antes (ver JANELAS em
   calcular_score.py) e a agenda presencial lista os próximos 60 dias. Diretório ainda não publicado não é
   erro: a página é revarrida na próxima rodada.

2. Palestras por pessoa: busca no Google Notícias o nome completo dos decisores de cada conta junto de
   palavras de palco ("palestra", "painel", "podcast", "webinar"...) e só aceita a matéria que cita também a
   empresa. Pega o que nenhuma lista de evento traz: o podcast, o painel do meetup, o webinar do parceiro. Entra como notícia crua (peso 0) para o
   classificador decidir — "palestra_evento" ou "irrelevante" (homônimo de pessoa também existe).

A pessoa só ganha a tag do fato (quem, onde, quando); o ponto vai para a conta, uma vez por fato.
LinkedIn fica de fora, como em todo o radar. Idempotente: os ids são estáveis por evento + conta (+ pessoa).
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from coletar_noticias import (HOMONIMOS_LIMITE, JANELA_CAIXA_DIAS, buscar_rss, escolher_abordar,
                              nome_curto_demais, normalizar, parsear_itens, variantes_nome)

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
EVENTOS = RAIZ / "data" / "eventos.json"
RENDERIZADOR = RAIZ / "scripts" / "renderizar_pagina.js"
TIMEOUT_SEGUNDOS = 15
USER_AGENT = "Mozilla/5.0 (compatible; VeloraRadar/1.0; coletor de eventos; uso interno)"
AGENDA_DIAS = 60
MAX_PESSOAS_POR_CONTA = 2  # decisores primeiro; mantém a rodada em poucos minutos

PESOS = {"presenca_evento": 6, "palestra_lideranca": 7}
ROTULOS = {"presenca_evento": "Presença em evento", "palestra_lideranca": "Palestra de liderança"}
PAPEL_TEXTO = {"expositor": "Expositora", "patrocinador": "Patrocinadora", "startup": "Startup em exposição"}


def texto_da_pagina(url: str) -> str | None:
    bruto = None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as r:
            bruto = r.read(3_000_000).decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
        pass
    texto = limpar(bruto) if bruto else ""
    if len(texto) < 3000:  # pouco texto visível: diretório montado por JavaScript
        try:
            r = subprocess.run(["node", str(RENDERIZADOR), url], capture_output=True, timeout=60, cwd=RAIZ)
            if r.returncode == 0 and r.stdout:
                texto = limpar(r.stdout.decode("utf-8", errors="replace"))
        except (subprocess.SubprocessError, OSError):
            pass
    return texto or None


def limpar(bruto: str) -> str:
    sem_codigo = re.sub(r"<(script|style|noscript)\b.*?</\1>", " ", bruto, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", sem_codigo))).strip()


def achar_na_pagina(conta: dict, texto: str, texto_normal: str) -> tuple[bool, list[dict]]:
    """(a empresa aparece?, pessoas do comitê que aparecem). Conta com nome curto ou homônimo recorrente
    só vale por pessoa: num diretório com centenas de nomes, "Holmes" ou "Gera" casam à toa."""
    empresa = False
    if not nome_curto_demais(conta["nome"]) and conta.get("homonimos", 0) < HOMONIMOS_LIMITE:
        curto = len(conta["nome"].replace(" ", "")) <= 6
        alvo, onde = (conta["nome"], texto) if curto else (normalizar(conta["nome"]), texto_normal)
        empresa = re.search(r"\b" + re.escape(alvo) + r"\b", onde) is not None
    pessoas = [p for p in conta.get("comite", []) if len((p.get("nome") or "").split()) >= 2
               and any(re.search(r"\b" + re.escape(normalizar(n)) + r"\b", texto_normal) for n in variantes_nome(p["nome"]))]
    return empresa, pessoas


def sinal_de_evento(conta: dict, ev: dict, papel: str, url: str, hoje: date, pessoa: dict | None) -> dict:
    tipo = "palestra_lideranca" if pessoa else "presenca_evento"
    sufixo = f"-{hashlib.sha1(pessoa['nome'].encode()).hexdigest()[:6]}" if pessoa else f"-{papel}"
    if pessoa:
        sinal = f"{pessoa['nome'].split()[0]} palestra no {ev['nome']}"
        porque = f"{pessoa['nome']} ({pessoa.get('cargo') or 'comitê'}) está entre os palestrantes do {ev['nome']}, em {ev['cidade']}."
        abordar = {"nome": pessoa["nome"], "cargo": pessoa.get("cargo", ""), "papel": pessoa.get("papel", "influenciador")}
    else:
        sinal = f"{PAPEL_TEXTO.get(papel, 'Presente')} no {ev['nome']}"
        porque = f"Está entre as empresas {('expositoras' if papel == 'expositor' else 'patrocinadoras' if papel == 'patrocinador' else 'presentes')} do {ev['nome']}, em {ev['cidade']}."
        abordar = escolher_abordar(conta.get("comite", []))
    return {
        "id": f"{conta['id']}-evento-{ev['id']}{sufixo}", "contaId": conta["id"], "tipo": tipo, "rotulo": ROTULOS[tipo],
        "peso": PESOS[tipo], "sinal": sinal[:45], "porQueAgora": porque, "fonte": ev["nome"], "data": ev["inicio"],
        "alertaEm": hoje.isoformat(), "url": url, "exemplo": False, "abordar": abordar, "pontos": 0,
        "evento": {"id": ev["id"], "nome": ev["nome"], "inicio": ev["inicio"], "fim": ev["fim"], "cidade": ev["cidade"],
                   "uf": ev.get("uf", ""), "papel": "palestrante" if pessoa else papel},
        **({"pessoa": pessoa["nome"]} if pessoa else {}),
    }


def varrer_eventos(base: dict, config: dict, hoje: date, ids: set[str]) -> tuple[int, list[str], list[str]]:
    novos, sem_lista, erros = 0, [], []
    for ev in config["eventos"]:
        if date.fromisoformat(ev["fim"]) < hoje - timedelta(days=60):
            continue  # já passou da janela pós-evento
        for pagina in ev["paginas"]:
            texto = texto_da_pagina(pagina["url"])
            if not texto:
                erros.append(f"{ev['nome']}: {pagina['url']} não respondeu")
                continue
            texto_normal = normalizar(texto)
            achou_algo = False
            for conta in base["contas"]:
                empresa, pessoas = achar_na_pagina(conta, texto, texto_normal)
                candidatos = ([sinal_de_evento(conta, ev, pagina["papel"], pagina["url"], hoje, None)]
                              if empresa and pagina["papel"] != "palestrante" else [])
                candidatos += [sinal_de_evento(conta, ev, pagina["papel"], pagina["url"], hoje, p) for p in pessoas]
                for s in candidatos:
                    achou_algo = True
                    if s["id"] not in ids:
                        base["sinais"].append(s)
                        ids.add(s["id"])
                        novos += 1
            if not achou_algo:
                sem_lista.append(f"{ev['nome']} ({pagina['papel']})")
    return novos, sem_lista, erros


def buscar_palestras(base: dict, config: dict, hoje: date, max_pessoas: int, dormir: float) -> tuple[int, int, list[str]]:
    palavras = config.get("palavrasPalestra", [])
    conhecidos = set(base.get("descartados", []))
    conhecidos |= {s["url"] for s in base.get("sinais", [])}
    for c in base["contas"]:
        conhecidos |= {h["url"] for h in c.get("historico", [])}
    padrao_palco = re.compile(r"\b(" + "|".join(re.escape(normalizar(p)) for p in palavras) + r")\b")

    novos = buscas = 0
    erros: list[str] = []
    for conta in base["contas"]:
        comite = sorted(conta.get("comite", []), key=lambda p: p.get("papel") != "decisor")
        pessoas = [p for p in comite if len((p.get("nome") or "").split()) >= 2][:max_pessoas]
        for pessoa in pessoas:
            nomes = variantes_nome(pessoa["nome"])
            consulta = f'({" OR ".join(f"{chr(34)}{n}{chr(34)}" for n in nomes)}) ({" OR ".join(palavras)})'
            try:
                itens = parsear_itens(buscar_rss(consulta))
            except Exception as e:  # um nome com problema não derruba a rodada
                erros.append(f"{pessoa['nome']}: {e}")
                continue
            finally:
                buscas += 1
                time.sleep(dormir)
            padrao_nome = re.compile(r"\b(" + "|".join(re.escape(normalizar(n)) for n in nomes) + r")\b")
            empresa_normal = normalizar(conta["nome"])
            for it in itens:
                if it["link"] in conhecidos or (hoje - date.fromisoformat(it["data"])).days > JANELA_CAIXA_DIAS:
                    continue
                texto = normalizar(re.sub(r"<[^>]+>", " ", html.unescape(f'{it["titulo"]} {it["descricao"]}')))
                # nome da pessoa + empresa citada na mesma matéria. Só a palavra de palco não basta: no teste de
                # 2026-11-06, 18 de 19 menções sem a empresa eram homônimos (debates eleitorais, podcasts de outros)
                if not padrao_nome.search(texto) or empresa_normal not in texto:
                    continue
                conhecidos.add(it["link"])
                base["sinais"].append({
                    "id": f"{conta['id']}-palestra-{hashlib.sha1(it['link'].encode()).hexdigest()[:10]}",
                    "contaId": conta["id"], "tipo": "noticia_setorial", "rotulo": "Notícia", "peso": 0,
                    "porQueAgora": it["titulo"], "fonte": it["fonte"], "data": it["data"], "alertaEm": hoje.isoformat(),
                    "url": it["link"], "exemplo": False, "pontos": 0, "pessoa": pessoa["nome"],
                    "abordar": {"nome": pessoa["nome"], "cargo": pessoa.get("cargo", ""), "papel": pessoa.get("papel", "influenciador")},
                })
                novos += 1
    return novos, buscas, erros


def montar_agenda(base: dict, hoje: date) -> list[dict]:
    """Próximos AGENDA_DIAS dias: cada evento com as contas e pessoas que estarão lá (agenda presencial)."""
    eventos: dict[str, dict] = {}
    contas = {c["id"]: c for c in base["contas"]}
    for s in base.get("sinais", []):
        ev = s.get("evento")
        if not ev or not (hoje <= date.fromisoformat(ev["fim"]) and date.fromisoformat(ev["inicio"]) <= hoje + timedelta(days=AGENDA_DIAS)):
            continue
        item = eventos.setdefault(ev["id"], {**{k: ev[k] for k in ("id", "nome", "inicio", "fim", "cidade", "uf")}, "presencas": []})
        conta = contas.get(s["contaId"], {})
        item["presencas"].append({"contaId": s["contaId"], "conta": conta.get("nome", ""), "papel": ev["papel"],
                                  "pessoa": s.get("pessoa", ""), "cargo": s["abordar"].get("cargo", "") if s.get("pessoa") else "",
                                  "score": conta.get("score", 0)})
    agenda = sorted(eventos.values(), key=lambda e: e["inicio"])
    for e in agenda:
        e["presencas"].sort(key=lambda p: -p["score"])
    return agenda


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sem-pessoas", action="store_true", help="só a lista de eventos, sem a busca de palestras por pessoa")
    ap.add_argument("--max-pessoas", type=int, default=MAX_PESSOAS_POR_CONTA, help="pessoas buscadas por conta (decisores primeiro)")
    ap.add_argument("--dormir", type=float, default=0.4, help="segundos entre buscas no Google Notícias")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    config = json.loads(EVENTOS.read_text(encoding="utf-8"))
    hoje = date.today()
    ids = {s["id"] for s in base.get("sinais", [])}

    novos_ev, sem_lista, erros = varrer_eventos(base, config, hoje, ids)
    novos_pal = buscas = 0
    if not args.sem_pessoas:
        novos_pal, buscas, erros_pal = buscar_palestras(base, config, hoje, args.max_pessoas, args.dormir)
        erros += erros_pal
    base["agenda"] = montar_agenda(base, hoje)

    base["sinais"].sort(key=lambda s: (s["data"], s["pontos"]), reverse=True)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(config['eventos'])} eventos na lista · {novos_ev} presenças/palestras novas achadas nas páginas")
    if sem_lista:
        print(f"sem nenhuma conta nas páginas (diretório ainda não publicado?): {', '.join(sem_lista)}")
    if not args.sem_pessoas:
        print(f"{buscas} pessoas buscadas · {novos_pal} menções de palco novas (rode o classificador em seguida)")
    print(f"agenda presencial (próximos {AGENDA_DIAS} dias): {len(base['agenda'])} evento(s)")
    for e in erros[:10]:
        print(f"  - {e}")


if __name__ == "__main__":
    main()
