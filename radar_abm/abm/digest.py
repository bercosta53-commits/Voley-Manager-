"""Digest semanal: as contas que mais esquentaram na semana, com cada sinal explicado e pronto para agir.

"Esquentou" = score de hoje menos o score de 7 dias atrás (calculado só com os sinais que já existiam
naquela data). Para cada sinal novo da semana: evidência (link + trecho), por que agora, quem abordar
(as pessoas do comitê no papel que o sinal acorda), ângulo sugerido e o ID para dar feedback.
"""

from __future__ import annotations

import html
from datetime import date, timedelta
from pathlib import Path

from .score import pontuar, valor
from .taxonomia import Taxonomia

BRACOS = {"servicos_profissionais": "Serviços profissionais", "servicos_financeiros": "Serviços financeiros",
          "tecnologia": "Tecnologia B2B"}
ORIGEM = {"cnpj": "Receita Federal (BrasilAPI)", "apollo": "Apollo", "regras": "Notícia (regras)", "vagas": "Vagas (Gupy ou Indeed)"}


def _origem(classificador: str | None) -> str:
    if not classificador:
        return "-"
    return "Notícia (Claude)" if classificador.startswith("claude") else ORIGEM.get(classificador, classificador)


def montar(conn, taxonomia: Taxonomia, hoje: date | None = None, top: int = 15) -> dict:
    hoje = hoje or date.today()
    inicio = hoje - timedelta(days=7)
    agora_ = {c.conta_id: c for c in pontuar(conn, taxonomia, hoje=hoje)}
    antes = {c.conta_id: c.score for c in pontuar(conn, taxonomia, hoje=inicio, ate=inicio)}
    contas = []
    for cid, c in agora_.items():
        delta = round(c.score - antes.get(cid, 0.0), 2)
        if delta <= 0:
            continue
        sinais = []
        for s in conn.execute(
            """select * from sinais where conta_id = ? and status = 'alerta' and substr(data_alerta, 1, 10) > ?
               order by data_alerta desc""", (cid, inicio.isoformat())
        ):
            tipo = taxonomia.tipo(s["tipo"], c.braco_icp)
            fato = date.fromisoformat(s["data_fato"][:10]) if s["data_fato"] else hoje
            v = valor(tipo.peso if tipo else (s["peso"] or 1), s["confianca"] or 0, (hoje - fato).days,
                      tipo.meia_vida_dias if tipo else 90)
            membro = s["membro_comite"] or (tipo.membro_comite if tipo else "decisor")
            pessoas = conn.execute("select nome, cargo from pessoas where conta_id = ? and papel_comite = ? order by nome",
                                   (cid, membro)).fetchall()
            substituto = None
            if not pessoas and membro != "decisor":
                pessoas = conn.execute("select nome, cargo from pessoas where conta_id = ? and papel_comite = 'decisor'",
                                       (cid,)).fetchall()
                substituto = "decisor" if pessoas else None
            sinais.append({
                "id": s["id"], "tipo": tipo.rotulo if tipo else s["tipo"], "valor": round(v, 2),
                "confianca": s["confianca"], "data_fato": s["data_fato"], "por_que_agora": s["por_que_agora"],
                "evidencia": s["evidencia_trecho"], "url": s["evidencia_url"], "origem": _origem(s["classificador"]),
                "membro": membro, "pessoas": [(p["nome"], p["cargo"]) for p in pessoas], "substituto": substituto,
                "angulo": s["angulo"] or (tipo.angulo_sugerido if tipo else ""),
            })
        sinais.sort(key=lambda x: -x["valor"])
        conta = conn.execute("select * from contas where id = ?", (cid,)).fetchone()
        contas.append({"id": cid, "nome": c.nome, "tier": c.tier, "braco": c.braco_icp, "cidade": conta["cidade"],
                       "uf": conta["uf"], "score": c.score, "delta": delta, "sinais": sinais})
    contas.sort(key=lambda c: -c["delta"])
    revisar = conn.execute(
        """select s.id, s.tipo, s.confianca, s.evidencia_trecho, c.nome_fantasia from sinais s
           join contas c on c.id = s.conta_id where s.status = 'revisar' order by s.confianca desc, s.data_alerta desc"""
    ).fetchall()
    execucoes = conn.execute(
        """select conector, count(*) as rodadas, sum(itens) as itens, sum(erros) as erros from execucoes
           where substr(inicio, 1, 10) > ? group by conector order by conector""", (inicio.isoformat(),)
    ).fetchall()
    return {"hoje": hoje, "inicio": inicio, "contas": contas[:top], "total_esquentaram": len(contas),
            "revisar": revisar, "execucoes": execucoes}


