"""Classificador: decide se cada notícia coletada é sinal ou ruído, e de que tipo.

Funciona como um conector para a API do Claude:
1. BUSCA    Manda ao Claude as notícias ainda não classificadas de uma conta (até 15 por chamada), com os
            dados da conta, os tipos de sinal válidos para o braço dela e as categorias de ruído do
            sinais.yaml. Modelo em ANTHROPIC_MODEL (padrão claude-opus-5).
2. TRADUZ   A resposta vem num formato fixo (JSON com esquema): para cada notícia, se é a empresa certa, se
            é relevante, o tipo, a confiança (0 a 1), o membro do comitê afetado, a frase de "por que
            agora", o trecho de evidência e, se for o mesmo fato de outra notícia, qual.
3. COMPARA  Confere a resposta: tipo tem de existir na taxonomia e valer para o braço; o trecho de evidência
            tem de estar no texto coletado (se não estiver, entra o título e a confiança cai 0,15);
            notícias sobre o mesmo fato viram um só evento. Abaixo de limiar_confianca (0,6), o sinal vai
            para "revisar" em vez de virar alerta.
4. ENTREGA  Um sinal por evento (a notícia mais confiável vira a evidência), com peso, meia-vida e ângulo do
            sinais.yaml. Cada notícia fica marcada: sinal, revisar, ruído, outra empresa, sem tipo ou
            duplicada. Evento que já tinha sinal não gera outro.

Sem ANTHROPIC_API_KEY, o classificador por regras usa as palavras-chave do sinais.yaml. Ele nunca cria
alerta: tudo o que acha vai para "revisar" (confiança 0,5).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from . import config
from .db import agora, novo_id
from .identidade import sem_acentos
from .taxonomia import MEMBROS, Taxonomia

MODELO_PADRAO = "claude-opus-5"
# Modelos que aceitam a recuperação automática quando o classificador de segurança recusa o pedido.
COM_FALLBACK = {"claude-opus-5", "claude-opus-5-5", "claude-fable-5", "claude-fable-5-1"}
LOTE = 15


class ClassificacaoFalhou(Exception):
    pass


@dataclass
class Decisao:
    item_id: str
    empresa_certa: bool
    relevante: bool
    tipo: str | None
    confianca: float
    membro_comite: str | None
    por_que_agora: str
    trecho: str
    mesmo_fato_que: str | None
    motivo: str
    classificador: str


def _norm(texto: str) -> str:
    return re.sub(r"\s+", " ", sem_acentos(texto or "").lower()).strip()


def validar(item: dict, bruto: dict, taxonomia: Taxonomia, braco: str | None, ids_lote: set[str], classificador: str) -> Decisao:
    """Confere o que o modelo respondeu contra a taxonomia e contra o texto coletado."""
    permitidos = {t.id for t in taxonomia.tipos_para_noticias(braco)}
    empresa_certa = bool(bruto.get("empresa_certa", True))
    relevante = bool(bruto.get("relevante")) and empresa_certa
    tipo = bruto.get("tipo") if bruto.get("tipo") not in (None, "", "nenhum") else None
    motivo = bruto.get("motivo_ruido") or ""
    if relevante and tipo not in permitidos:
        relevante, motivo = False, f"tipo fora da taxonomia ({tipo})" if tipo else "sem tipo"
    try:
        confianca = min(max(float(bruto.get("confianca", 0)), 0.0), 1.0)
    except (TypeError, ValueError):
        confianca = 0.0
    trecho = (bruto.get("trecho") or "").strip()
    texto = f"{item['titulo']} {item.get('trecho') or ''}"
    if relevante and (not trecho or _norm(trecho) not in _norm(texto)):
        trecho, confianca = item["titulo"], max(confianca - 0.15, 0.0)  # evidência inventada não passa
    membro = bruto.get("membro_comite") if bruto.get("membro_comite") in MEMBROS else None
    mesmo = bruto.get("mesmo_fato_que") or None
    if mesmo not in ids_lote or mesmo == item["id"]:
        mesmo = None
    return Decisao(item["id"], empresa_certa, relevante, tipo if relevante else None, confianca, membro,
                   (bruto.get("por_que_agora") or "").strip(), trecho, mesmo,
                   "outra_empresa" if not empresa_certa else ("" if relevante else motivo or "irrelevante"), classificador)


# ------------------------------------------------------------------------------------------ Claude

SISTEMA = """Você classifica notícias para o radar de ABM da Velora, consultoria de growth B2B que vende para
empresas brasileiras de serviços profissionais, serviços financeiros e tecnologia. Um sinal é um fato
recente que abre janela de compra de consultoria de growth: mudança de liderança, expansão, fusão,
produto novo, rodada, norma nova, time de marketing em formação. Ruído é o que cita a empresa sem abrir
janela: prêmio, ranking, patrocínio, sorteio, ação social, artigo de opinião, release genérico.

