"""Conector CNPJ (BrasilAPI): vigia o cadastro da empresa na Receita Federal.

1. BUSCA    Chama https://brasilapi.com.br/api/cnpj/v1/{cnpj} com o CNPJ da matriz. É gratuito e sem chave.
            Uma chamada por conta; só roda para contas com CNPJ.
2. TRADUZ   Da resposta, guarda: quadro de sócios e administradores (QSA: nome, qualificação e data de
            entrada), capital social, situação cadastral, CNAE (código da atividade principal) e endereço
            da sede. Descarta o que não usamos e o que é dado pessoal (CPF mascarado, faixa etária).
3. COMPARA  Com a foto da coleta anterior: sócio ou administrador que entrou ou saiu, mudança de
            qualificação (ex.: virou administrador), capital que mudou, situação cadastral que mudou,
            endereço da sede que mudou. Na primeira coleta não há foto: só vira novidade quem entrou
            no QSA nos últimos 180 dias (ajustável em RADAR_CNPJ_JANELA_DIAS no .env) e empresa que
            não está ATIVA.
4. ENTREGA  Cada novidade vira um item bruto (a evidência) e um sinal com confiança 1,0, porque é dado
            oficial. A mesma novidade nunca entra duas vezes. Também completa a conta com razão social,
            UF e cidade quando estavam vazias.
"""

from __future__ import annotations

from datetime import date, timedelta

from .. import config
from ..identidade import sem_acentos
from .base import Conector, Item

URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"

# Tipo de sinal -> membro do comitê que ele costuma "acordar". A fase 5 passa isso para o sinais.yaml.
TIPOS = {
    "socio_entrou": "decisor",
    "socio_saiu": "decisor",
    "administracao_mudou": "decisor",
    "capital_mudou": "decisor",
    "situacao_mudou": "decisor",
    "sede_mudou": "influenciador",
}


def _chave(nome: str) -> str:
    return " ".join(sem_acentos(nome).upper().split())


def _e_administracao(qualificacao: str) -> bool:
    q = sem_acentos(qualificacao).lower()
    return any(p in q for p in ("administrador", "diretor", "presidente", "conselheiro"))


def _reais(valor: float) -> str:
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