def _e(texto) -> str:
    return html.escape(str(texto if texto is not None else ""))


def _link(url: str | None) -> str:
    if not url or not url.startswith(("http://", "https://")):
        return ""
    return f'<a href="{_e(url)}" target="_blank" rel="noopener">abrir a fonte ↗</a>'


CSS = """
:root{--ink:#0B0B0C;--acid:#CCFF00;--bone:#F2F0EA;--paper:#FFFFFF;--line:#D9D6CE;--muted:#5C5B57}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--paper:#0B0B0C;--ink:#F2F0EA;--bone:#1A1A1C;--line:#2B2B2E;--muted:#A3A19B}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Manrope,system-ui,sans-serif}
main{max-width:920px;margin:0 auto;padding:40px 16px 64px}
h1,h2,h3{font-family:"Space Grotesk",system-ui,sans-serif;letter-spacing:-.01em;margin:0}
h1{font-size:30px}h2{font-size:20px;margin:40px 0 12px;padding-left:12px;border-left:4px solid var(--acid)}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12.5px}
.sub{color:var(--muted);margin-top:6px}
.resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:24px}
.resumo div{background:var(--bone);padding:14px 16px}.resumo b{display:block;font:600 26px "Space Grotesk",sans-serif}
.conta{border:1px solid var(--line);margin-top:16px}
.cab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--line)}
.delta{background:var(--acid);color:#0B0B0C;font:600 15px "JetBrains Mono",monospace;padding:4px 10px;white-space:nowrap}
.sinal{padding:14px 16px;border-top:1px solid var(--line)}.sinal:first-of-type{border-top:0}
.linha{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.tipo{font-weight:700}
.porque{margin:8px 0 6px;font-size:16px}
blockquote{margin:6px 0;padding:6px 12px;border-left:2px solid var(--line);color:var(--muted)}
.quem{margin-top:6px}.angulo{margin-top:4px;color:var(--muted)}
a{color:inherit;text-decoration-thickness:2px;text-decoration-color:var(--acid)}
table{width:100%;border-collapse:collapse;margin-top:8px}td,th{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:600 12px "JetBrains Mono",monospace;text-transform:uppercase;color:var(--muted)}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted)}
code{font-family:"JetBrains Mono",monospace;background:var(--bone);padding:1px 5px;overflow-wrap:anywhere}
.sub,.mono,blockquote,td{overflow-wrap:anywhere}.tabela{overflow-x:auto}
"""


