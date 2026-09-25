"""Conector Apollo: vigia as pessoas do comitê de compra de cada conta.

1. BUSCA    Duas consultas ao Apollo (https://api.apollo.io), com a chave APOLLO_API_KEY do .env:
            a) Atualização do comitê (people/bulk_match): só as pessoas já mapeadas na tabela pessoas, e só
               as que não foram consultadas nos últimos 30 dias. Custa 1 crédito por pessoa encontrada.
               Vão até 10 pessoas por chamada, e cada execução tem um teto de créditos.
               reveal_personal_emails e reveal_phone_number vão SEMPRE como false: não pedimos e-mail
               pessoal nem telefone.
            b) Pessoas novas em cargos-alvo (mixed_people/api_search): quem ocupa hoje cargos de marketing,
               growth, RevOps e comercial no domínio da conta. Não gasta crédito, mas exige plano pago;
               no plano Free o Apollo recusa e o conector segue só com a parte (a).
2. TRADUZ   De cada pessoa guarda só: nome, cargo, empresa atual, domínio da empresa e o id no Apollo.
            E-mail, telefone, LinkedIn e foto são descartados.
3. COMPARA  Com a foto anterior: alguém do comitê mudou de empresa (o domínio da empresa atual não é o da
            conta) ou mudou de cargo; apareceu alguém num cargo-alvo que não estava lá antes nem está no
            comitê. Na primeira coleta, a lista de cargos-alvo vira só a linha de base (não gera sinal).
4. ENTREGA  Cada mudança vira item bruto e sinal (confiança 0,8: dado de terceiro, não oficial), com o
            membro do comitê afetado. Guarda o id do Apollo da pessoa para a próxima consulta ser exata.
"""

from __future__ import annotations

from datetime import date, timedelta

from .. import config
from ..identidade import normalizar_dominio, normalizar_nome
from ..importador import inferir_papel
from .base import Conector, Item
from .http import ErroHTTP

BASE = "https://api.apollo.io/api/v1"
# Regra inegociável: nunca revelar e-mail pessoal nem telefone. Vai na URL e no corpo de toda chamada.
SEM_REVELAR = {"reveal_personal_emails": False, "reveal_phone_number": False}
LOTE = 10  # pessoas por chamada de bulk_match (limite do Apollo)

CARGOS_ALVO = {
    "servicos_profissionais": ["sócio-diretor", "managing partner", "diretor de marketing", "head de marketing",
                               "cmo", "business development", "diretor de desenvolvimento de negócios", "coo"],
    "servicos_financeiros": ["diretor de marketing", "head de marketing", "cmo", "superintendente comercial",
                             "diretor comercial", "head de growth", "diretor de negócios"],
    "tecnologia": ["cmo", "vp de marketing", "head de marketing", "head de growth", "head of growth", "revops",
                   "revenue operations", "cro", "vp de vendas", "diretor comercial"],
}


