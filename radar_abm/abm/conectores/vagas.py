"""Conector de vagas: quem está contratando marketing, growth, RevOps ou comercial.

1. BUSCA    Duas fontes:
            a) Gupy: a página de carreiras da conta (https://<slug>.gupy.io), pública e sem chave. Na primeira
               vez o conector descobre o endereço sozinho (pelo site e pelo nome da conta) e confere se a página
               é mesmo da empresa; o endereço fica gravado na conta. Conta que não usa Gupy só é procurada de
               novo depois de 30 dias.
            b) Arquivo de vagas (CSV) trazido de outras fontes, como o Indeed pelo conector do Claude
               (veja VAGAS_ROTINA.md). O Indeed não tem API aberta para programas como este, por isso o
               arquivo. LinkedIn não é usado.
2. TRADUZ   De cada vaga: título, local, modo (remoto, híbrido), fonte, link e data (quando a fonte informa).
3. COMPARA  Mantém só vagas da empresa certa e dos grupos que interessam, pelas regras do sinais.yaml:
            liderança de receita, marketing/growth/RevOps e comercial. Descarta banco de talentos, estágio e
            as vagas que já estavam abertas na coleta anterior. Vagas novas do mesmo grupo viram um item só.
4. ENTREGA  Cada vaga nova vira item bruto (evidência com link). Cada grupo vira um sinal (confiança 0,9 na
            Gupy e no arquivo com id da conta; 0,7 quando a conta foi reconhecida só pelo nome da empresa).
            Se já houver sinal do mesmo grupo nos últimos 30 dias, a vaga entra no mesmo evento e não gera
            sinal novo.
"""

from __future__ import annotations

import csv
import html as html_lib
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from .. import taxonomia as taxonomia_mod
from ..db import agora, novo_id
from ..identidade import normalizar_dominio, normalizar_nome, sem_acentos
from .base import Conector, Item
from .http import ErroHTTP

GUPY = "https://{slug}.gupy.io/"
REPROCURAR_DIAS = 30
MESMO_EVENTO_DIAS = 30
GRUPOS = ("vaga_lideranca_receita", "vaga_marketing_growth", "vaga_comercial")
POR_QUE_AGORA = {
    "vaga_lideranca_receita": "Está contratando uma liderança de receita ({titulos}): quem chega vai redesenhar a área e escolher parceiros nos primeiros meses.",
    "vaga_marketing_growth": "Está montando o time de marketing/growth ({titulos}): a operação está sendo desenhada agora.",
    "vaga_comercial": "Está ampliando o time comercial ({titulos}): mais gente vendendo precisa de demanda e processo desde já.",
}

_MESES = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}
_MESES.update({m: i for i, m in enumerate(["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto",
                                           "setembro", "outubro", "novembro", "dezembro"], 1)})


def _norm(texto: str) -> str:
    return re.sub(r"\s+", " ", sem_acentos(texto or "").lower()).strip()


def _tem(texto_norm: str, termo: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(_norm(termo))}(?![a-z0-9])", texto_norm))


def grupo_da_vaga(titulo: str, regras) -> str | None:
    """Em que grupo a vaga entra, pelas regras do sinais.yaml; None se não interessa."""
    t = _norm(titulo)
    if any(_tem(t, x) for x in regras.ignorar):
        return None
    area = any(_tem(t, x) for x in regras.areas)
    comercial = any(_tem(t, x) for x in regras.comercial)
    lider = any(_tem(t, x) for x in regras.lideranca)
    if lider and (area or comercial):
        return "vaga_lideranca_receita"
    if area:
        return "vaga_marketing_growth"
    if comercial:
        return "vaga_comercial"
    return None


def ler_data(texto: str | None) -> str | None:
    """'2026-09-15', '15/09/2026' ou 'September 15, 2026' -> '2026-09-15'."""
    t = (texto or "").strip()
    if not t:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(t[:10], fmt).date().isoformat()
        except ValueError:
            pass
    m = re.match(r"([A-Za-zçÇ]+)\s+(\d{1,2}),?\s+(\d{4})", sem_acentos(t))
    if m and m.group(1).lower() in _MESES:
        return date(int(m.group(3)), _MESES[m.group(1).lower()], int(m.group(2))).isoformat()
    return None