def html_digest(d: dict) -> str:
    partes = [f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Radar Velora: semana de {d['hoje'].strftime('%d/%m/%Y')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><main>
<h1>Radar Velora: contas que esquentaram</h1>
<p class="sub">Semana de {d['inicio'].strftime('%d/%m')} a {d['hoje'].strftime('%d/%m/%Y')}. Esquentar = score de hoje menos o de 7 dias atrás.</p>
<div class="resumo"><div><b>{d['total_esquentaram']}</b>contas esquentaram</div>
<div><b>{sum(len(c['sinais']) for c in d['contas'])}</b>sinais novos em alerta</div>
<div><b>{len(d['revisar'])}</b>sinais esperando revisão</div></div>
<h2>Contas que mais esquentaram</h2>"""]
    if not d["contas"]:
        partes.append('<p class="sub">Nenhuma conta esquentou nesta semana.</p>')
    for c in d["contas"]:
        local = ", ".join(filter(None, [c["cidade"], c["uf"]]))
        partes.append(f"""<section class="conta"><div class="cab"><div><h3>{_e(c['nome'])}</h3>
<div class="sub mono">{_e(c['id'])} · tier {_e(c['tier'] or '-')} · {_e(BRACOS.get(c['braco'], c['braco'] or '-'))}{' · ' + _e(local) if local else ''} · score {c['score']:.2f}</div></div>
<span class="delta">+{c['delta']:.2f} na semana</span></div>""")
        for s in c["sinais"]:
            quem = "; ".join(f"{_e(n)} ({_e(cg)})" if cg else _e(n) for n, cg in s["pessoas"]) or "comitê não mapeado: identificar quem ocupa o papel"
            partes.append(f"""<div class="sinal"><div class="linha"><span class="tipo">{_e(s['tipo'])}</span>
<span class="mono">vale {s['valor']:.2f} · confiança {s['confianca'] or 0:.2f} · fato {_e(s['data_fato'] or '-')} · {_e(s['origem'])}</span></div>
<p class="porque"><b>Por que agora:</b> {_e(s['por_que_agora'] or '-')}</p>
<blockquote>“{_e(s['evidencia'])}” {_link(s['url'])}</blockquote>
<div class="quem"><b>Quem abordar ({_e(s['membro'])}):</b> {quem}{' <span class="sub">(nenhum ' + _e(s['membro']) + ' mapeado; indo pelo decisor)</span>' if s['substituto'] else ''}</div>
<div class="angulo"><b>Ângulo:</b> {_e(s['angulo'])}</div>
<div class="mono sub">ID do sinal: {_e(s['id'])} · <code>python manager.py feedback {_e(s['id'])} util</code> ou <code>ruido</code></div></div>""")
        partes.append("</section>")
    partes.append("<h2>Esperando revisão</h2>")
    if d["revisar"]:
        partes.append("<div class='tabela'><table><tr><th>ID</th><th>Conta</th><th>Tipo</th><th>Conf.</th><th>Evidência</th></tr>")
        for r in d["revisar"][:20]:
            partes.append(f"<tr><td class='mono'>{_e(r['id'])}</td><td>{_e(r['nome_fantasia'])}</td><td>{_e(r['tipo'])}</td>"
                          f"<td class='mono'>{r['confianca'] or 0:.2f}</td><td>{_e((r['evidencia_trecho'] or '')[:140])}</td></tr>")
        partes.append("</table></div><p class='sub'>Aprovar: <code>python manager.py feedback &lt;id&gt; util</code> · "
                      "descartar: <code>python manager.py feedback &lt;id&gt; ruido</code></p>")
    else:
        partes.append('<p class="sub">Nada para revisar.</p>')
    partes.append("<h2>Saúde da coleta na semana</h2>")
    if d["execucoes"]:
        partes.append("<table><tr><th>Conector</th><th>Rodadas</th><th>Itens</th><th>Erros</th></tr>")
        for e in d["execucoes"]:
            partes.append(f"<tr><td>{_e(e['conector'])}</td><td class='mono'>{e['rodadas']}</td><td class='mono'>{e['itens'] or 0}</td>"
                          f"<td class='mono'>{e['erros'] or 0}</td></tr>")
        partes.append("</table><p class='sub'>Detalhes dos erros: <code>python manager.py execucoes</code></p>")
    else:
        partes.append('<p class="sub">Nenhuma coleta registrada nesta semana.</p>')
    partes.append("<footer>Gerado pelo Radar de Sinais Velora. Feedback em cada sinal melhora as métricas de precisão "
                  "(<code>python manager.py metricas</code>).</footer></main></body></html>")
    return "\n".join(partes)


def gerar(conn, taxonomia: Taxonomia, destino: str | Path, hoje: date | None = None, top: int = 15) -> dict:
    d = montar(conn, taxonomia, hoje, top)
    Path(destino).parent.mkdir(parents=True, exist_ok=True)
    Path(destino).write_text(html_digest(d), encoding="utf-8")
    return d
