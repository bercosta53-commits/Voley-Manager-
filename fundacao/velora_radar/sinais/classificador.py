"""Classificador: decide se um item coletado é sinal, de que tipo, quem do comitê afeta e com que evidência.

Dois classificadores com a mesma saída:
- ``ClassificadorClaude`` usa a API do Claude com saída estruturada. É o padrão quando há credencial.
- ``ClassificadorRegras`` usa palavras-chave. Serve de reserva sem credencial e nos testes.

Peso e decaimento não saem do modelo: vêm do catálogo (força e meia-vida do tipo) ajustados pela
confiança. O trecho de evidência precisa existir no texto coletado; se o modelo citar algo que não
está lá, o título do item entra no lugar e a confiança cai um nível.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from ..identidade import sem_acentos
from .catalogo import PAPEIS, TIPOS

MODELO = "claude-opus-5"
CONFIANCAS = ("alta", "media", "baixa")


@dataclass
class Veredito:
    item_id: str
    relevante: bool
    tipo: str | None
    confianca: str
    papel: str
    cargo: str
    detalhe: str
    trecho: str
    motivo: str
    classificador: str


class ClassificacaoFalhou(RuntimeError):
    pass


def _normal(texto: str) -> str:
    return re.sub(r"\s+", " ", sem_acentos(texto).lower()).strip()


def _rebaixar(confianca: str) -> str:
    return CONFIANCAS[min(CONFIANCAS.index(confianca) + 1, 2)] if confianca in CONFIANCAS else "baixa"


def validar(item: dict, bruto: dict, classificador: str) -> Veredito:
    """Confere a resposta contra o catálogo e contra o texto do item."""
    tipo = bruto.get("tipo")
    relevante = bool(bruto.get("relevante")) and tipo in TIPOS
    confianca = bruto.get("confianca") if bruto.get("confianca") in CONFIANCAS else "baixa"
    texto = f"{item['titulo']} {item.get('texto') or ''}"
    trecho = str(bruto.get("trecho") or "").strip()
    if relevante and (not trecho or _normal(trecho) not in _normal(texto)):
        trecho = item["titulo"]
        confianca = _rebaixar(confianca)
    t = TIPOS.get(tipo) if relevante else None
    papel = bruto.get("papel_afetado") if bruto.get("papel_afetado") in PAPEIS else (t.papel if t else "indefinido")
    return Veredito(
        item_id=str(item["id"]),
        relevante=relevante,
        tipo=tipo if relevante else None,
        confianca=confianca,
        papel=papel,
        cargo=str(bruto.get("cargo_afetado") or (t.cargo if t else ""))[:120],
        detalhe=str(bruto.get("detalhe") or item["titulo"])[:200],
        trecho=trecho[:500],
        motivo=str(bruto.get("motivo") or "")[:300],
        classificador=classificador,
    )


# ---------- Claude ----------

SISTEMA = """Você é o classificador de sinais de compra do Radar de Sinais da Velora, consultoria de crescimento B2B.
Um sinal é um fato recente que indica que a empresa vai repensar aquisição de clientes, marketing ou processo comercial nos próximos meses, ou, no caso dos negativos, que ela não vai comprar agora.
Para cada item coletado, decida se é sinal real sobre a empresa indicada ou ruído (homônimo, notícia antiga requentada, assunto irrelevante, vaga fora de marketing e vendas, publicidade).
Regras:
- Use somente os ids de tipo do catálogo. Na dúvida entre dois, escolha o mais específico. Sem encaixe, relevante = false e tipo = "nenhum".
- "trecho" é uma citação literal, copiada do título ou do texto do item, que comprova o fato. Nunca parafraseie.
- "detalhe" resume o fato em até 15 palavras, pronto para entrar numa mensagem de abordagem.
- "papel_afetado" é quem no comitê de compra o fato envolve; "cargo_afetado" é o cargo a procurar.
- Confiança alta só quando o item afirma o fato sobre esta empresa sem ambiguidade."""


def _schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "itens": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "relevante": {"type": "boolean"},
                        "tipo": {"type": "string", "enum": sorted(TIPOS) + ["nenhum"]},
                        "confianca": {"type": "string", "enum": list(CONFIANCAS)},
                        "papel_afetado": {"type": "string", "enum": list(PAPEIS)},
                        "cargo_afetado": {"type": "string"},
                        "detalhe": {"type": "string"},
                        "trecho": {"type": "string"},
                        "motivo": {"type": "string"},
                    },
                    "required": ["id", "relevante", "tipo", "confianca", "papel_afetado", "cargo_afetado", "detalhe", "trecho", "motivo"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["itens"],
        "additionalProperties": False,
    }


def montar_pedido(conta: dict, itens: list[dict]) -> str:
    catalogo = "\n".join(f"{t.id}: {t.rotulo}" + (" (negativo)" if t.forca == "N" else "") for t in TIPOS.values())
    empresa = {k: conta.get(k) for k in ("nome", "setor", "cidade", "uf", "dominio", "braco") if conta.get(k)}
    dados = [
        {
            "id": str(i["id"]),
            "fonte": i["fonte"],
            "data": str(i.get("publicado_em") or ""),
            "titulo": i["titulo"],
            "texto": (i.get("texto") or "")[:1500],
            "tipo_sugerido_pela_fonte": i.get("tipo_sugerido"),
        }
        for i in itens
    ]
    return (
        f"Empresa:\n{json.dumps(empresa, ensure_ascii=False)}\n\n"
        f"Catálogo de tipos (id: descrição):\n{catalogo}\n\n"
        f"Itens coletados:\n{json.dumps(dados, ensure_ascii=False)}\n\n"
        "Classifique cada item, um objeto por id."
    )


class ClassificadorClaude:
    nome = "claude"

    def __init__(self, client=None, modelo: str = MODELO, lote: int = 12):
        if client is None:
            import anthropic

            client = anthropic.Anthropic()
        self.client = client
        self.modelo = modelo
        self.lote = lote

    def classificar(self, conta: dict, itens: list[dict]) -> list[Veredito]:
        vereditos: list[Veredito] = []
        for i in range(0, len(itens), self.lote):
            parte = itens[i : i + self.lote]
            resp = self.client.beta.messages.create(
                model=self.modelo,
                max_tokens=16000,
                system=SISTEMA,
                messages=[{"role": "user", "content": montar_pedido(conta, parte)}],
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": _schema()}},
                # Se o modelo recusar, a API refaz o pedido no modelo de reserva recomendado.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
            if resp.stop_reason == "refusal":
                raise ClassificacaoFalhou("o modelo recusou o pedido de classificação")
            if resp.stop_reason == "max_tokens":
                raise ClassificacaoFalhou("resposta cortada por tamanho; reduza o lote")
            texto = next((b.text for b in resp.content if b.type == "text"), "")
            try:
                respostas = {str(r.get("id")): r for r in json.loads(texto).get("itens", [])}
            except (json.JSONDecodeError, AttributeError) as erro:
                raise ClassificacaoFalhou(f"resposta fora do formato: {erro}") from erro
            modelo_usado = getattr(resp, "model", self.modelo)
            for item in parte:
                r = respostas.get(str(item["id"]))
                if r is None:
                    continue  # item sem resposta fica para a próxima rodada
                vereditos.append(validar(item, r, f"claude:{modelo_usado}"))
        return vereditos


# ---------- Regras ----------

_REGRAS: list[tuple[str, str]] = [
    ("recuperacao_judicial", r"recuperacao judicial"),
    ("demissoes_congelamento", r"\b(demite|demitiu|demissoes|layoff|corta \d+ (vagas|funcionarios|empregos)|congela(mento de)? (vagas|contratacoes))\b"),
    ("novo_cmo", r"\b(nov[oa]|assume|contrata|anuncia|chega)\b.{0,80}\b(cmo|diretor[a]? de marketing|head de (marketing|growth)|vp de marketing)\b"),
    ("novo_diretor_comercial", r"\b(nov[oa]|assume|contrata|anuncia|chega)\b.{0,80}\b(cro|diretor[a]? comercial|diretor[a]? de vendas|vp de vendas|head de vendas)\b"),
    ("novo_ceo", r"\b(nov[oa]|assume|anuncia)\b.{0,60}\b(ceo|presidente|diretor[a]?-presidente)\b"),
    ("novo_socio_diretor", r"\b(novo|nova)\b.{0,30}\b(socio-diretor|socia-diretora|managing partner|socio administrador)\b"),
    ("novos_socios", r"\b(novos? socios?|nova socia|promove .{0,40}socios?|anuncia .{0,40}socios?|chegada de .{0,40}socios?|reforca .{0,40}socios?)\b"),
    ("rodada_investimento", r"\b(rodada|serie [abc]\b|capta(cao)? (de )?r\$|aporte de r\$|recebe investimento)"),
    ("fusao_aquisicao", r"\b(adquire|aquisicao d[aeo]|compra (d[aeo]|a|o)\b|fusao|incorpora)\b"),
    ("incorporacao_cooperativas", r"\bincorporacao\b.{0,60}\bcooperativ"),
    ("nova_filial", r"\b(nova (filial|unidade|agencia|sede|escritorio)|inaugura|abre (filial|unidade|agencia|escritorio))\b"),
    ("rebranding", r"\b(nova marca|rebranding|muda de nome|nova identidade visual)\b"),
    ("lancamento_produto", r"\b(lanca|lancamento d[aeo])\b"),
    ("resultado_crescimento", r"\b(lucro|resultado|receita|faturamento)\b.{0,50}\b(cresce|cresceu|alta de|recorde|avanca)\b"),
    ("ranking_setorial", r"\b(ranking|mais admirad|analise advocacia|valor 1000|melhores empresas)\b"),
    ("licitacao_vencida", r"\b(vence licitacao|venceu licitacao|contrato de r\$|homologa(do|da|cao))\b"),
    ("rfp_agencia", r"\b(concorrencia|rfp|busca agencia|seleciona agencia)\b"),
]
_REGRAS_VAGA: list[tuple[str, str]] = [
    ("vaga_sdr", r"\b(sdr|bdr|pre-?vendas|inside sales|prospeccao)\b"),
    ("vaga_revops", r"\b(revops|revenue operations|crm|automacao de marketing|hubspot|salesforce)\b"),
    ("vaga_dados_marketing", r"\b(dados|bi|analytics|analista de dados)\b.{0,30}\bmarketing\b|\bmarketing\b.{0,30}\b(dados|bi|analytics)\b"),
    ("vaga_gestao_agencias", r"\b(gestao de agencias|agency manager|gestao de fornecedores)\b"),
    ("vaga_executivo_regiao", r"\b(executivo de contas|account executive|gerente de contas)\b"),
    ("vaga_marketing", r"\b(marketing|growth|midia paga|performance|trafego pago|social media|conteudo)\b"),
]


class ClassificadorRegras:
    nome = "regras"

    def classificar(self, conta: dict, itens: list[dict]) -> list[Veredito]:
        saida = []
        for item in itens:
            texto = _normal(f"{item['titulo']} {item.get('texto') or ''}")
            tipo, confianca, motivo = None, "media", ""
            if item.get("tipo_sugerido") in TIPOS and item.get("coletor") in ("cnpj", "cvm"):
                tipo, confianca, motivo = item["tipo_sugerido"], "alta", "fonte oficial estruturada"
            elif item.get("coletor") == "vagas":
                tipo = next((t for t, rx in _REGRAS_VAGA if re.search(rx, _normal(item["titulo"]))), None)
                motivo = "vaga na área-alvo" if tipo else "vaga fora de marketing e vendas"
            else:
                tipo = next((t for t, rx in _REGRAS if re.search(rx, texto)), None)
                motivo = "palavras-chave" if tipo else "nenhum padrão de sinal"
            bruto = {"relevante": tipo is not None, "tipo": tipo or "nenhum", "confianca": confianca, "trecho": item["titulo"], "motivo": motivo}
            saida.append(validar(item, bruto, "regras"))
        return saida


def padrao(forcar_regras: bool = False):
    """Claude quando há credencial da API; regras caso contrário."""
    if not forcar_regras and (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return ClassificadorClaude()
    return ClassificadorRegras()
