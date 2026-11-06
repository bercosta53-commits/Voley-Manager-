"""Envia os sinais do radar para o painel (caixa "Captados pela IA" do Radar de Sinais publicado no claude.ai).

1. BUSCA    Lê no banco do radar os sinais em alerta ou em revisão, com data do fato nos últimos 90 dias, que ainda não
            foram enviados ao painel (ou todos, com --reenviar).
2. TRADUZ   Converte cada sinal para o formato da caixa do painel: a conta do painel, o tipo do catálogo do painel, a
            data, um resumo de até 15 palavras, a pessoa envolvida (quando houver), a fonte, o link e o trecho que
            comprova. O tipo do radar vira o tipo mais próximo do painel; nos tipos de pessoa e de vaga, o título
            decide (vaga de SDR vira vaga_sdr, novo diretor de marketing vira novo_cmo, e assim por diante).
3. COMPARA  Descarta o que o painel não tem como receber: tipo sem equivalente no catálogo (saída de sócio, mudança
            de capital...), conta que não existe no painel e repetição da mesma conta e do mesmo tipo em 30 dias.
4. ENTREGA  Grava um arquivo JSON com os documentos prontos para a coleção espacos/<espaço>/caixa, em lotes de até
            50 (o limite de uma gravação no banco do painel). Quem grava no painel é o Claude, com a ferramenta de
            dados do artifact; o radar não tem acesso direto ao banco do link. No painel, cada sinal espera
            aprovação na caixa: nada entra na fila sem uma pessoa aprovar.

A conta do painel é achada pela raiz do CNPJ (o painel usa o id cnpj-<raiz>), pelo domínio ou pelo nome. Sem o
arquivo de contas do painel, vale só a raiz do CNPJ.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from .db import agora
from .identidade import normalizar_dominio, normalizar_nome, sem_acentos

LOTE = 50
JANELA_DIAS = 90
REPETICAO_DIAS = 30

# Tipo do radar -> tipo do painel. None: o painel não tem tipo equivalente.
MAPA = {
    "entrada_socio": "novos_socios",
    "socio_entrou": "novos_socios",
    "saida_socio": None,
    "socio_saiu": None,
    "nova_area_pratica": "lancamento_produto",
    "novo_produto": "lancamento_produto",
    "novo_escritorio": "nova_filial",
    "expansao_rede": "nova_filial",
    "fusao_escritorios": "fusao_aquisicao",
    "fusao_aquisicao": "fusao_aquisicao",
    "fusao_singulares": "incorporacao_cooperativas",
    "norma_regulatoria": "norma_nova",
    "rodada_investimento": "rodada_investimento",
    "membro_mudou_de_empresa": "champion_mudou",
    "capital_mudou": None,
    "situacao_mudou": None,
    "sede_mudou": None,
    "anuncio_comecou": "comecou_anuncios",
    "anuncio_canal_novo": "comecou_anuncios",
    "anuncio_parou": "pausou_anuncios",
    "anuncio_destino_novo": "nova_landing",
    "anuncio_mensagem_nova": None,
    "anuncio_volume": None,
    "infraestrutura_sem_operacao": None,
}
TIPOS_DE_PESSOA = {"troca_diretoria", "troca_c_level", "administracao_mudou", "pessoa_nova_cargo_alvo", "membro_mudou_de_cargo"}
TIPOS_DE_VAGA = {"vaga_lideranca_receita", "vaga_marketing_growth", "vaga_comercial"}

# A primeira regra que casa com o texto (sem acento, minúsculo) decide o tipo.
REGRAS_VAGA = [
    (r"\b(sdr|bdr|inside sales|pre[- ]?vendas?|pre[- ]?venda|prospec)", "vaga_sdr"),
    (r"\b(revops|revenue operations|crm|automacao|hubspot|salesforce|sales ops)", "vaga_revops"),
    (r"\b(agencias?|agency|fornecedores)\b", "vaga_gestao_agencias"),
    (r"\b(dados|bi|analytics|analista de inteligencia)\b.*\bmarketing|\bmarketing\b.*\b(dados|bi|analytics)\b", "vaga_dados_marketing"),
    (r"\b(marketing|growth|midia|trafego|performance|conteudo|brand|marca|comunicacao|demand gen)", "vaga_marketing"),
    (r"\b(executivo|account|contas|comercial|vendas|negocios|key account|business development)", "vaga_executivo_regiao"),
]
REGRAS_PESSOA = [
    (r"\b(marketing|growth|cmo|marca)\b", "novo_cmo"),
    (r"\b(comercial|vendas|cro|receita|revenue|negocios|sales)\b", "novo_diretor_comercial"),
    (r"\b(socio[- ]diretor|managing partner|socio administrador)", "novo_socio_diretor"),
    (r"\b(ceo|presidente|superintendente|diretor[- ]geral|diretor executivo)\b", "novo_ceo"),
]
REGRAS_EXPANSAO = [
    (r"\b(novo estado|chega (a|ao)|estreia (em|no|na)|desembarca|expande para)\b", "novo_estado"),
    (r"\b(filial|filiais|agencias?|unidades?|inaugura|escritorio|sede nova|ponto de atendimento)\b", "nova_filial"),
    (r"\b(crescimento|cresce|cresceu|lucro|resultado|recorde|faturamento)\b", "resultado_crescimento"),
    (r"\b(lanca|lancamento|novo produto|nova linha|nova solucao)\b", "lancamento_produto"),
]
FONTES = {"anuncios": "Bibliotecas de anúncios", "cnpj": "Receita Federal (BrasilAPI)", "noticias": "Google News", "vagas": "Vagas", "apollo": "Apollo",
          "consultorias": "Consultoria de recrutamento", "regras": "Google News"}


def _texto(*partes) -> str:
    return sem_acentos(" ".join(p or "" for p in partes)).lower()


def tipo_no_painel(tipo: str, texto: str) -> str | None:
    t = _texto(texto)
    if tipo in TIPOS_DE_VAGA:
        for padrao, destino in REGRAS_VAGA:
            if re.search(padrao, t):
                return destino
        return "vaga_marketing" if tipo == "vaga_marketing_growth" else "vaga_executivo_regiao"
    if tipo in TIPOS_DE_PESSOA:
        if tipo == "membro_mudou_de_cargo" and re.search(r"\bmarketing|growth\b", t):
            return "promocao_marketing"
        for padrao, destino in REGRAS_PESSOA:
            if re.search(padrao, t):
                return destino
        return None
    if tipo == "expansao_negocio":
        for padrao, destino in REGRAS_EXPANSAO:
            if re.search(padrao, t):
                return destino
        return None  # parceria, evento e afins: o painel não tem tipo para isso
    return MAPA.get(tipo)


def resumo(texto: str, palavras: int = 15) -> str:
    texto = re.sub(r"^(vagas abertas|qsa na receita):\s*", "", (texto or "").strip(), flags=re.I)
    texto = re.sub(r"\s*\[[^\]]+\]", "", texto)  # tira "[Indeed]" das vagas
    p = texto.split()
    return " ".join(p[:palavras]) + ("…" if len(p) > palavras else "")


def pessoa_do_trecho(tipo: str, trecho: str) -> str:
    """Nome da pessoa quando o trecho traz (sócio da Receita, pessoa do comitê). Só o nome, nada além."""
    if tipo in TIPOS_DE_VAGA:
        return ""
    m = re.search(r":\s*([A-ZÀ-Ú][A-Za-zÀ-ú'. -]{3,60}?)\s*\(", trecho or "")
    return m.group(1).strip().title() if m else ""


# ------------------------------------------------------------------------------------------ contas do painel

@dataclass
class ContasDoPainel:
    por_raiz: dict[str, str] = field(default_factory=dict)
    por_dominio: dict[str, str] = field(default_factory=dict)
    por_nome: dict[str, str] = field(default_factory=dict)
    # (conta, tipo) -> datas dos sinais que o painel já tem, na lista de sinais ou na caixa (qualquer status)
    existentes: dict[tuple[str, str], list[str]] = field(default_factory=dict)
    docs_na_caixa: set[str] = field(default_factory=set)
    carregado: bool = False

    @classmethod
    def ler(cls, pasta: str | Path | None, espaco: str = "") -> "ContasDoPainel":
        """Lê o banco do painel baixado com a ferramenta de dados do artifact (list com out_dir).

        Aceita a pasta raiz do download (com espacos/<espaço>/partes e espacos/<espaço>/caixa) ou a própria pasta partes.
        """
        c = cls()
        if not pasta:
            return c
        pasta = Path(pasta)
        partes = pasta / "espacos" / espaco / "partes" if (pasta / "espacos").is_dir() else pasta
        caixa = partes.parent / "caixa"

        def conteudo(arq: Path) -> dict:
            doc = json.loads(arq.read_text(encoding="utf-8"))
            return doc.get("data") if isinstance(doc.get("data"), dict) else doc

        for arq in sorted(partes.glob("signals-*.json")):
            for x in conteudo(arq).get("items", []):
                c.existentes.setdefault((x.get("accountId"), x.get("type")), []).append(str(x.get("date") or "")[:10])
        for arq in sorted(caixa.glob("*.json")) if caixa.is_dir() else []:
            x = conteudo(arq)
            c.docs_na_caixa.add(arq.stem)
            c.existentes.setdefault((x.get("accountId"), x.get("type")), []).append(str(x.get("date") or "")[:10])
        for arq in sorted(partes.glob("accounts-*.json")):
            for a in conteudo(arq).get("items", []):
                if a.get("cnpjRoot"):
                    c.por_raiz[a["cnpjRoot"]] = a["id"]
                if a.get("dominio"):
                    c.por_dominio[a["dominio"]] = a["id"]
                if a.get("nome"):
                    c.por_nome.setdefault(normalizar_nome(a["nome"]), a["id"])
        c.carregado = True
        return c

    def ja_tem(self, conta_painel: str, tipo: str, data_fato: str, doc_id: str) -> bool:
        if doc_id in self.docs_na_caixa:
            return True
        return any(d and abs((date.fromisoformat(d) - date.fromisoformat(data_fato)).days) < REPETICAO_DIAS
                   for d in self.existentes.get((conta_painel, tipo), []))

    def achar(self, conta) -> str | None:
        raiz = conta["cnpj_raiz"]
        if not self.carregado:
            return f"cnpj-{raiz}" if raiz else None
        return ((raiz and self.por_raiz.get(raiz)) or (conta["dominio"] and self.por_dominio.get(normalizar_dominio(conta["dominio"])))
                or self.por_nome.get(normalizar_nome(conta["nome_fantasia"])))


# ------------------------------------------------------------------------------------------ exportação

@dataclass
class Resultado:
    documentos: list[dict] = field(default_factory=list)
    sem_tipo: list[str] = field(default_factory=list)
    sem_conta: list[str] = field(default_factory=list)
    repetidos: int = 0
    lidos: int = 0


def exportar(conn, espaco: str, contas_painel: ContasDoPainel, hoje: date | None = None, reenviar: bool = False,
             dry_run: bool = False, saida=print) -> Resultado:
    hoje = hoje or date.today()
    res = Resultado()
    # 1. BUSCA
    sql = """select s.*, c.nome_fantasia, c.cnpj_raiz, c.dominio, i.veiculo, i.conector as item_conector, i.titulo as item_titulo
             from sinais s join contas c on c.id = s.conta_id left join itens_brutos i on i.id = s.item_id
             where s.status in ('alerta', 'revisar') and coalesce(s.data_fato, substr(s.data_alerta, 1, 10)) >= ?"""
    if not reenviar:
        sql += " and s.enviado_painel_em is null"
    sql += " order by s.conta_id, coalesce(s.data_fato, s.data_alerta) desc"
    sinais = conn.execute(sql, ((hoje - timedelta(days=JANELA_DIAS)).isoformat(),)).fetchall()
    res.lidos = len(sinais)
    saida(f"== painel · espaço {espaco}: {len(sinais)} sinal(is) a enviar" + ("  (DRY-RUN: nada será gravado)" if dry_run else ""))
    vistos: dict[tuple[str, str], str] = {}
    enviados: list[tuple[str, str]] = []
    for s in sinais:
        # 2. TRADUZ
        texto = " ".join(filter(None, [s["evidencia_trecho"], s["item_titulo"]]))
        tipo = tipo_no_painel(s["tipo"], texto)
        # 3. COMPARA
        if not tipo:
            res.sem_tipo.append(f"{s['nome_fantasia']}: {s['tipo']}")
            continue
        conta_painel = contas_painel.achar(s)
        if not conta_painel:
            res.sem_conta.append(s["nome_fantasia"])
            continue
        data_fato = (s["data_fato"] or s["data_alerta"] or hoje.isoformat())[:10]
        anterior = vistos.get((conta_painel, tipo))
        if anterior and abs((date.fromisoformat(anterior) - date.fromisoformat(data_fato)).days) < REPETICAO_DIAS:
            res.repetidos += 1
            enviados.append((s["id"], ""))  # já coberto pelo sinal mais recente do mesmo tipo
            continue
        vistos[(conta_painel, tipo)] = data_fato
        doc_id = f"{conta_painel}--{tipo}--{data_fato}"
        if contas_painel.ja_tem(conta_painel, tipo, data_fato, doc_id):
            res.repetidos += 1
            enviados.append((s["id"], ""))  # o painel já tem esse fato (na caixa, aprovado ou descartado)
            continue
        fontes_da_vaga = sorted(set(re.findall(r"\[([^\]]+)\]", s["evidencia_trecho"] or ""))) if s["tipo"] in TIPOS_DE_VAGA else []
        fonte = (s["veiculo"] or " / ".join(fontes_da_vaga)
                 or FONTES.get(s["item_conector"] or s["classificador"] or "", s["classificador"] or "Radar"))
        res.documentos.append({"doc_id": doc_id, "data": {
            "accountId": conta_painel, "conta": s["nome_fantasia"], "type": tipo, "date": data_fato,
            "detail": resumo(s["evidencia_trecho"] or s["item_titulo"] or ""), "person": pessoa_do_trecho(s["tipo"], s["evidencia_trecho"]),
            "source": fonte, "url": s["evidencia_url"] or "", "evidence": (s["evidencia_trecho"] or "")[:500],
            "captadoEm": agora(), "status": "pendente", "origem": f"radar_abm:{s['tipo']}",
        }})
        enviados.append((s["id"], doc_id))
        saida(f"   {data_fato}  {s['nome_fantasia'][:30]:<30} {s['tipo']:<24} -> {tipo}")
    # 4. ENTREGA
    if not dry_run:
        for sinal_id, doc_id in enviados:
            conn.execute("update sinais set enviado_painel_em = ?, painel_doc_id = ? where id = ?", (agora(), doc_id or None, sinal_id))
        conn.commit()
    saida(f"== {len(res.documentos)} documento(s) para a caixa · {len(res.sem_tipo)} sem tipo no painel · "
          f"{len(res.sem_conta)} sem conta no painel · {res.repetidos} repetido(s) em {REPETICAO_DIAS} dias")
    return res


def lotes(espaco: str, documentos: list[dict]) -> list[list[dict]]:
    """Gravações no formato da ferramenta de dados do artifact (batch), em lotes de até 50."""
    writes = [{"op": "set", "collection": f"espacos/{espaco}/caixa", "doc_id": d["doc_id"], "data": d["data"]} for d in documentos]
    return [writes[i:i + LOTE] for i in range(0, len(writes), LOTE)]