class ConectorApollo(Conector):
    nome = "apollo"
    descricao = "Comitê de compra no Apollo"

    def __init__(self, *args, hoje: date | None = None, **kw):
        super().__init__(*args, **kw)
        self.hoje = hoje or date.today()
        self.chave = config.valor("APOLLO_API_KEY")
        self.intervalo_dias = int(config.valor("RADAR_APOLLO_INTERVALO_DIAS", "30"))
        self.max_creditos = int(config.valor("RADAR_APOLLO_MAX_CREDITOS", "25"))
        self.creditos = 0            # gastos (ou, no dry-run, que seriam gastos) nesta execução
        self.busca_disponivel = True  # vira False se o plano não permitir a busca de pessoas
        self.plano_bloqueado = False  # vira True se o plano não permitir nem a atualização do comitê
        self._novo: dict | None = None

    def _cabecalhos(self) -> dict:
        return {"x-api-key": self.chave, "Cache-Control": "no-cache"}

    def pessoas(self, conta) -> list:
        # Decisores primeiro: se o teto de créditos acabar, eles já foram consultados.
        return self.conn.execute(
            """select * from pessoas where conta_id = ?
               order by case papel_comite when 'decisor' then 0 when 'influenciador' then 1 else 2 end, nome""",
            (conta["id"],),
        ).fetchall()

    def a_consultar(self, conta, anterior: dict | None) -> list:
        limite = (self.hoje - timedelta(days=self.intervalo_dias)).isoformat()
        comite = (anterior or {}).get("comite", {})
        return [p for p in self.pessoas(conta) if (comite.get(p["id"]) or {}).get("consultado_em", "") < limite]

    def pode_rodar(self, conta) -> str:
        if self.plano_bloqueado:
            return "o Apollo recusou a API neste plano (veja CONECTORES.md, seção Apollo)"
        if not self.chave and not hasattr(self.http, "pasta"):
            return "sem APOLLO_API_KEY no .env"
        if not self.pessoas(conta) and not conta["dominio"]:
            return "sem pessoas no comitê e sem domínio"
        return ""

    def descrever_busca(self, conta) -> str:
        n = len(self.a_consultar(conta, self.snapshot_anterior(conta["id"])))
        partes = [f"atualizar {n} pessoa(s) do comitê (até {n} crédito(s))" if n else "comitê já atualizado (0 créditos)"]
        if conta["dominio"] and self.busca_disponivel:
            partes.append(f"procurar cargos-alvo em {conta['dominio']} (sem crédito)")
        return "Apollo: " + " + ".join(partes)

    # 1. BUSCA
    def buscar(self, conta) -> dict:
        anterior = self.snapshot_anterior(conta["id"])
        fila = self.a_consultar(conta, anterior)
        saldo = max(self.max_creditos - self.creditos, 0)
        consultar, adiados = fila[:saldo], fila[saldo:]
        if adiados:
            self.passo(f"               teto de {self.max_creditos} créditos: {len(adiados)} pessoa(s) ficam para a próxima")
        matches: list = []
        if self.dry_run:
            self.creditos += len(consultar)
            self.passo(f"               (simulado) consultaria {len(consultar)} pessoa(s): "
                       + (", ".join(p["nome"] for p in consultar) or "ninguém"))
        else:
            for i in range(0, len(consultar), LOTE):
                lote = consultar[i: i + LOTE]
                try:
                    resp = self.http.post_json(
                        f"{BASE}/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false",
                        {"details": [self._detalhe(p, conta) for p in lote], **SEM_REVELAR},
                        self._cabecalhos(), chave=f"{conta['id']}_match",
                    )
                except ErroHTTP as e:
                    if e.status == 403:  # plano sem acesso à API: não adianta tentar nas outras contas
                        self.plano_bloqueado = True
                        raise ErroHTTP("o Apollo recusou a atualização do comitê: o plano não inclui a API "
                                       "de enriquecimento (o Free não inclui). Nenhum crédito foi gasto.", 403) from e
                    raise
                achados = resp.get("matches") or []
                achados += [None] * (len(lote) - len(achados))
                self.creditos += int(resp.get("credits_consumed", sum(1 for m in achados if m)))
                matches += achados[: len(lote)]

        busca = None
        if conta["dominio"] and self.busca_disponivel:
            try:
                busca = self.http.post_json(
                    f"{BASE}/mixed_people/api_search",
                    {"q_organization_domains_list": [conta["dominio"]],
                     "person_titles": CARGOS_ALVO.get(conta["braco_icp"], CARGOS_ALVO["tecnologia"]), "per_page": 25},
                    self._cabecalhos(), chave=f"{conta['id']}_busca",
                )
            except ErroHTTP as e:
                if e.status not in (401, 403):
                    raise
                self.busca_disponivel = False
                self.passo("               busca de cargos-alvo indisponível no seu plano do Apollo "
                           "(o Free não inclui a API de busca); sigo só com o comitê")
        return {"anterior": anterior, "consultados": consultar, "matches": matches, "busca": busca}

    @staticmethod
    def _detalhe(pessoa, conta) -> dict:
        if pessoa["apollo_id"]:
            return {"id": pessoa["apollo_id"]}
        partes = pessoa["nome"].split()
        d = {"first_name": partes[0], "last_name": " ".join(partes[1:]), "organization_name": conta["nome_fantasia"]}
        if conta["dominio"]:
            d["domain"] = conta["dominio"]
        return d

    # 2. TRADUZ
    def traduzir(self, resposta_bruta: dict) -> dict:
        anterior = resposta_bruta["anterior"] or {}
        comite = dict(anterior.get("comite", {}))  # quem não foi consultado agora mantém a foto antiga
        consultados_agora = []
        if not self.dry_run:
            for pessoa, m in zip(resposta_bruta["consultados"], resposta_bruta["matches"]):
                consultados_agora.append(pessoa["id"])
                if not m:
                    comite[pessoa["id"]] = {"encontrado": False, "consultado_em": self.hoje.isoformat()}
                    continue
                org = m.get("organization") or {}
                comite[pessoa["id"]] = {
                    "encontrado": True,
                    "apollo_id": m.get("id"),
                    "nome": m.get("name") or f"{m.get('first_name', '')} {m.get('last_name', '')}".strip(),
                    "cargo": (m.get("title") or "").strip(),
                    "empresa": (org.get("name") or m.get("organization_name") or "").strip(),
                    "dominio_empresa": normalizar_dominio(org.get("primary_domain") or org.get("website_url") or ""),
                    "consultado_em": self.hoje.isoformat(),
                }
        busca = resposta_bruta["busca"]
        if busca is None:
            cargos_alvo = anterior.get("cargos_alvo")  # sem busca agora: mantém a linha de base
        else:
            cargos_alvo = sorted(
                (
                    {"apollo_id": p.get("id"),
                     "nome": f"{p.get('first_name', '')} {p.get('last_name') or p.get('last_name_obfuscated') or ''}".strip(),
                     "cargo": (p.get("title") or "").strip()}
                    for p in busca.get("people") or []
                ),
                key=lambda p: p["apollo_id"] or "",
            )
        self._novo = {"comite": comite, "cargos_alvo": cargos_alvo, "consultados_agora": consultados_agora}
        return self._novo

    def resumir(self, novo: dict) -> str:
        achados = sum(1 for pid in novo["consultados_agora"] if novo["comite"][pid].get("encontrado"))
        alvo = "indisponível" if novo["cargos_alvo"] is None else f"{len(novo['cargos_alvo'])} pessoa(s)"
        return f"comitê: {achados} de {len(novo['consultados_agora'])} achada(s) no Apollo; cargos-alvo: {alvo}"

    def conteudo_snapshot(self, novo: dict) -> dict:
        return {"comite": novo["comite"], "cargos_alvo": novo["cargos_alvo"]}

    # 3. COMPARA
    def comparar(self, novo: dict, snapshot_anterior: dict | None) -> list[Item]:
        conta = self.conta
        pessoas = {p["id"]: p for p in self.pessoas(conta)}
        antes = (snapshot_anterior or {}).get("comite", {})
        nomes_conta = {normalizar_nome(r["termo"]) for r in
                       self.conn.execute("select termo from aliases where conta_id = ?", (conta["id"],))}
        nomes_conta.add(normalizar_nome(conta["nome_fantasia"]))
        itens: list[Item] = []
        novo["fora"] = []  # quem já não está na conta: o cargo novo dele é de outra empresa

        for pid in novo["consultados_agora"]:
            agora_, velho, pessoa = novo["comite"][pid], antes.get(pid) or {}, pessoas[pid]
            if not agora_.get("encontrado"):
                continue
            quem = f"{pessoa['nome']} ({pessoa['papel_comite']})"
            fora = self._fora_da_conta(agora_, conta, nomes_conta)
            if fora:
                novo["fora"].append(pid)
            if fora and normalizar_nome(velho.get("empresa", "")) != normalizar_nome(agora_["empresa"]):
                itens.append(Item(conta["id"], "membro_mudou_de_empresa",
                                  f"{quem} agora está em {agora_['empresa'] or 'outra empresa'} como {agora_['cargo'] or 'cargo não informado'}",
                                  None, f"Apollo: empresa atual {agora_['empresa']} ({agora_['dominio_empresa'] or 'sem domínio'}), "
                                        f"cargo {agora_['cargo']}", self.hoje.isoformat(),
                                  {"pessoa_id": pid, "membro": pessoa["papel_comite"]}))
            elif velho.get("encontrado") and normalizar_nome(velho.get("cargo", "")) != normalizar_nome(agora_["cargo"]):
                itens.append(Item(conta["id"], "membro_mudou_de_cargo",
                                  f"{quem}: de {velho.get('cargo') or '?'} para {agora_['cargo']}",
                                  None, f"Apollo: cargo era {velho.get('cargo')}, agora {agora_['cargo']}", self.hoje.isoformat(),
                                  {"pessoa_id": pid, "membro": pessoa["papel_comite"]}))

        alvo_antes = (snapshot_anterior or {}).get("cargos_alvo")
        if novo["cargos_alvo"] is not None:
            if alvo_antes is None:
                self.passo(f"               linha de base: {len(novo['cargos_alvo'])} pessoa(s) em cargos-alvo "
                           "(novas pessoas passam a gerar sinal a partir da próxima coleta)")
            else:
                conhecidos = {p["apollo_id"] for p in alvo_antes} | {p["apollo_id"] for p in pessoas.values() if p["apollo_id"]}
                nomes_comite = {normalizar_nome(p["nome"]) for p in pessoas.values()}
                for p in novo["cargos_alvo"]:
                    if p["apollo_id"] in conhecidos or normalizar_nome(p["nome"]) in nomes_comite:
                        continue
                    itens.append(Item(conta["id"], "pessoa_nova_cargo_alvo", f"{p['nome']} apareceu como {p['cargo']}",
                                      None, f"Apollo: {p['nome']}, {p['cargo']}, na {conta['nome_fantasia']}",
                                      self.hoje.isoformat(), {"membro": inferir_papel(p["cargo"]), "apollo_id": p["apollo_id"]}))
        return itens

    @staticmethod
    def _fora_da_conta(pessoa: dict, conta, nomes_conta: set[str]) -> bool:
        """True só quando dá para afirmar que a empresa atual é outra; na dúvida, não acusa."""
        if pessoa.get("dominio_empresa") and conta["dominio"]:
            return pessoa["dominio_empresa"] != conta["dominio"]
        if pessoa.get("empresa"):
            empresa = normalizar_nome(pessoa["empresa"])
            return not any(n and (n in empresa or empresa in n) for n in nomes_conta)
        return False

    # 4. ENTREGA
    def entregar(self, itens: list[Item]) -> int:
        gravados = 0
        for it in itens:
            hash_ = self.impressao_digital(self.nome, it.conta_id, it.tipo, it.titulo)
            if self.gravar_item_bruto(it, hash_):
                self.gravar_sinal(it, evento_id=hash_, confianca=0.8, status="alerta", membro_comite=it.extra.get("membro"))
                gravados += 1
        # Guarda o id do Apollo e o cargo atual: a próxima consulta vai direto na pessoa certa.
        for pid in (self._novo or {}).get("consultados_agora", []):
            dado = self._novo["comite"][pid]
            if dado.get("encontrado"):
                cargo = "" if pid in self._novo.get("fora", []) else dado["cargo"]
                self.conn.execute("update pessoas set apollo_id = ?, cargo = coalesce(nullif(?, ''), cargo) where id = ?",
                                  (dado["apollo_id"], cargo, pid))
        return gravados

    def executar(self, contas: list):
        ex = super().executar(contas)
        rotulo = "seriam gastos" if self.dry_run else "gastos"
        self.passo(f"== créditos do Apollo {rotulo} nesta execução: {self.creditos} (teto {self.max_creditos})")
        return ex
