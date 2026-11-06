"""Conector de vagas: quem está contratando marketing, growth, RevOps ou comercial.

1. BUSCA    Duas fontes:
            a) A página de carreiras da conta numa plataforma de vagas pública, sem chave: Gupy, Greenhouse,
               Lever, Ashby ou Sólides (veja plataformas.py). O endereço fica gravado na conta (vagas_url).
               Sem endereço, o conector tenta descobrir sozinho na Gupy e no Greenhouse (pelo site e pelo nome
               da conta) e confere se a página é mesmo da empresa. Conta sem página achada só é procurada de
               novo depois de 30 dias. Endereços de outras plataformas entram com `vagas pagina`/`vagas paginas`.
            b) Arquivo de vagas (CSV) trazido de outras fontes: Indeed pelo conector do Claude e, opcionalmente,
               anúncios do Glassdoor achados por busca na web (veja VAGAS_ROTINA.md). LinkedIn não é usado.
2. TRADUZ   De cada vaga: título, local, modo (remoto, híbrido), fonte, link e data (quando a fonte informa).
3. COMPARA  Mantém só vagas da empresa certa e dos grupos que interessam, pelas regras do sinais.yaml:
            liderança de receita, marketing/growth/RevOps e comercial. Descarta banco de talentos, estágio e
            as vagas que já estavam abertas na coleta anterior. A mesma vaga em duas fontes conta uma vez.
            Vagas novas do mesmo grupo viram um item só.
4. ENTREGA  Cada vaga nova vira item bruto (evidência com link). Cada grupo vira um sinal (confiança 0,9 na
            página da empresa e no arquivo com id da conta; 0,7 quando a conta foi reconhecida só pelo nome da
            empresa). Se já houver sinal do mesmo grupo nos últimos 30 dias, a vaga entra no mesmo evento e não
            gera sinal novo.
"""

from __future__ import annotations

import csv
import html as html_lib
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from .. import config
from .. import taxonomia as taxonomia_mod
from ..db import agora, novo_id
from ..identidade import normalizar_dominio, normalizar_nome, sem_acentos
from .base import Conector, Item
from .http import ErroHTTP
from .plataformas import PLATAFORMAS, ler_data, ler_gupy, reconhecer

REPROCURAR_DIAS = 30
MESMO_EVENTO_DIAS = 30
GRUPOS = ("vaga_lideranca_receita", "vaga_marketing_growth", "vaga_comercial")
POR_QUE_AGORA = {
    "vaga_lideranca_receita": "Está contratando uma liderança de receita ({titulos}): quem chega vai redesenhar a área e escolher parceiros nos primeiros meses.",
    "vaga_marketing_growth": "Está montando o time de marketing/growth ({titulos}): a operação está sendo desenhada agora.",
    "vaga_comercial": "Está ampliando o time comercial ({titulos}): mais gente vendendo precisa de demanda e processo desde já.",
}

# Palavras que podem sobrar ao comparar o nome de uma página com o nome da conta sem mudar a empresa.
_COMPLEMENTOS = set("""ai io br com brasil group grupo tecnologia tech digital sa ltda oficial carreiras careers vagas jobs hq
seguros seguradora advogados advocacia associados consorcios consorcio cooperativa credito sistemas software solucoes
servicos confederacao central""".split())


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


