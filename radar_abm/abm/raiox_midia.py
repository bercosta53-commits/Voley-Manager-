"""Raio-x de mídia da conta: um diagnóstico curto, refeito a cada coleta de anúncios.

É o gancho da abordagem: a Velora chega com o diagnóstico pronto, não com um pitch. Diz:
- canais ativos e há quanto tempo;
- volume de criativos e a variação em 4 semanas;
- mensagens e ofertas principais;
- para onde os anúncios levam (home, landing page dedicada, formulário, WhatsApp);
- observações de maturidade ("todos os anúncios levam para a home", "um único criativo há 4 meses",
  "sem anúncio para público empresarial").
LinkedIn não é coletado (regra de não raspar o LinkedIn): o raio-x traz o link da biblioteca para consulta manual.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, timedelta
from urllib.parse import quote

from .db import agora
from .identidade import sem_acentos

NOMES = {"google": "Google", "meta": "Meta"}
PALAVRAS_B2B = ("empresa", "empresas", "pj", "cnpj", "negocio", "negocios", "b2b", "corporativo")
PARADAS = set("a o e de da do das dos para com sem por em no na nos nas um uma que se seu sua seus suas mais voce "
              "ao aos como ja nao ate sobre agora hoje aqui ou".split())


def link_linkedin(nome: str) -> str:
    """Biblioteca de anúncios do LinkedIn, para consulta manual (nunca coletada)."""
    return f"https://www.linkedin.com/ad-library/search?accountOwner={quote(nome or '')}"


def _meses(de: str, ate: date) -> str:
    dias = (ate - date.fromisoformat(de)).days
    if dias < 45:
        return f"há {max(1, dias // 7)} semana(s)"
    return f"há {round(dias / 30)} meses"


def _temas(textos: list[str], n: int = 4) -> list[str]:
    """Os termos que mais se repetem nos anúncios ativos (para "mensagens e ofertas principais")."""
    contagem: Counter = Counter()
    for t in textos:
        palavras = [p for p in re.sub(r"[^a-z0-9 ]", " ", sem_acentos(t).lower()).split() if len(p) > 3 and p not in PARADAS]
        contagem.update(set(palavras))
    return [p for p, c in contagem.most_common(n) if c >= 2]


def montar(conta, anuncios: list[dict], foto: dict | None, hoje: date) -> dict:
    from .conectores.anuncios import classificar_destino

    ativos = [a for a in anuncios if a["ativo"]]
    estado = (foto or {}).get("estado") or {}
    linhas, obs = [], []

    # canais
    canais = []
    for p in ("google", "meta"):
        n = sum(1 for a in ativos if a["plataforma"] == p)
        if n:
            desde = estado.get(p, {}).get("ativo_desde")
            canais.append(f"{NOMES[p]} ({n} criativo(s) ativo(s){', ' + _meses(desde, hoje) if desde else ''})")
        elif estado.get(p, {}).get("ultimo_ativo"):
            canais.append(f"{NOMES[p]} parado desde {estado[p]['ultimo_ativo']}")
    linhas.append("Canais: " + ("; ".join(canais) if canais else "nenhum anúncio ativo no Google nem no Meta") + ".")

    # volume e variação em 4 semanas
    hist = (foto or {}).get("historico") or []
    if len(hist) >= 2:
        alvo = hoje - timedelta(days=28)
        base = min(hist[:-1], key=lambda h: abs((date.fromisoformat(h["semana"]) - alvo).days))
        antes = sum(v for k, v in base.items() if k != "semana")
        agora_ = sum(v for k, v in hist[-1].items() if k != "semana")
        if antes:
            linhas.append(f"Volume: {agora_} criativo(s) ativo(s), {((agora_ - antes) / antes):+.0%} desde {base['semana']}.")
        else:
            linhas.append(f"Volume: {agora_} criativo(s) ativo(s).")
    else:
        linhas.append(f"Volume: {len(ativos)} criativo(s) ativo(s) (primeira leitura).")

    # mensagens
    textos = [a["texto"] for a in ativos if a["texto"]]
    temas = _temas(textos)
    ctas = [c for c, _ in Counter(a["cta"] for a in ativos if a["cta"]).most_common(3)]
    if temas or ctas:
        linhas.append("Mensagens: " + (f"temas que se repetem: {', '.join(temas)}" if temas else "sem tema repetido")
                      + (f"; chamadas: {', '.join(ctas)}" if ctas else "") + ".")

    # destinos
    tipos = Counter(classificar_destino(a["url_destino"], conta["dominio"])[0] for a in ativos if a["url_destino"])
    rotulos = {"home": "home", "lp_dedicada": "página dedicada", "subdominio": "subdomínio", "ferramenta_lp": "ferramenta de LP",
               "formulario": "formulário", "whatsapp": "WhatsApp", "app": "loja de app", "rede_social": "rede social",
               "outro": "outro site", "desconhecido": "sem destino"}
    if tipos:
        total = sum(tipos.values())
        linhas.append("Destinos: " + ", ".join(f"{rotulos[t]} {round(100 * n / total)}%" for t, n in tipos.most_common()) + ".")

    # maturidade
    if ativos and tipos and set(tipos) == {"home"}:
        obs.append("todos os anúncios levam para a home: não há página dedicada para converter")
    longos = [a for a in ativos if a["inicio"] and (hoje - date.fromisoformat(a["inicio"])).days >= 120]
    if len(ativos) == 1 and longos:
        obs.append(f"um único criativo rodando {_meses(longos[0]['inicio'], hoje).replace('há ', 'há ')}")
    elif ativos and len(longos) == len(ativos) and len(ativos) <= 3:
        obs.append("os mesmos poucos criativos rodam há mais de 4 meses: sem teste de mensagem")
    if ativos and not any(p in " " + re.sub(r"[^a-z0-9 ]", " ", sem_acentos(t).lower()) + " "
                          for t in textos for p in (f" {x} " for x in PALAVRAS_B2B)):
        obs.append("sem anúncio para público empresarial")
    if tipos.get("whatsapp") and tipos["whatsapp"] == sum(tipos.values()):
        obs.append("todo o tráfego vai para o WhatsApp: a conversão depende do atendimento manual")
    canais_ativos = {a["plataforma"] for a in ativos}
    if len(canais_ativos) == 1:
        obs.append(f"só anuncia no {NOMES[next(iter(canais_ativos))]}")
    if obs:
        linhas.append("Observações: " + "; ".join(obs) + ".")
    linhas.append(f"LinkedIn (consulta manual): {link_linkedin(conta['nome_fantasia'])}")
    return {"texto": "\n".join(linhas), "canais": sorted(canais_ativos), "ativos": len(ativos), "temas": temas,
            "destinos": dict(tipos), "observacoes": obs, "linkedin": link_linkedin(conta["nome_fantasia"])}


def gerar_raiox(conn, conta_id: str, hoje: date, foto: dict | None = None) -> dict:
    conta = conn.execute("select * from contas where id = ?", (conta_id,)).fetchone()
    anuncios = [dict(r) for r in conn.execute("select * from anuncios where conta_id = ?", (conta_id,))]
    if foto is None:
        r = conn.execute("select conteudo_json from snapshots where conta_id = ? and conector = 'anuncios' order by data desc limit 1",
                         (conta_id,)).fetchone()
        foto = json.loads(r["conteudo_json"]) if r else None
    rx = montar(conta, anuncios, foto, hoje)
    conn.execute("""insert into raiox_midia (conta_id, gerado_em, texto, dados_json) values (?, ?, ?, ?)
                    on conflict (conta_id) do update set gerado_em = excluded.gerado_em, texto = excluded.texto,
                    dados_json = excluded.dados_json""",
                 (conta_id, agora(), rx["texto"], json.dumps(rx, ensure_ascii=False)))
    return rx
