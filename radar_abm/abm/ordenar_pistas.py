"""O Claude ordena as contas candidatas de uma pista de consultoria (cliente confidencial).

1. BUSCA    Para cada pista aberta com duas ou mais candidatas, manda ao Claude o anúncio (título, setor, local e a
            descrição do cliente, que costuma dizer porte, momento e foco) e o contexto de cada candidata: razão
            social, subsegmento, cidade, porte, portfólio, maturidade de marketing, gatilho recente e os sinais dos
            últimos 90 dias. Modelo em ANTHROPIC_MODEL (padrão claude-opus-5).
2. TRADUZ   A resposta vem num formato fixo: para cada candidata, a probabilidade (0 a 1) de ser o cliente e uma
            frase com o motivo, citando o anúncio e o contexto.
3. COMPARA  Só valem as contas que já eram candidatas (o Claude não inventa conta nova). Probabilidade fora de 0 a 1
            é ajustada. Candidata que ele não avaliou fica no fim, sem probabilidade. As probabilidades não precisam
            somar 1: o cliente pode não ser nenhuma das contas.
4. ENTREGA  Reordena as candidatas da pista pela probabilidade e guarda o motivo. Se uma se destaca (0,7 ou mais e
            pelo menos 0,3 acima da segunda), ela fica como sugestão. A pista continua aberta: só vira sinal quando
            você confirma (`vagas atribuir`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from . import config
from .classificador import COM_FALLBACK, MODELO_PADRAO, ClassificacaoFalhou
from .db import agora

SUGESTAO_MINIMA = 0.7
VANTAGEM_MINIMA = 0.3
CONTEXTO = ("faixa_porte", "evidencia_porte_escala", "portfolio_cross_sell", "maturidade_marketing_growth", "gatilho_recente")

SISTEMA = """Você ajuda o radar de ABM da Velora, consultoria de growth B2B. Uma consultoria de recrutamento (Michael
Page, Robert Half, Hays...) publicou uma vaga sem dizer quem é o cliente. O radar separou algumas contas candidatas
(mesmo setor e mesma cidade). Diga, para cada candidata, a probabilidade de ela ser o cliente do anúncio.

