#!/usr/bin/env python3
"""Monta base["fontes"] (tela Fontes) a partir do que cada coletor de fato trouxe para a base.

uso: chamado pelo score_v2.py --exibir (último passo do pipeline); também roda sozinho:
     python3 scripts/registrar_fontes.py

Cada coletor é reconhecido pelo rastro que deixa no sinal (inbox e histórico das contas): URL do Google News,
página de carreiras, Indeed, evento da agenda ou feed RSS de veículo. A última coleta é o último dia em que a
fonte trouxe algo; "Precisa de atenção" quando passou do dobro do intervalo sem trazer nada.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"

FONTES = [
    {"id": "google-news", "nome": "Notícias (Google News)", "intervalo": 1,
     "busca": "Contratação de liderança, investimento, expansão, aquisição, lançamento — pelo nome de cada conta e das pessoas do comitê",
     "onde": "Google News, em português, últimos 30 dias (scripts/coletar_noticias.py)"},
    {"id": "veiculos", "nome": "Veículos de TI (RSS)", "intervalo": 1,
     "busca": "Matérias que citam a conta ou alguém do comitê mudando de cargo",
     "onde": "11 feeds de imprensa de TI e negócios (scripts/coletar_veiculos.py)"},
    {"id": "carreiras", "nome": "Páginas de carreira", "intervalo": 7,
     "busca": "Vagas de gerente pra cima em Growth, Revenue, vendas e marketing; volume de vagas na área comercial",
     "onde": "Gupy, Solides, Kenoby, InHire e a página de vagas do site de cada conta (scripts/coletar_vagas.py)"},
    {"id": "indeed", "nome": "Indeed", "intervalo": 7,
     "busca": "Vagas abertas pelas contas da base, pelo nome da empresa (só contas da lista entram)",
     "onde": "Conector do Indeed no Claude; o resultado entra por scripts/importar_vagas.py"},
    {"id": "eventos", "nome": "Eventos e palestras", "intervalo": 7,
     "busca": "Contas expondo, patrocinando ou com alguém do comitê no palco nos próximos 60 dias",
     "onde": "South Summit, Gramado Summit, Futurecom, Startup Summit (data/eventos.json)"},
]
EXTERNAS = [
    {"id": "receita", "nome": "CNPJ e Receita Federal", "intervalo": 30,
     "busca": "CNPJ no rodapé e nas páginas legais do site; UF, cidade, porte e CNAE na Receita",
     "onde": "Site da conta + BrasilAPI (scripts/coletar_cnpj.py)"},
    {"id": "apollo", "nome": "Apollo", "intervalo": 7, "status": "erro",
     "busca": "Vagas ativas, rodadas e crescimento de equipe das contas; pessoas do comitê (consultas gratuitas)",
     "onde": "Conector do Apollo no Claude",
     "resumo": "Bloqueado: o Apollo recusa até as consultas gratuitas por pendência de pagamento na conta. Regularize "
               "a cobrança no Apollo para ligar."},
    {"id": "lusha", "nome": "Lusha", "intervalo": 30, "status": "atencao",
     "busca": "Contato verificado de decisores (só sob demanda)",
     "onde": "Conector do Lusha no Claude", "custo": "Plano gratuito: 40 créditos; nenhum usado sem confirmação",
     "resumo": "Ligado, mas só usado a pedido: cada consulta gasta crédito."},
]


def coletor(ev: dict) -> str | None:
    url = ev.get("url") or ""
    if ev.get("fonte") == "Indeed":
        return "indeed"
    if ev.get("fonte") == "Página de carreiras":
        return "carreiras"
    if ev.get("evento") or ev.get("tipo") == "presenca_evento":
        return "eventos"
    if "news.google.com" in url:
        return "google-news"
    if url.startswith("http"):
        return "veiculos"
    return None


def registrar(base: dict, hoje: date) -> list[dict]:
    eventos = [s for s in base.get("sinais", []) if not s.get("exemplo")]
    eventos += [h for c in base["contas"] for h in c.get("historico", []) if not h.get("exemplo")]
    por: dict[str, list[dict]] = {}
    for ev in eventos:
        k = coletor(ev)
        if k:
            por.setdefault(k, []).append(ev)
    fontes = []
    for f in FONTES:
        itens = por.get(f["id"], [])
        datas = sorted({e["alertaEm"][:10] for e in itens if e.get("alertaEm")})  # dias em que a coleta rodou e trouxe algo
        ultima = datas[-1] if datas else max((e["data"][:10] for e in itens), default="")
        atraso = (hoje - date.fromisoformat(ultima)).days if ultima else None
        status = "ok" if atraso is not None and atraso <= 2 * f["intervalo"] else "atencao"
        resumo = (f"{len(itens)} sinais reais na base; o último chegou {'hoje' if atraso == 0 else f'há {atraso} dias'}."
                  if itens else "Ainda não trouxe nenhum sinal para a base.")
        if f["id"] == "eventos" and not itens and base.get("agenda"):
            presencas = sum(len(e["presencas"]) for e in base["agenda"])
            status, ultima = "ok", base.get("geradoEm", "")[:10]
            resumo = (f"{presencas} presenças de contas da base em {len(base['agenda'])} eventos dos próximos 60 dias "
                      f"(ficam na Agenda de Hoje; viram sinal quando o evento chega).")
            itens = []
        elif f["id"] == "eventos" and not itens:
            resumo = ("Nenhuma conta da base confirmada nos eventos dos próximos 60 dias. O calendário (data/eventos.json) "
                      "começa em abril/2027 com o South Summit; rodar scripts/coletar_eventos.py quando as listas de expositores saírem.")
        if status == "atencao" and itens:
            resumo += f" Passou de {2 * f['intervalo']} dias sem novidade: rodar a coleta de novo."
        fontes.append({"id": f["id"], "nome": f["nome"], "busca": f["busca"], "onde": f["onde"],
                       "intervaloDias": f["intervalo"], "requisito": "", "status": status, "resumo": resumo,
                       "ultimaColeta": ultima, "itensUltima": sum(1 for e in itens if (e.get("alertaEm") or e["data"])[:10] == ultima),
                       "errosUltima": 0, "execucoes": len(datas), "sinais": len(itens), "custo": ""})
    com_cnpj = sum(1 for c in base["contas"] if c.get("cnpj"))
    for f in EXTERNAS:
        item = {"id": f["id"], "nome": f["nome"], "busca": f["busca"], "onde": f["onde"], "intervaloDias": f["intervalo"],
                "requisito": "", "status": f.get("status", "ok"), "resumo": f.get("resumo", ""), "ultimaColeta": "",
                "itensUltima": 0, "errosUltima": 0, "execucoes": 0, "sinais": 0, "custo": f.get("custo", "")}
        if f["id"] == "receita":
            item["resumo"] = f"{com_cnpj} de {len(base['contas'])} contas com CNPJ confirmado na Receita."
            item["sinais"] = com_cnpj
            item["ultimaColeta"] = base.get("geradoEm", "")[:10]
            item["status"] = "ok" if com_cnpj else "atencao"
        fontes.append(item)
    return fontes


def main() -> None:
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    base["fontes"] = registrar(base, date.today())
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in base["fontes"]:
        print(f'{f["nome"]}: {f["status"]} · {f["sinais"]} · {f["ultimaColeta"]}')


if __name__ == "__main__":
    main()