Para cada notícia, responda:
- empresa_certa: a notícia é mesmo sobre esta conta (e não um homônimo, uma pessoa, uma rua, outra empresa)?
- relevante: é um sinal (true) ou ruído (false)?
- motivo_ruido: a categoria de ruído, "outra_empresa", ou "nenhum" quando for sinal.
- tipo: um dos tipos listados para esta conta, ou "nenhum".
- confianca: de 0 a 1, o quanto você tem certeza de que é a empresa certa E de que o tipo está correto.
  Só a manchete disponível, sem detalhes, deve baixar a confiança.
- membro_comite: quem esse fato "acorda" no comitê de compra.
- por_que_agora: uma frase em português, específica para esta conta, dizendo por que este é o momento de
  abordar. Nada genérico.
- trecho: copie literalmente o pedaço do título ou do trecho que comprova o fato.
- mesmo_fato_que: se a notícia descreve o mesmo fato de outra notícia do lote (outro veículo, outra
  manchete), o id dessa outra notícia; senão, string vazia."""


def esquema(tipos: list[str], ruido: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {"itens": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "empresa_certa": {"type": "boolean"},
                "relevante": {"type": "boolean"},
                "motivo_ruido": {"type": "string", "enum": ruido + ["outra_empresa", "nenhum"]},
                "tipo": {"type": "string", "enum": tipos + ["nenhum"]},
                "confianca": {"type": "number"},
                "membro_comite": {"type": "string", "enum": list(MEMBROS)},
                "por_que_agora": {"type": "string"},
                "trecho": {"type": "string"},
                "mesmo_fato_que": {"type": "string"},
            },
            "required": ["id", "empresa_certa", "relevante", "motivo_ruido", "tipo", "confianca", "membro_comite",
                         "por_que_agora", "trecho", "mesmo_fato_que"],
            "additionalProperties": False,
        }}},
        "required": ["itens"],
        "additionalProperties": False,
    }


def montar_pedido(conta: dict, itens: list[dict], taxonomia: Taxonomia) -> str:
    tipos = "\n".join(f"- {t.id}: {t.rotulo}" for t in taxonomia.tipos_para_noticias(conta.get("braco_icp"))
                      if t.palavras_chave or t.id == "expansao_negocio")  # os tipos de conector não vêm de notícia
    ruido = ", ".join(taxonomia.ruido)
    dados_conta = {k: conta.get(k) for k in ("nome_fantasia", "razao_social", "braco_icp", "subsegmento", "cidade", "uf", "dominio")}
    dados_conta["aliases"] = conta.get("aliases", [])
    noticias = [{k: i.get(k) for k in ("id", "titulo", "veiculo", "data_publicacao", "trecho")} for i in itens]
    return (f"Conta:\n{json.dumps(dados_conta, ensure_ascii=False)}\n\n"
            f"Tipos de sinal válidos para esta conta:\n{tipos}\n\nCategorias de ruído: {ruido}\n\n"
            f"Notícias:\n{json.dumps(noticias, ensure_ascii=False, indent=1)}")


class ClassificadorClaude:
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

    def classificar(self, conta: dict, itens: list[dict], taxonomia: Taxonomia) -> list[Decisao]:
        decisoes: list[Decisao] = []
        for i in range(0, len(itens), LOTE):
            lote = itens[i: i + LOTE]
            respostas = {r.get("id"): r for r in self._chamar(conta, lote, taxonomia)}
            ids = {it["id"] for it in lote}
            for it in lote:
                if it["id"] in respostas:  # notícia sem resposta fica pendente para a próxima rodada
                    decisoes.append(validar(it, respostas[it["id"]], taxonomia, conta.get("braco_icp"), ids, self.nome))
        return decisoes

    def _chamar(self, conta: dict, lote: list[dict], taxonomia: Taxonomia) -> list[dict]:
        import anthropic

        tipos = [t.id for t in taxonomia.tipos_para_noticias(conta.get("braco_icp"))]
        params = dict(
            model=self.modelo,
            max_tokens=16000,
            system=SISTEMA,
            messages=[{"role": "user", "content": montar_pedido(conta, lote, taxonomia)}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": esquema(tipos, list(taxonomia.ruido))}},
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
            raise ClassificacaoFalhou("a resposta foi cortada (max_tokens); diminua o lote")
        texto = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        try:
            return json.loads(texto).get("itens", [])
        except json.JSONDecodeError as e:
            raise ClassificacaoFalhou(f"resposta fora do formato combinado: {e}") from e


# ------------------------------------------------------------------------------------------ regras

class ClassificadorRegras:
    """Sem chave da API: palavras-chave do sinais.yaml. Nunca cria alerta (confiança 0,5 < limiar)."""

    nome = "regras"
    CONFIANCA = 0.5

    def classificar(self, conta: dict, itens: list[dict], taxonomia: Taxonomia) -> list[Decisao]:
        decisoes = []
        tipos = [t for t in taxonomia.tipos_para_noticias(conta.get("braco_icp")) if t.palavras_chave]
        for it in itens:
            texto = _norm(f"{it['titulo']} {it.get('trecho') or ''}")
            ruido = next((cat for cat, termos in taxonomia.ruido.items() if any(_cita(texto, t) for t in termos)), None)
            if ruido:
                decisoes.append(Decisao(it["id"], True, False, None, self.CONFIANCA, None, "", "", None, ruido, self.nome))
                continue
            tipo = next((t for t in tipos if any(_cita(texto, p) for p in t.palavras_chave)), None)
            if tipo is None:
                decisoes.append(Decisao(it["id"], True, False, None, 0.0, None, "", "", None, "sem tipo", self.nome))
                continue
            decisoes.append(Decisao(it["id"], True, True, tipo.id, self.CONFIANCA, tipo.membro_comite,
                                    f"{tipo.rotulo}: {it['titulo']}", it["titulo"], None, "", self.nome))
        return decisoes


def _cita(texto_norm: str, termo: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(_norm(termo))}(?![a-z0-9])", texto_norm))


def padrao():
    return ClassificadorClaude() if config.valor("ANTHROPIC_API_KEY") else ClassificadorRegras()


# ------------------------------------------------------------------------------------------ pipeline

@dataclass
class Resultado:
    itens: int = 0
    alertas: int = 0
    revisar: int = 0
    ruido: int = 0
    duplicados: int = 0
    pendentes: int = 0
    falhas: list[str] = field(default_factory=list)


ROTULO = {"sinal": "sinal", "revisar": "revisar", "ruido": "ruído", "outra_empresa": "outra empresa",
          "sem_tipo": "sem tipo", "duplicado": "mesmo evento"}


def pendentes(conn, contas: list[str] | None = None, limite: int | None = None) -> dict[str, list[dict]]:
    sql = """select i.* from itens_brutos i join contas c on c.id = i.conta_id
             where i.conector = 'noticias' and i.classificacao is null"""
    args: list = []
    if contas:
        sql += f" and i.conta_id in ({', '.join('?' for _ in contas)})"
        args += contas
    sql += " order by coalesce(c.tier, 'Z'), i.conta_id, i.data_publicacao"
    if limite:
        sql += " limit ?"
        args.append(limite)
    grupos: dict[str, list[dict]] = {}
    for r in conn.execute(sql, args):
        grupos.setdefault(r["conta_id"], []).append(dict(r))
    return grupos


def classificar(conn, classificador, taxonomia: Taxonomia, dry_run: bool = False, contas: list[str] | None = None,
                limite: int | None = None, saida=print) -> Resultado:
    res = Resultado()
    grupos = pendentes(conn, contas, limite)
    saida(f"== classificador {classificador.nome}: {sum(map(len, grupos.values()))} notícia(s) de {len(grupos)} conta(s)"
          + ("  (DRY-RUN: nada será gravado)" if dry_run else ""))
    for conta_id, itens in grupos.items():
        conta = dict(conn.execute("select * from contas where id = ?", (conta_id,)).fetchone())
        conta["aliases"] = [r["termo"] for r in conn.execute("select termo from aliases where conta_id = ? and ativo", (conta_id,))]
        saida(f"-- {conta_id} {conta['nome_fantasia']}: {len(itens)} notícia(s)")
        if dry_run and isinstance(classificador, ClassificadorClaude):
            chamadas = -(-len(itens) // LOTE)
            saida(f"   (simulado) enviaria {len(itens)} notícia(s) ao Claude em {chamadas} chamada(s)")
            res.itens += len(itens)
            continue
        try:
            decisoes = classificador.classificar(conta, itens, taxonomia)
        except ClassificacaoFalhou as e:
            res.falhas.append(f"{conta_id}: {e}")
            saida(f"   ERRO: {e} (as notícias continuam pendentes)")
            continue
        _aplicar(conn, conta, itens, decisoes, taxonomia, res, saida)
        sem_resposta = len(itens) - len(decisoes)
        if sem_resposta:
            res.pendentes += sem_resposta
            saida(f"   {sem_resposta} notícia(s) sem resposta do modelo: continuam pendentes")
        if dry_run:
            conn.rollback()
        else:
            conn.commit()
    saida(f"== fim: {res.itens} notícia(s): {res.alertas} alerta(s), {res.revisar} para revisar, {res.ruido} ruído, "
          f"{res.duplicados} no mesmo evento; {res.pendentes} pendente(s); {len(res.falhas)} falha(s)")
    if not dry_run:
        completados = completar_sinais_de_conectores(conn, taxonomia)
        if completados:
            saida(f"   {completados} sinal(is) de CNPJ/Apollo receberam peso, ângulo e 'por que agora' da taxonomia")
    return res


def _aplicar(conn, conta: dict, itens: list[dict], decisoes: list[Decisao], taxonomia: Taxonomia, res: Resultado, saida) -> None:
    por_id = {i["id"]: i for i in itens}
    # Mesmo fato apontado pelo modelo: a notícia passa para o evento da outra.
    for d in decisoes:
        if d.mesmo_fato_que and d.mesmo_fato_que in por_id:
            por_id[d.item_id]["evento_id"] = por_id[d.mesmo_fato_que]["evento_id"]
            conn.execute("update itens_brutos set evento_id = ? where id = ?", (por_id[d.item_id]["evento_id"], d.item_id))
    eventos: dict[str, list[Decisao]] = {}
    for d in decisoes:
        item = por_id[d.item_id]
        res.itens += 1
        if d.relevante:
            eventos.setdefault(item["evento_id"] or item["id"], []).append(d)
            continue
        estado = "outra_empresa" if not d.empresa_certa else ("sem_tipo" if d.motivo == "sem tipo" else "ruido")
        _marcar(conn, d.item_id, estado, d.motivo)
        res.ruido += 1
        saida(f"   {ROTULO[estado]:<13} {item['titulo'][:90]}  ({d.motivo})")

    for evento_id, ds in eventos.items():
        melhor = max(ds, key=lambda d: d.confianca)
        item = por_id[melhor.item_id]
        existente = conn.execute("select id from sinais where conta_id = ? and evento_id = ?", (conta["id"], evento_id)).fetchone()
        if existente:
            for d in ds:
                _marcar(conn, d.item_id, "duplicado", f"evento já tinha o sinal {existente['id']}")
            res.duplicados += len(ds)
            saida(f"   mesmo evento  {item['titulo'][:90]}  (sinal {existente['id']} já existia)")
            continue
        tipo = taxonomia.tipo(melhor.tipo, conta.get("braco_icp"))
        status = "alerta" if melhor.confianca >= taxonomia.limiar_confianca else "revisar"
        datas = [por_id[d.item_id]["data_publicacao"] for d in ds if por_id[d.item_id]["data_publicacao"]]
        sinal_id = novo_id()
        conn.execute(
            """insert into sinais (id, conta_id, tipo, evento_id, peso, confianca, membro_comite, angulo, evidencia_url,
                                   evidencia_trecho, data_fato, data_alerta, status, item_id, por_que_agora, classificador)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (sinal_id, conta["id"], tipo.id, evento_id, tipo.peso, round(melhor.confianca, 2),
             melhor.membro_comite or tipo.membro_comite, tipo.angulo_sugerido, item["url"], melhor.trecho,
             min(datas) if datas else None, agora(), status, item["id"], melhor.por_que_agora, melhor.classificador),
        )
        for d in ds:
            principal = d.item_id == melhor.item_id
            _marcar(conn, d.item_id, ("sinal" if status == "alerta" else "revisar") if principal else "duplicado",
                    f"sinal {sinal_id}" + ("" if principal else " (outra notícia do mesmo evento)"))
        res.alertas += status == "alerta"
        res.revisar += status == "revisar"
        res.duplicados += len(ds) - 1
        extra = f" +{len(ds) - 1} veículo(s)" if len(ds) > 1 else ""
        saida(f"   {status:<13} {tipo.id} ({melhor.confianca:.2f}){extra}: {item['titulo'][:80]}")
        if melhor.por_que_agora:
            saida(f"                 por que agora: {melhor.por_que_agora[:140]}")


def _marcar(conn, item_id: str, estado: str, motivo: str) -> None:
    conn.execute("update itens_brutos set classificacao = ?, classificacao_motivo = ?, classificado_em = ? where id = ?",
                 (estado, motivo, agora(), item_id))


def completar_sinais_de_conectores(conn, taxonomia: Taxonomia) -> int:
    """Sinais de CNPJ e Apollo nascem sem peso nem ângulo: a taxonomia completa."""
    n = 0
    for s in conn.execute("""select s.*, c.braco_icp from sinais s join contas c on c.id = s.conta_id
                             where s.peso is null or s.angulo is null or s.por_que_agora is null""").fetchall():
        tipo = taxonomia.tipo(s["tipo"], s["braco_icp"])
        if tipo is None:
            continue
        conn.execute(
            "update sinais set peso = coalesce(peso, ?), angulo = coalesce(angulo, ?), membro_comite = coalesce(membro_comite, ?), "
            "por_que_agora = coalesce(por_que_agora, ?) where id = ?",
            (tipo.peso, tipo.angulo_sugerido, tipo.membro_comite, f"{tipo.rotulo}: {s['evidencia_trecho']}", s["id"]),
        )
        n += 1
    conn.commit()
    return n