class ConectorCNPJ(Conector):
    nome = "cnpj"
    descricao = "Cadastro na Receita Federal via BrasilAPI"

    def __init__(self, *args, hoje: date | None = None, **kw):
        super().__init__(*args, **kw)
        self.hoje = hoje or date.today()
        # Na primeira coleta, quem entrou no QSA há menos que isto ainda está "chegando" no cargo.
        self.janela_dias = int(config.valor("RADAR_CNPJ_JANELA_DIAS", "180"))

    def pode_rodar(self, conta) -> str:
        return "" if conta["cnpj"] else "sem CNPJ"

    def descrever_busca(self, conta) -> str:
        return f"GET {URL.format(cnpj=conta['cnpj'])}"

    # 1. BUSCA
    def buscar(self, conta) -> dict:
        return self.http.get_json(URL.format(cnpj=conta["cnpj"]))

    # 2. TRADUZ
    def traduzir(self, resposta_bruta: dict) -> dict:
        r = resposta_bruta
        return {
            "cnpj": r.get("cnpj"),
            "razao_social": (r.get("razao_social") or "").strip(),
            "nome_fantasia": (r.get("nome_fantasia") or "").strip(),
            "situacao": (r.get("descricao_situacao_cadastral") or "").strip().upper(),
            "data_situacao": r.get("data_situacao_cadastral"),
            "capital_social": float(r.get("capital_social") or 0),
            "cnae": {"codigo": str(r.get("cnae_fiscal") or ""), "descricao": r.get("cnae_fiscal_descricao") or ""},
            "sede": {
                "logradouro": " ".join(filter(None, [r.get("descricao_tipo_de_logradouro"), r.get("logradouro")])).strip(),
                "numero": (r.get("numero") or "").strip(),
                "bairro": (r.get("bairro") or "").strip(),
                "municipio": (r.get("municipio") or "").strip(),
                "uf": (r.get("uf") or "").strip(),
                "cep": (r.get("cep") or "").strip(),
            },
            "qsa": sorted(
                (
                    {
                        "nome": (s.get("nome_socio") or "").strip(),
                        "qualificacao": (s.get("qualificacao_socio") or "").strip(),
                        "entrada": s.get("data_entrada_sociedade"),
                    }
                    for s in r.get("qsa") or []
                    if s.get("nome_socio")
                ),
                key=lambda s: s["nome"],
            ),
        }

    def resumir(self, novo: dict) -> str:
        sede = novo["sede"]
        return (f"QSA com {len(novo['qsa'])} pessoa(s), capital {_reais(novo['capital_social'])}, "
                f"situação {novo['situacao']}, CNAE {novo['cnae']['codigo']}, sede em {sede['municipio']}/{sede['uf']}")

    # 3. COMPARA
    def comparar(self, novo: dict, snapshot_anterior: dict | None) -> list[Item]:
        conta_id = self.conta["id"]
        evidencia = URL.format(cnpj=novo["cnpj"])
        hoje = self.hoje.isoformat()
        itens: list[Item] = []

        def item(tipo, titulo, trecho, data_fato=hoje, **extra):
            itens.append(Item(conta_id, tipo, titulo, evidencia, trecho, data_fato, extra))

        def descrever(s):
            return f"{s['nome']} ({s['qualificacao'] or 'sem qualificação'})"

        if snapshot_anterior is None:
            limite = (self.hoje - timedelta(days=self.janela_dias)).isoformat()
            for s in novo["qsa"]:
                if s["entrada"] and s["entrada"] >= limite:
                    item("socio_entrou", f"{descrever(s)} entrou no quadro societário",
                         f"QSA na Receita: {descrever(s)}, entrada em {s['entrada']}", s["entrada"], socio=s)
            if novo["situacao"] and novo["situacao"] != "ATIVA":
                item("situacao_mudou", f"Situação cadastral: {novo['situacao']}",
                     f"Receita Federal: situação {novo['situacao']} desde {novo['data_situacao']}", novo["data_situacao"] or hoje)
            return itens

        antes = {_chave(s["nome"]): s for s in snapshot_anterior.get("qsa", [])}
        agora_ = {_chave(s["nome"]): s for s in novo["qsa"]}
        for chave, s in agora_.items():
            if chave not in antes:
                item("socio_entrou", f"{descrever(s)} entrou no quadro societário",
                     f"QSA na Receita: {descrever(s)}, entrada em {s['entrada'] or 'data não informada'}",
                     s["entrada"] or hoje, socio=s)
            elif _chave(antes[chave]["qualificacao"]) != _chave(s["qualificacao"]):
                virou_admin = _e_administracao(s["qualificacao"]) and not _e_administracao(antes[chave]["qualificacao"])
                item("administracao_mudou",
                     f"{s['nome']} passou de {antes[chave]['qualificacao']} a {s['qualificacao']}",
                     f"QSA na Receita: {s['nome']} era {antes[chave]['qualificacao']}, agora {s['qualificacao']}",
                     socio=s, virou_administrador=virou_admin)
        for chave, s in antes.items():
            if chave not in agora_:
                item("socio_saiu", f"{descrever(s)} saiu do quadro societário",
                     f"QSA na Receita: {descrever(s)} não consta mais (constava na coleta anterior)", socio=s)

        cap_antes, cap_agora = snapshot_anterior.get("capital_social", 0), novo["capital_social"]
        if cap_agora != cap_antes:
            variacao = f" ({(cap_agora - cap_antes) / cap_antes:+.0%})" if cap_antes else ""
            sentido = "aumentou" if cap_agora > cap_antes else "diminuiu"
            item("capital_mudou", f"Capital social {sentido}: {_reais(cap_antes)} → {_reais(cap_agora)}{variacao}",
                 f"Receita Federal: capital social de {_reais(cap_antes)} para {_reais(cap_agora)}",
                 antes=cap_antes, depois=cap_agora)

        if novo["situacao"] != snapshot_anterior.get("situacao"):
            item("situacao_mudou", f"Situação cadastral: {snapshot_anterior.get('situacao')} → {novo['situacao']}",
                 f"Receita Federal: situação {novo['situacao']} desde {novo['data_situacao']}", novo["data_situacao"] or hoje)

        def endereco(sede: dict) -> tuple:
            return tuple(_chave(sede.get(k, "")) for k in ("logradouro", "numero", "municipio", "uf", "cep"))

        sede_antes = snapshot_anterior.get("sede", {})
        if endereco(novo["sede"]) != endereco(sede_antes):
            def texto(sede):
                return f"{sede.get('logradouro')}, {sede.get('numero')} - {sede.get('municipio')}/{sede.get('uf')}"
            item("sede_mudou", f"Sede mudou para {novo['sede']['municipio']}/{novo['sede']['uf']}",
                 f"Receita Federal: de {texto(sede_antes)} para {texto(novo['sede'])}")
        return itens

    # 4. ENTREGA
    def entregar(self, itens: list[Item]) -> int:
        gravados = 0
        for it in itens:
            hash_ = self.impressao_digital(self.nome, it.conta_id, it.tipo, it.titulo, it.data_fato or "")
            if not self.gravar_item_bruto(it, hash_):
                continue  # já visto numa coleta anterior
            self.gravar_sinal(it, evento_id=hash_, confianca=1.0, status="alerta", membro_comite=TIPOS.get(it.tipo))
            gravados += 1
        return gravados

    def completar_conta(self, novo: dict) -> dict:
        return {
            "razao_social": novo["razao_social"],
            "uf": novo["sede"]["uf"] or None,
            "cidade": novo["sede"]["municipio"] or None,
        }