# ------------------------------------------------------------------------------------------ Gupy

def ler_pagina_gupy(conteudo: str, base: str) -> dict:
    """Nome da empresa e vagas de uma página de carreiras da Gupy.

    Tenta primeiro os dados estruturados da página (bloco __NEXT_DATA__); se não houver, lê os links /jobs/<id>.
    """
    titulo = re.search(r"<title[^>]*>(.*?)</title>", conteudo, re.S | re.I)
    empresa = html_lib.unescape(titulo.group(1)).strip() if titulo else ""
    vagas: dict[str, dict] = {}

    dados = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', conteudo, re.S)
    if dados:
        try:
            for v in _vagas_no_json(json.loads(dados.group(1))):
                vagas[str(v["id"])] = v
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
    if not vagas:
        for m in re.finditer(r'<a[^>]+href="((?:https://[a-z0-9-]+\.gupy\.io)?/jobs/(\d+)[^"]*)"[^>]*>(.*?)</a>', conteudo, re.S | re.I):
            href, jid, dentro = m.groups()
            cabecalho = re.search(r"<h[1-6][^>]*>(.*?)</h[1-6]>", dentro, re.S | re.I)
            partes = [html_lib.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.split(r"</(?:div|span|h\d|p)>", dentro)]
            partes = [p for p in partes if p]
            nome = html_lib.unescape(re.sub(r"<[^>]+>", "", cabecalho.group(1))).strip() if cabecalho else (partes[0] if partes else "")
            resto = [p for p in partes if p != nome]
            url = href if href.startswith("http") else base.rstrip("/") + href
            vagas[jid] = {"id": jid, "titulo": nome, "local": resto[0] if resto else "", "tipo": resto[1] if len(resto) > 1 else "",
                          "url": url.split("?")[0], "data": None}
    return {"empresa": empresa, "vagas": list(vagas.values())}


def _vagas_no_json(no) -> list[dict]:
    """Procura, em qualquer nível do JSON da página, listas de vagas (objetos com id e title/name)."""
    achadas: list[dict] = []
    if isinstance(no, list):
        if no and all(isinstance(x, dict) and "id" in x and ("title" in x or "name" in x) for x in no):
            for x in no:
                endereco = (x.get("workplace") or {}).get("address") or {}
                cidade = x.get("addressCity") or x.get("city") or endereco.get("city") or ""
                uf = x.get("addressState") or x.get("state") or endereco.get("stateShortName") or endereco.get("state") or ""
                achadas.append({
                    "id": str(x["id"]), "titulo": (x.get("title") or x.get("name") or "").strip(),
                    "local": " - ".join(p for p in (cidade, uf) if p),
                    "tipo": x.get("workplaceType") or (x.get("workplace") or {}).get("workplaceType") or x.get("type") or "",
                    "url": x.get("jobUrl") or x.get("url") or "",
                    "data": ler_data(x.get("publishedDate") or x.get("publishedAt") or x.get("published_date")),
                })
            return achadas
        for x in no:
            achadas += _vagas_no_json(x)
    elif isinstance(no, dict):
        for x in no.values():
            achadas += _vagas_no_json(x)
    return achadas


def candidatos_slug(conta) -> list[str]:
    candidatos = []
    dominio = normalizar_dominio(conta["dominio"] or "")
    if dominio:
        candidatos.append(dominio.split(".")[0])
    nome = re.sub(r"[^a-z0-9]", "", _norm(conta["nome_fantasia"]))
    if nome:
        candidatos.append(nome)
    hifen = re.sub(r"[^a-z0-9]+", "-", _norm(conta["nome_fantasia"])).strip("-")
    if hifen and "-" in hifen:
        candidatos.append(hifen)
    return list(dict.fromkeys(c for c in candidatos if len(c) >= 3))[:3]