Compare o que o anúncio diz do cliente (porte, abrangência, foco, momento, estrutura) com o contexto de cada conta.
Probabilidade alta só com evidência concreta dos dois lados; se nada distingue as candidatas, dê probabilidades
baixas e parecidas e diga isso. As probabilidades não precisam somar 1: o cliente pode não ser nenhuma delas.
No motivo, em uma frase em português, cite o que do anúncio e o que da conta sustentam a nota."""


def esquema(ids: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "candidatas": {"type": "array", "items": {
                "type": "object",
                "properties": {"conta_id": {"type": "string", "enum": ids}, "probabilidade": {"type": "number"},
                               "motivo": {"type": "string"}},
                "required": ["conta_id", "probabilidade", "motivo"],
                "additionalProperties": False,
            }},
            "observacao": {"type": "string"},
        },
        "required": ["candidatas", "observacao"],
        "additionalProperties": False,
    }


def contexto_da_conta(conn, conta_id: str) -> dict:
    c = conn.execute("select * from contas where id = ?", (conta_id,)).fetchone()
    extra = json.loads(c["contexto_json"] or "{}")
    sinais = [f"{s['tipo']}: {(s['evidencia_trecho'] or '')[:140]}" for s in conn.execute(
        """select tipo, evidencia_trecho from sinais where conta_id = ? and status != 'descartado'
           and substr(coalesce(data_fato, data_alerta), 1, 10) >= date('now', '-90 day') order by data_alerta desc limit 5""",
        (conta_id,))]
    return {"conta_id": c["id"], "nome": c["nome_fantasia"], "razao_social": c["razao_social"], "subsegmento": c["subsegmento"],
            "cidade": c["cidade"], "uf": c["uf"], "tier": c["tier"], **{k: extra.get(k) for k in CONTEXTO if extra.get(k)},
            "sinais_recentes": sinais}


def montar_pedido(pista: dict, candidatas: list[dict]) -> str:
    anuncio = {k: pista.get(k) for k in ("consultoria", "titulo", "setor", "local", "descricao")}
    return (f"Anúncio:\n{json.dumps(anuncio, ensure_ascii=False)}\n\n"
            f"Contas candidatas:\n{json.dumps(candidatas, ensure_ascii=False, indent=1)}")


class OrdenadorClaude:
    def __init__(self, client=None, modelo: str | None = None):
        self.modelo = modelo or config.valor("ANTHROPIC_MODEL") or MODELO_PADRAO
        self._client = client
        self.nome = f"claude:{self.modelo}"
        self.chamadas = 0

    @property
    def client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic(max_retries=4, timeout=120)
        return self._client

    def avaliar(self, pista: dict, candidatas: list[dict]) -> dict:
        import anthropic

        params = dict(
            model=self.modelo, max_tokens=8000, system=SISTEMA,
            messages=[{"role": "user", "content": montar_pedido(pista, candidatas)}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": esquema([c["conta_id"] for c in candidatas])}},
        )
        if self.modelo in COM_FALLBACK:
            params.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        self.chamadas += 1
        try:
            resp = self.client.beta.messages.create(**params)
        except anthropic.RateLimitError as e:
            raise ClassificacaoFalhou(f"limite de chamadas da API do Claude (429); tente mais tarde: {e}") from e
        except anthropic.APIStatusError as e:
            raise ClassificacaoFalhou(f"a API do Claude respondeu {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise ClassificacaoFalhou(f"sem conexão com a API do Claude: {e}") from e
        if resp.stop_reason == "refusal":
            raise ClassificacaoFalhou("o modelo recusou o pedido (refusal), mesmo com a recuperação automática")
        if resp.stop_reason == "max_tokens":
            raise ClassificacaoFalhou("a resposta foi cortada (max_tokens)")
        texto = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        try:
            return json.loads(texto)
        except json.JSONDecodeError as e:
            raise ClassificacaoFalhou(f"resposta fora do formato combinado: {e}") from e


def aplicar(candidatas: list[dict], resposta: dict) -> tuple[list[dict], str | None]:
    """Junta a avaliação às candidatas, reordena e diz qual se destaca (ou None)."""
    notas = {}
    for r in resposta.get("candidatas") or []:
        if r.get("conta_id") in {c["conta_id"] for c in candidatas} and r["conta_id"] not in notas:
            try:
                prob = min(max(float(r.get("probabilidade", 0)), 0.0), 1.0)
            except (TypeError, ValueError):
                continue
            notas[r["conta_id"]] = (round(prob, 2), (r.get("motivo") or "").strip())
    novas = []
    for c in candidatas:
        c = {k: v for k, v in c.items() if k not in ("prob", "motivo_ia")}
        if c["conta_id"] in notas:
            c["prob"], c["motivo_ia"] = notas[c["conta_id"]]
        novas.append(c)
    novas.sort(key=lambda c: (c.get("prob") is None, -(c.get("prob") or 0), -c["pontos"], c["nome"]))
    sugestao = None
    com_nota = [c for c in novas if c.get("prob") is not None]
    if com_nota and com_nota[0]["prob"] >= SUGESTAO_MINIMA:
        segunda = com_nota[1]["prob"] if len(com_nota) > 1 else 0.0
        if com_nota[0]["prob"] - segunda >= VANTAGEM_MINIMA:
            sugestao = com_nota[0]["conta_id"]
    return novas, sugestao


@dataclass
class Resultado:
    ordenadas: int = 0
    sugestoes: int = 0
    puladas: int = 0
    falhas: list[str] = field(default_factory=list)


def ordenar(conn, ordenador, pista_id: str | None = None, refazer: bool = False, dry_run: bool = False, saida=print) -> Resultado:
    res = Resultado()
    sql = "select * from pistas_vagas where status = 'aberta'"
    args: list = []
    if pista_id:
        sql += " and id = ?"
        args.append(pista_id)
    elif not refazer:
        sql += " and ordenado_em is null"
    pistas = [dict(r) for r in conn.execute(sql, args)]
    saida(f"== ordenar pistas com {ordenador.nome}: {len(pistas)} pista(s)" + ("  (DRY-RUN: nada será gravado)" if dry_run else ""))
    for p in pistas:
        cands = json.loads(p["candidatos_json"] or "[]")
        if len(cands) < 2:
            res.puladas += 1
            continue
        saida(f"-- {p['id']} {p['consultoria']}: {p['titulo']} ({p['local'] or '-'}) · {len(cands)} candidata(s)")
        if dry_run:
            saida(f"   (simulado) enviaria o anúncio e o contexto de {len(cands)} conta(s) ao Claude")
            continue
        contextos = [contexto_da_conta(conn, c["conta_id"]) for c in cands]
        try:
            resposta = ordenador.avaliar(p, contextos)
        except ClassificacaoFalhou as e:
            res.falhas.append(f"{p['id']}: {e}")
            saida(f"   ERRO: {e} (a pista fica como estava)")
            continue
        novas, sugestao = aplicar(cands, resposta)
        conn.execute("update pistas_vagas set candidatos_json = ?, ordenado_por = ?, ordenado_em = ?, sugestao_conta = ? where id = ?",
                     (json.dumps(novas, ensure_ascii=False), ordenador.nome, agora(), sugestao, p["id"]))
        conn.commit()
        res.ordenadas += 1
        res.sugestoes += sugestao is not None
        for c in novas:
            prob = f"{c['prob']:.2f}" if c.get("prob") is not None else "  - "
            marca = "  <- sugestão" if c["conta_id"] == sugestao else ""
            saida(f"   {prob}  {c['nome'][:38]:<38} {c.get('motivo_ia', '')[:110]}{marca}")
        if resposta.get("observacao"):
            saida(f"   observação: {resposta['observacao'][:160]}")
    saida(f"== fim: {res.ordenadas} pista(s) ordenada(s), {res.sugestoes} com sugestão, {res.puladas} com menos de 2 candidatas, "
          f"{len(res.falhas)} falha(s)")
    return res