def ler_pagina_gupy(conteudo: str, base: str) -> dict:
    """Compatibilidade: o leitor da Gupy agora mora em plataformas.py."""
    return ler_gupy(conteudo, base)


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
    descricao = "Vagas de marketing, growth e comercial (páginas de carreiras e arquivo)"

    def __init__(self, *args, hoje: date | None = None, usar_paginas: bool = True, arquivo: list[dict] | None = None,
                 taxonomia=None, usar_gupy: bool | None = None, **kw):
        super().__init__(*args, **kw)
        self.hoje = hoje or date.today()
        self.usar_paginas = usar_paginas if usar_gupy is None else usar_gupy
        self.tax = taxonomia or taxonomia_mod.carregar()
        # Onde procurar sozinho quando a conta ainda não tem página: só plataformas em que dá para conferir a empresa.
        self.adivinhar = [p for p in config.valor("RADAR_VAGAS_ADIVINHAR", "gupy,greenhouse").split(",") if p in PLATAFORMAS]
        self.importadas: dict[str, list[dict]] = {}
        self.sem_conta: list[dict] = []
        if arquivo:
            self._distribuir(arquivo)
        self._pagina_achada: str | None = None
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

    def _pagina_da_conta(self, empresa: str, conta_id: str) -> bool:
        """Conferência estrita do nome de uma página de carreiras: o que sobra entre os nomes só pode ser
        complemento genérico. 'Logcomex.ai' serve para Logcomex; 'Alfa Turismo' não serve para Alfa."""
        pagina = set(normalizar_nome(empresa).split())
        if not pagina:
            return False
        for nome in self._nomes_da_conta(conta_id):
            conta = set(nome.split())
            if pagina == conta or (conta < pagina and pagina - conta <= _COMPLEMENTOS) or (
                    pagina < conta and conta - pagina <= _COMPLEMENTOS):
                return True
        return False

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
        if not self.usar_paginas:
            return "sem vagas no arquivo"
        if conta["vagas_url"] == "-":
            return "página de vagas desligada para esta conta"
        if conta["vagas_url"]:
            return "" if reconhecer(conta["vagas_url"]) else f"página {conta['vagas_url']} não é de plataforma conhecida"
        anterior = self.snapshot_anterior(conta["id"]) or {}
        if anterior.get("procurado_em") and not anterior.get("pagina"):
            if anterior["procurado_em"] > (self.hoje - timedelta(days=REPROCURAR_DIAS)).isoformat():
                return "sem página de vagas achada (procurada há menos de 30 dias)"
        return ""

    def _tentativas(self, conta) -> list[tuple]:
        """(plataforma, identificador, conferir?) na ordem em que serão tentados."""
        if conta["vagas_url"]:
            achado = reconhecer(conta["vagas_url"])
            return [(achado[0], achado[1], False)] if achado else []
        return [(PLATAFORMAS[p], c, True) for p in self.adivinhar for c in candidatos_slug(conta)]

    def descrever_busca(self, conta) -> str:
        partes = []
        if self.usar_paginas and conta["vagas_url"] != "-":
            if conta["vagas_url"]:
                p, x = reconhecer(conta["vagas_url"])
                partes.append(f"{p.nome} {p.pagina.format(x=x)}")
            else:
                partes.append(f"procurando a página de vagas ({', '.join(self.adivinhar)}: {', '.join(candidatos_slug(conta))})")
        if conta["id"] in self.importadas:
            partes.append(f"{len(self.importadas[conta['id']])} vaga(s) do arquivo")
        return " + ".join(partes)

    # 1. BUSCA
    def buscar(self, conta) -> dict:
        self._pagina_achada = None
        achada, plataforma = None, None
        if self.usar_paginas and conta["vagas_url"] != "-":
            for p, x, conferir in self._tentativas(conta):
                try:
                    bruto = self.http.get(p.lista.format(x=x), chave=f"{p.id}_{x}").decode("utf-8", errors="replace")
                except ErroHTTP as e:
                    if e.status == 404 and conferir:
                        continue  # a empresa não está nesta plataforma com este nome
                    raise
                pagina = p.ler(bruto, p.pagina.format(x=x))
                if conferir:
                    empresa = pagina["empresa"]
                    if not empresa and p.nome_da_empresa:
                        try:
                            empresa = json.loads(self.http.get(p.nome_da_empresa.format(x=x), chave=f"{p.id}_{x}_nome")).get("name", "")
                        except (ErroHTTP, json.JSONDecodeError):
                            empresa = ""
                    if not self._pagina_da_conta(empresa, conta["id"]):
                        self.passo(f"               {p.pagina.format(x=x)} é de '{empresa or '?'}', não desta conta: ignorada")
                        continue
                achada, plataforma = pagina, p
                self._pagina_achada = p.pagina.format(x=x)
                break
        return {"pagina": achada, "plataforma": plataforma.nome if plataforma else None, "url": self._pagina_achada,
                "arquivo": self.importadas.get(conta["id"], [])}

    # 2. TRADUZ
    def traduzir(self, resposta_bruta: dict) -> dict:
        vagas = {}
        fonte = resposta_bruta["plataforma"]
        for v in (resposta_bruta["pagina"] or {}).get("vagas", []):
            vagas[f"{_norm(fonte)}:{v['id']}"] = {**v, "fonte": fonte, "confianca": 0.9}
        titulos_pagina = {_norm(v["titulo"]) for v in vagas.values()}
        for v in resposta_bruta["arquivo"]:
            if _norm(v["titulo"]) in titulos_pagina:
                continue  # a mesma vaga na página da empresa e no Indeed conta uma vez só (fica a da página)
            vagas[f"{_norm(v['fonte']).replace(' ', '_')}:{v['id']}"] = {**v, "fonte": v["fonte"]}
        for v in vagas.values():
            v["grupo"] = grupo_da_vaga(v["titulo"], self.tax.vagas)
        self._atual = {"pagina": resposta_bruta["url"], "plataforma": fonte, "vagas": vagas}
        return self._atual

    def resumir(self, novo: dict) -> str:
        alvo = sum(1 for v in novo["vagas"].values() if v["grupo"])
        pagina = f"página {novo['pagina']}" if novo["pagina"] else "sem página de vagas"
        return f"{len(novo['vagas'])} vaga(s) aberta(s), {alvo} nos grupos que interessam; {pagina}"

    def conteudo_snapshot(self, novo: dict) -> dict:
        return {"pagina": novo["pagina"], "procurado_em": self.hoje.isoformat(),
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
        if self._pagina_achada and not self.conta["vagas_url"]:
            self.conn.execute("update contas set vagas_url = ? where id = ?", (self._pagina_achada, self.conta["id"]))
        return gravados

    def executar(self, contas: list):
        ex = super().executar(contas)
        if self.sem_conta:
            self.passo(f"== {len(self.sem_conta)} vaga(s) do arquivo sem conta correspondente (descartadas):")
            for v in self.sem_conta[:10]:
                self.passo(f"   {v['titulo'][:60]} | {v['empresa']}: {v['motivo']}")
        return ex