# ------------------------------------------------------------------------------------------ arquivo

def ler_arquivo(caminho: str | Path) -> list[dict]:
    """CSV de vagas: id_conta (opcional), empresa, titulo, url, fonte, data, local."""
    texto = Path(caminho).read_text(encoding="utf-8-sig")
    delim = ";" if texto.split("\n", 1)[0].count(";") > texto.split("\n", 1)[0].count(",") else ","
    linhas = []
    for r in csv.DictReader(texto.splitlines(), delimiter=delim):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        if not r.get("titulo"):
            continue
        linhas.append({
            "conta_id": r.get("id_conta") or r.get("conta_id") or "", "empresa": r.get("empresa", ""),
            "titulo": r["titulo"], "url": r.get("url", ""), "fonte": r.get("fonte") or "arquivo",
            "data": ler_data(r.get("data")), "local": r.get("local", ""),
            "id": r.get("id") or re.sub(r"\W+", "", r.get("url", ""))[-40:] or normalizar_nome(r["titulo"]),
        })
    return linhas


# ------------------------------------------------------------------------------------------ conector

class ConectorVagas(Conector):
    nome = "vagas"
    descricao = "Vagas de marketing, growth e comercial (Gupy e arquivo)"

    def __init__(self, *args, hoje: date | None = None, usar_gupy: bool = True, arquivo: list[dict] | None = None,
                 taxonomia=None, **kw):
        super().__init__(*args, **kw)
        self.hoje = hoje or date.today()
        self.usar_gupy = usar_gupy
        self.tax = taxonomia or taxonomia_mod.carregar()
        self.importadas: dict[str, list[dict]] = {}
        self.sem_conta: list[dict] = []
        if arquivo:
            self._distribuir(arquivo)
        self._slug_achado: str | None = None
        self._atual: dict | None = None

    def _nomes_da_conta(self, conta_id: str) -> set[str]:
        nomes = {normalizar_nome(r["termo"]) for r in self.conn.execute(
            "select termo from aliases where conta_id = ? and ativo", (conta_id,))}
        c = self.conn.execute("select nome_fantasia, razao_social from contas where id = ?", (conta_id,)).fetchone()
        if c:
            nomes |= {normalizar_nome(c["nome_fantasia"]), normalizar_nome(c["razao_social"] or "")}
        return {n for n in nomes if len(n) >= 3}

    def _mesma_empresa(self, empresa: str, conta_id: str) -> bool:
        e = normalizar_nome(empresa)
        return bool(e) and any(n == e or n in e or e in n for n in self._nomes_da_conta(conta_id))

    def _distribuir(self, linhas: list[dict]) -> None:
        """Liga cada linha do arquivo a uma conta: pelo id_conta (conferindo a empresa) ou pelo nome da empresa."""
        contas = [r["id"] for r in self.conn.execute("select id from contas")]
        for v in linhas:
            if v["conta_id"]:
                if v["empresa"] and not self._mesma_empresa(v["empresa"], v["conta_id"]):
                    self.sem_conta.append({**v, "motivo": f"empresa '{v['empresa']}' não é a conta {v['conta_id']}"})
                    continue
                v["confianca"] = 0.9
                self.importadas.setdefault(v["conta_id"], []).append(v)
                continue
            donas = [c for c in contas if self._mesma_empresa(v["empresa"], c)]
            if len(donas) == 1:
                v["confianca"] = 0.7
                self.importadas.setdefault(donas[0], []).append(v)
            else:
                motivo = "nenhuma conta com esse nome" if not donas else f"nome ambíguo: {', '.join(donas)}"
                self.sem_conta.append({**v, "motivo": motivo})

    def pode_rodar(self, conta) -> str:
        if conta["id"] in self.importadas:
            return ""
        if not self.usar_gupy:
            return "sem vagas no arquivo"
        if conta["gupy_slug"] == "-":
            return "Gupy desligada para esta conta"
        anterior = self.snapshot_anterior(conta["id"]) or {}
        if not conta["gupy_slug"] and anterior.get("procurado_em") and not anterior.get("gupy_slug"):
            if anterior["procurado_em"] > (self.hoje - timedelta(days=REPROCURAR_DIAS)).isoformat():
                return "não usa Gupy (procurado há menos de 30 dias)"
        return ""

    def descrever_busca(self, conta) -> str:
        partes = []
        if self.usar_gupy and conta["gupy_slug"] != "-":
            partes.append(f"Gupy {GUPY.format(slug=conta['gupy_slug'])}" if conta["gupy_slug"]
                          else f"Gupy: procurando a página ({', '.join(candidatos_slug(conta))})")
        if conta["id"] in self.importadas:
            partes.append(f"{len(self.importadas[conta['id']])} vaga(s) do arquivo")
        return " + ".join(partes)

    # 1. BUSCA
    def buscar(self, conta) -> dict:
        self._slug_achado = None
        gupy = None
        slug = conta["gupy_slug"]
        if self.usar_gupy and slug != "-":
            for tentativa in ([slug] if slug else candidatos_slug(conta)):
                try:
                    bruto = self.http.get(GUPY.format(slug=tentativa), chave=tentativa).decode("utf-8", errors="replace")
                except ErroHTTP as e:
                    if e.status == 404:
                        continue
                    raise
                pagina = ler_pagina_gupy(bruto, GUPY.format(slug=tentativa))
                if slug or self._mesma_empresa(pagina["empresa"], conta["id"]):
                    gupy, self._slug_achado = pagina, tentativa
                    break
                self.passo(f"               {tentativa}.gupy.io é de '{pagina['empresa']}', não desta conta: ignorada")
        return {"gupy": gupy, "slug": self._slug_achado, "arquivo": self.importadas.get(conta["id"], [])}

    # 2. TRADUZ
    def traduzir(self, resposta_bruta: dict) -> dict:
        vagas = {}
        for v in (resposta_bruta["gupy"] or {}).get("vagas", []):
            vagas[f"gupy:{v['id']}"] = {**v, "fonte": "Gupy", "confianca": 0.9}
        titulos_gupy = {_norm(v["titulo"]) for v in vagas.values()}
        for v in resposta_bruta["arquivo"]:
            if _norm(v["titulo"]) in titulos_gupy:
                continue  # a mesma vaga na Gupy e no Indeed conta uma vez só (fica a da Gupy)
            vagas[f"{_norm(v['fonte']).replace(' ', '_')}:{v['id']}"] = {**v, "fonte": v["fonte"]}
        for chave, v in vagas.items():
            v["grupo"] = grupo_da_vaga(v["titulo"], self.tax.vagas)
        self._atual = {"gupy_slug": resposta_bruta["slug"], "gupy_encontrada": resposta_bruta["gupy"] is not None, "vagas": vagas}
        return self._atual

    def resumir(self, novo: dict) -> str:
        alvo = sum(1 for v in novo["vagas"].values() if v["grupo"])
        gupy = f"página {novo['gupy_slug']}.gupy.io" if novo["gupy_slug"] else "sem página na Gupy"
        return f"{len(novo['vagas'])} vaga(s) aberta(s), {alvo} nos grupos que interessam; {gupy}"

    def conteudo_snapshot(self, novo: dict) -> dict:
        return {"gupy_slug": novo["gupy_slug"], "procurado_em": self.hoje.isoformat(),
                "abertas": {k: {"titulo": v["titulo"], "grupo": v["grupo"]} for k, v in novo["vagas"].items()}}

    # 3. COMPARA
    def comparar(self, novo: dict, snapshot_anterior: dict | None) -> list[Item]:
        antes = set((snapshot_anterior or {}).get("abertas", {}))
        ignoradas = [v["titulo"] for v in novo["vagas"].values() if not v["grupo"]]
        if ignoradas:
            self.passo(f"               fora dos grupos: {len(ignoradas)}  ex.: {'; '.join(t[:50] for t in ignoradas[:3])}")
        por_grupo: dict[str, list[tuple[str, dict]]] = {}
        for chave, v in novo["vagas"].items():
            if v["grupo"] and chave not in antes:
                por_grupo.setdefault(v["grupo"], []).append((chave, v))
        ja_abertas = sum(1 for k, v in novo["vagas"].items() if v["grupo"] and k in antes)
        if ja_abertas:
            self.passo(f"               já estavam abertas na coleta anterior: {ja_abertas}")
        itens = []
        for grupo in GRUPOS:
            vs = por_grupo.get(grupo)
            if not vs:
                continue
            tipo = self.tax.tipo(grupo, self.conta["braco_icp"])
            titulos = "; ".join(v["titulo"] for _, v in vs)
            # Vaga sem data (a Gupy não informa) foi vista aberta hoje: o fato é de hoje.
            datas = [v.get("data") or self.hoje.isoformat() for _, v in vs]
            trecho = "; ".join(f"{v['titulo']}" + (f" ({v['local']})" if v.get("local") else "") + f" [{v['fonte']}]" for _, v in vs)
            itens.append(Item(self.conta["id"], grupo, f"{len(vs)} vaga(s) aberta(s): {titulos}", vs[0][1].get("url") or None,
                              f"Vagas abertas: {trecho}", max(datas),
                              {"vagas": vs, "rotulo": tipo.rotulo if tipo else grupo,
                               "confianca": min(v.get("confianca", 0.9) for _, v in vs)}))
        return itens

    # 4. ENTREGA
    def entregar(self, itens: list[Item]) -> int:
        gravados = 0
        limite = (self.hoje - timedelta(days=MESMO_EVENTO_DIAS)).isoformat()
        for it in itens:
            existente = self.conn.execute(
                """select id, evento_id from sinais where conta_id = ? and tipo = ? and status != 'descartado'
                   and substr(data_alerta, 1, 10) >= ? order by data_alerta desc limit 1""",
                (it.conta_id, it.tipo, limite)).fetchone()
            evento_id = existente["evento_id"] if existente else self.impressao_digital(self.nome, it.conta_id, it.tipo, self.hoje.isoformat())
            novas = 0
            for chave, v in it.extra["vagas"]:
                vaga = Item(it.conta_id, it.tipo, v["titulo"], v.get("url") or None, v.get("local", ""), v.get("data"))
                novas += self.gravar_item_bruto(vaga, self.impressao_digital(self.nome, it.conta_id, chave), evento_id, v["fonte"])
            if not novas or existente:
                continue  # vagas já vistas, ou o grupo já tem sinal recente: entram no mesmo evento
            tipo = self.tax.tipo(it.tipo, self.conta["braco_icp"])
            confianca = it.extra["confianca"]
            status = "alerta" if confianca >= self.tax.limiar_confianca else "revisar"
            titulos = ", ".join(v["titulo"] for _, v in it.extra["vagas"][:3])
            self.conn.execute(
                """insert into sinais (id, conta_id, tipo, evento_id, peso, confianca, membro_comite, angulo, evidencia_url,
                                       evidencia_trecho, data_fato, data_alerta, status, por_que_agora, classificador)
                   values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (novo_id(), it.conta_id, it.tipo, evento_id, tipo.peso if tipo else None, confianca,
                 tipo.membro_comite if tipo else None, tipo.angulo_sugerido if tipo else None, it.url, it.trecho,
                 it.data_fato, agora(), status, POR_QUE_AGORA[it.tipo].format(titulos=titulos), self.nome),
            )
            gravados += 1
        if self._slug_achado and not self.conta["gupy_slug"]:
            self.conn.execute("update contas set gupy_slug = ? where id = ?", (self._slug_achado, self.conta["id"]))
        return gravados

    def executar(self, contas: list):
        ex = super().executar(contas)
        if self.sem_conta:
            self.passo(f"== {len(self.sem_conta)} vaga(s) do arquivo sem conta correspondente (descartadas):")
            for v in self.sem_conta[:10]:
                self.passo(f"   {v['titulo'][:60]} | {v['empresa']}: {v['motivo']}")
        return ex
