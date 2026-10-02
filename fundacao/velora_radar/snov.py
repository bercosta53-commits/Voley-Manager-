"""Importa o export de pessoas do Snov.io: uma linha por pessoa, não por conta.

Ao contrário de importar.py (planilha com uma linha por conta e um decisor opcional), aqui várias
linhas costumam pertencer à mesma empresa — a conta nasce da agregação do grupo inteiro, não de uma
linha isolada, e cada linha vira (ou atualiza) uma pessoa.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import psycopg

from . import rubrica
from .identidade import (
    dominio_generico,
    normalizar_chave,
    normalizar_dominio,
    normalizar_linkedin,
    normalizar_nome,
    sem_acentos,
)
from .local_br import interpretar_local

# ---------- 1. leitura tolerante do cabeçalho ----------

# Cada chave já normalizada (normalizar_chave aplicado ao nome da coluna como o Snov costuma exportar).
ALIASES: dict[str, list[str]] = {
    "nome_completo": ["full_name", "nome", "nome_completo"],
    "primeiro_nome": ["first_name"],
    "sobrenome": ["last_name"],
    "cargo": ["position", "job_title", "title", "cargo"],
    "empresa": ["company_name", "company", "empresa"],
    "site": ["company_site", "company_url", "website", "site"],
    "dominio": ["domain", "dominio"],  # reserva do site: a conta fica com o que vier preenchido
    "email": ["email", "email_address"],
    "email_status": ["email_status", "validacao_contato"],
    "linkedin": ["linkedin", "linkedin_url", "social_url"],
    "telefone": ["phone", "phone_number", "telefone"],
    "setor": ["industry", "setor"],
    "nicho": ["nicho"],
    "porte": ["company_size", "employees", "porte"],
    # curadoria da conta (planilha enriquecida r13+)
    "prioridade": ["prioridade"],
    "lote": ["tier", "lote"],
    "criterio_icp": ["criterio_icp"],
    "regiao_sourcing": ["regiao_sourcing"],
    "fonte_conta": ["fonte_conta"],
    "location": ["location"],
    "country": ["country", "pais"],
    "city": ["city", "cidade"],
    "state": ["state", "uf", "estado"],
}


def ler_csv(caminho: str | Path) -> tuple[list[dict[str, str]], list[str]]:
    """Lê o CSV e devolve (linhas com as chaves internas do importador, colunas do arquivo sem mapeamento)."""
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)
        colunas_arquivo = leitor.fieldnames or []
        cabecalho_norm = {normalizar_chave(c): c for c in colunas_arquivo}

        mapa: dict[str, str] = {}  # campo interno -> nome da coluna no arquivo
        usadas: set[str] = set()
        for campo, aliases in ALIASES.items():
            for alias in aliases:
                if alias in cabecalho_norm:
                    mapa[campo] = cabecalho_norm[alias]
                    usadas.add(cabecalho_norm[alias])
                    break
        nao_mapeadas = [c for c in colunas_arquivo if c not in usadas]

        linhas: list[dict[str, str]] = []
        for i, bruta in enumerate(leitor):
            linha = _mapear_linha(bruta, mapa)
            linha["_linha"] = i + 2  # 1 do cabeçalho + 1 porque a planilha começa a contar em 1, não 0
            linhas.append(linha)
    return linhas, nao_mapeadas


CAMPOS_CURADORIA = ("prioridade", "lote", "criterio_icp", "regiao_sourcing", "fonte_conta")


def regiao_validada(regiao_sourcing: str) -> bool:
    """O sourcing declarou que já filtrou a conta pelo recorte (SP/PR/SC/RS)? "Brasil / operação relevante"
    não basta: é escopo nacional, a UF ainda decide."""
    v = sem_acentos(regiao_sourcing or "").lower()
    return "regiao validada" in v or "sp/pr/sc/rs" in v


def _pegar(bruta: dict[str, str], mapa: dict[str, str], campo: str) -> str:
    coluna = mapa.get(campo)
    return (bruta.get(coluna) or "").strip() if coluna else ""


def _mapear_linha(bruta: dict[str, str], mapa: dict[str, str]) -> dict[str, str]:
    nome = _pegar(bruta, mapa, "nome_completo")
    if not nome:
        nome = " ".join(p for p in (_pegar(bruta, mapa, "primeiro_nome"), _pegar(bruta, mapa, "sobrenome")) if p)
    # Listas montadas à mão trazem setor e nicho separados; o nicho é o que diferencia as contas.
    setor = " · ".join(p for p in (_pegar(bruta, mapa, "setor"), _pegar(bruta, mapa, "nicho")) if p)
    local = _pegar(bruta, mapa, "location")
    if not local:
        local = ", ".join(p for p in (_pegar(bruta, mapa, "city"), _pegar(bruta, mapa, "state"), _pegar(bruta, mapa, "country")) if p)
    return {
        "nome": nome,
        "cargo": _pegar(bruta, mapa, "cargo"),
        "empresa": _pegar(bruta, mapa, "empresa"),
        "site": _pegar(bruta, mapa, "site") or _pegar(bruta, mapa, "dominio"),
        "email": _pegar(bruta, mapa, "email"),
        "email_status": _pegar(bruta, mapa, "email_status"),
        "linkedin": _pegar(bruta, mapa, "linkedin"),
        "telefone": _pegar(bruta, mapa, "telefone"),
        "setor": setor,
        "porte": _pegar(bruta, mapa, "porte"),
        "local_bruto": local,
        **{c: _pegar(bruta, mapa, c) for c in CAMPOS_CURADORIA},
    }


# ---------- 2. chave da conta ----------


def chave_da_conta(linha: dict[str, str]) -> tuple[str, str]:
    """(tipo, chave): tipo 'dominio' (forte, agrupa linhas de site e e-mail que batem) ou 'nome' (fraco)."""
    dominio = normalizar_dominio(linha["site"])
    if not dominio or dominio_generico(dominio):
        dominio_email = normalizar_dominio(linha["email"]) if "@" in linha["email"] else None
        if dominio_email and not dominio_generico(dominio_email):
            dominio = dominio_email
        else:
            dominio = None
    if dominio:
        return "dominio", dominio
    return "nome", normalizar_nome(linha["empresa"])


# ---------- 5. cargo -> nível, área, papel ----------

# Siglas e palavras curtas casam só como palavra inteira: "cto" não pode casar com "director", nem
# "coo" com "coordenador"/"cooperativa", nem "cro" com "micro". Termos longos casam como trecho.
_C_LEVEL = [
    "ceo", "cfo", "cmo", "coo", "cro", "cco", "cgo", "cmso", "chro", "presidente", "president", "fundador", "fundadora",
    "founder", "owner", "proprietario", "proprietaria", "dono", "dona", "socio", "socia", "partner",
]
_CHIEF_OFFICER = re.compile(r"\bchie\w*\b.*\bofficer\b")  # "Chief Growth Officer", e o erro de digitação "Chieff"
_VICE = re.compile(r"\bvice[\s-]*presiden\w*")
_VP_DIRETOR_QUALIFICA_HEAD = ["global", "regional", "executiv", "latam", "brasil", "brazil", "corporat"]
_VP_DIRETOR = ["diretor", "diretora", "director", "superintendente", "vice-presidente", "vice presidente", "vice president", "vp"]
_GERENTE_HEAD = ["gerente", "manager", "head", "lider", "lead"]

_AREAS: list[tuple[str, list[str]]] = [
    # ordem importa: a primeira área cujo termo aparecer no cargo vence.
    ("geral", ["ceo", "presidente", "president", "fundador", "fundadora", "founder", "owner", "proprietario",
               "proprietaria", "socio", "socia", "partner", "diretor geral", "diretora geral", "diretoria executiva",
               "diretor executivo", "diretora executiva", "executive director", "managing director", "general manager",
               "diretor administrativo", "diretora administrativa", "administrador", "administradora", "country manager"]),
    ("financeiro", ["financeiro", "financeira", "finance", "financial", "cfo", "controladoria", "controller"]),
    ("marketing", ["marketing", "cmo", "cmso", "brand"]),
    ("comercial", ["comercial", "commercial", "vendas", "sales", "growth", "cgo", "cco", "crescimento", "negocios", "business",
                   "relacionamento", "revenue", "cro"]),
    ("compras", ["compras", "suprimentos", "procurement", "supply"]),
    ("juridico", ["juridico", "compliance", "legal", "dpo", "data protection"]),
    ("ti", ["tecnologia", "technology", "ti", "it", "cto", "cio", "sistemas", "dados", "data", "engenharia de software"]),
    ("operacoes", ["operacoes", "operacional", "operations", "ops", "coo", "producao", "logistica"]),
    ("rh", ["recursos humanos", "rh", "chro", "people", "gente e gestao", "human resources"]),
]


def _tem(texto: str, termos: list[str]) -> bool:
    for t in termos:
        if len(t) <= 4 and t.isalpha():
            if re.search(rf"\b{t}\b", texto):
                return True
        elif t in texto:
            return True
    return False


@dataclass
class Classificacao:
    nivel: str | None  # 'c_level' | 'vp_diretor' | 'gerente_head' | None
    area: str | None
    papel_icp: str | None  # 'pagador' | 'dono_problema' | 'guardiao' | 'influenciador' | None


def classificar_cargo(cargo: str) -> Classificacao:
    texto = f" {sem_acentos(cargo).lower().strip()} "
    if not texto.strip():
        return Classificacao(None, None, None)
    # "vice-presidente" é diretoria, não presidência: some do texto usado para C-level e área geral.
    sem_vice = _VICE.sub(" vp ", texto)

    if _tem(sem_vice, _C_LEVEL) or _CHIEF_OFFICER.search(texto):
        nivel = "c_level"
    elif _tem(sem_vice, _VP_DIRETOR) or ("head" in texto and _tem(texto, _VP_DIRETOR_QUALIFICA_HEAD)):
        nivel = "vp_diretor"
    elif _tem(texto, _GERENTE_HEAD):
        nivel = "gerente_head"
    else:
        nivel = None

    area = next((a for a, termos in _AREAS if _tem(sem_vice, termos)), None)
    if area is None and nivel == "vp_diretor":
        area = "geral"  # "Diretor", "Diretora" sem área: em empresa média, é a diretoria da casa

    if area in ("compras", "juridico", "ti") and nivel != "c_level" or (
        nivel == "c_level" and area in ("juridico", "ti")
    ):
        papel = "guardiao"  # CTO, CIO e DPO vetam ou destravam, mas não pagam a conta de marketing
    elif nivel == "c_level" or (nivel == "vp_diretor" and area in ("financeiro", "geral")):
        papel = "pagador"
    elif area in ("marketing", "comercial") and nivel in ("gerente_head", "vp_diretor"):
        papel = "dono_problema"
    else:
        # "demais": cargo preenchido (garantido pelo "return" no topo da função) que não bateu em nenhuma
        # regra acima — analista, coordenador, especialista... Só fica nulo (fila "a classificar") quando
        # o cargo vier vazio, tratado antes de chegar aqui.
        papel = "influenciador"
    return Classificacao(nivel, area, papel)


_PAPEL_COMITE_DE = {  # espelha em papel_comite (001), para vw_planilha e o catálogo de sinais continuarem servidos
    "pagador": "decisor",
    "dono_problema": "campeao",
    "guardiao": "bloqueador",
    "influenciador": "influenciador",
    None: "indefinido",
}


def mapear_email_status(bruto: str) -> str:
    v = sem_acentos(bruto).lower().strip().replace("-", "_").replace(" ", "_")
    if v in ("valid", "alta"):  # "alta": validação de contato da planilha enriquecida
        return "verificado"
    if v.startswith("media"):
        return "provavel"
    if v.startswith("baixa"):
        return "invalido"
    if v in ("unknown", "catch_all", "catchall", "accept_all"):
        return "provavel"
    if v in ("invalid", "not_valid"):
        return "invalido"
    return "desconhecido"


# ---------- 3+4+9: agregação, merge, pessoa, localização ----------

UFS_ICP_PADRAO = ("SP", "PR", "SC", "RS")


@dataclass
class RelatorioSnov:
    arquivo: str = ""
    linhas: int = 0
    colunas_nao_mapeadas: list[str] = field(default_factory=list)
    pessoas_criadas: int = 0
    pessoas_duplicadas: int = 0
    contas_criadas: int = 0
    contas_mescladas: int = 0
    contas_fora_do_brasil: int = 0
    conflitos: int = 0
    distribuicao_papel: dict[str, int] = field(default_factory=dict)
    distribuicao_uf: dict[str, int] = field(default_factory=dict)
    fora_do_recorte: int = 0
    pct_email_verificado: float = 0.0
    contas_sem_icp: int = 0
    contas_fit_por_regiao_sourcing: int = 0
    distribuicao_prioridade: dict[str, int] = field(default_factory=dict)
    top_contas: list[dict] = field(default_factory=list)


def _registrar_conflito(conn, rel: "RelatorioSnov", importacao: str, tipo: str, conta_id=None, pessoa_id=None, detalhe: str = "", linha: int | None = None) -> None:
    conn.execute(
        "insert into importacao_conflito (importacao, tipo, conta_id, pessoa_id, detalhe, linha_origem) values (%s, %s, %s, %s, %s, %s)",
        (importacao, tipo, conta_id, pessoa_id, detalhe, linha),
    )
    rel.conflitos += 1


def _achar_conta_existente(conn, dominio: str | None, nome_norm: str | None):
    """Checa por domínio e por nome, sempre os dois: uma empresa pode ter linhas que só dão o nome (sem
    site, com e-mail genérico) e linhas com domínio — sem isso, as duas formam contas duplicadas."""
    if dominio:
        c = conn.execute("select * from conta where dominio = %s", (dominio,)).fetchone()
        if c:
            return c
    if nome_norm:
        candidatas = conn.execute("select * from conta where nome_normalizado = %s", (nome_norm,)).fetchall()
        if len(candidatas) == 1:
            return candidatas[0]
    return None


def _moda(valores: list[str]) -> str | None:
    vistos = [v for v in valores if v]
    return Counter(vistos).most_common(1)[0][0] if vistos else None


def _agregar_grupo(conn, rel: "RelatorioSnov", importacao: str, tipo_chave: str, chave: str, grupo: list[dict], linha_num0: int) -> dict:
    """Cria (ou mescla com a base-mãe) a conta do grupo. Devolve a linha de `conta`."""
    nome_empresa = _moda([l["empresa"] for l in grupo]) or (chave if tipo_chave == "nome" else chave)
    nome_norm = normalizar_nome(nome_empresa)
    setor = _moda([l["setor"] for l in grupo])
    porte = _moda([l["porte"] for l in grupo])
    curadoria = {c: _moda([l.get(c, "") for l in grupo]) for c in CAMPOS_CURADORIA}
    if curadoria["prioridade"]:
        curadoria["prioridade"] = curadoria["prioridade"].strip().upper() or None
        if curadoria["prioridade"] and not re.fullmatch(r"P[0-9]", curadoria["prioridade"]):
            curadoria["prioridade"] = None
    validada = any(regiao_validada(l.get("regiao_sourcing", "")) for l in grupo)

    locais = [interpretar_local(l["local_bruto"]) for l in grupo]
    no_brasil = [loc for loc in locais if loc.pais == "Brasil"]
    # "desconhecido" (campo vazio) não vota: não é sinal de que a empresa é de fora, só falta o dado.
    fora = [loc for loc in locais if loc.pais not in ("Brasil", "desconhecido")]
    etapa = "descartada" if fora and len(fora) > len(no_brasil) else "ativa"
    motivo = "fora do Brasil" if etapa == "descartada" else None
    uf = _moda([loc.uf for loc in no_brasil]) if etapa == "ativa" else None
    cidade = _moda([loc.cidade for loc in no_brasil]) if etapa == "ativa" else None

    dominio = chave if tipo_chave == "dominio" else None
    existente = _achar_conta_existente(conn, dominio, nome_norm)

    if existente is None:
        conta = conn.execute(
            """insert into conta (nome, nome_normalizado, dominio, uf, cidade, setor, porte, origem, etapa, motivo_descarte,
                                  prioridade, lote, criterio_icp, regiao_sourcing, fonte_conta, regiao_validada)
               values (%s, %s, %s, %s, %s, %s, %s, 'snov', %s, %s, %s, %s, %s, %s, %s, %s) returning *""",
            (nome_empresa, nome_norm, dominio, uf, cidade, setor, porte, etapa, motivo,
             curadoria["prioridade"], curadoria["lote"], curadoria["criterio_icp"], curadoria["regiao_sourcing"],
             curadoria["fonte_conta"], validada),
        ).fetchone()
        return conta, True

    # Base-mãe: preenche o que falta, nunca sobrescreve o que já tem — divergência vira conflito.
    propostos = {"uf": uf, "cidade": cidade, "setor": setor, "porte": porte, **curadoria}
    sets: dict[str, object] = {}
    for campo, valor in propostos.items():
        if not valor:
            continue
        atual = existente[campo]
        if atual is None:
            sets[campo] = valor
        elif str(atual) != str(valor):
            _registrar_conflito(
                conn, rel, importacao, "campo_divergente", conta_id=existente["id"],
                detalhe=f"{campo}: conta tem '{atual}', Snov trouxe '{valor}' (mantido o que já havia)", linha=linha_num0,
            )
    if validada and not existente["regiao_validada"]:
        sets["regiao_validada"] = True
    if dominio and not existente["dominio"]:
        dono = conn.execute("select id from conta where dominio = %s", (dominio,)).fetchone()
        if not dono:
            sets["dominio"] = dominio
    if sets:
        colunas = ", ".join(f"{k} = %({k})s" for k in sets)
        conn.execute(f"update conta set {colunas}, atualizado_em = now() where id = %(id)s", {**sets, "id": existente["id"]})
    return conn.execute("select * from conta where id = %s", (existente["id"],)).fetchone(), False


def _upsert_pessoa(conn, rel: "RelatorioSnov", importacao: str, conta_id, linha: dict, linha_num: int) -> tuple[bool, bool, str | None]:
    """(criada, duplicada_descartada, papel_icp). Dedupe: linkedin normalizado > e-mail > nome+conta."""
    if not linha["nome"]:
        return False, True, None
    linkedin_norm = normalizar_linkedin(linha["linkedin"])
    email = linha["email"].lower() or None

    existente = None
    if linkedin_norm:
        existente = conn.execute("select * from pessoa where linkedin_normalizado = %s", (linkedin_norm,)).fetchone()
    if existente is None and email:
        existente = conn.execute("select * from pessoa where lower(email) = %s", (email,)).fetchone()
    if existente is None:
        existente = conn.execute("select * from pessoa where conta_id = %s and nome = %s", (conta_id, linha["nome"])).fetchone()

    cls = classificar_cargo(linha["cargo"])
    status = mapear_email_status(linha["email_status"])
    papel_comite = _PAPEL_COMITE_DE[cls.papel_icp]

    if existente is None:
        conn.execute(
            """insert into pessoa (conta_id, nome, cargo, papel_comite, papel_icp, email, email_status,
                                    linkedin, linkedin_normalizado, uf, origem)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'snov')""",
            (conta_id, linha["nome"], linha["cargo"] or None, papel_comite, cls.papel_icp, email, status,
             linha["linkedin"] or None, linkedin_norm, None),
        )
        return True, False, cls.papel_icp

    if str(existente["conta_id"]) != str(conta_id):
        _registrar_conflito(
            conn, rel, importacao, "pessoa_mudou_de_conta", conta_id=conta_id, pessoa_id=existente["id"],
            detalhe=f"{linha['nome']}: já está em outra conta (mantida); conferir se mudou de empresa", linha=linha_num,
        )
        return False, True, cls.papel_icp

    sets = {
        "cargo": linha["cargo"] or existente["cargo"],
        "papel_comite": papel_comite if cls.papel_icp else existente["papel_comite"],
        "papel_icp": cls.papel_icp or existente["papel_icp"],
        "email": email or existente["email"],
        "email_status": status if status != "desconhecido" else existente["email_status"],
        "linkedin": linha["linkedin"] or existente["linkedin"],
        "linkedin_normalizado": linkedin_norm or existente["linkedin_normalizado"],
    }
    conn.execute(
        """update pessoa set cargo = %(cargo)s, papel_comite = %(papel_comite)s, papel_icp = %(papel_icp)s,
             email = %(email)s, email_status = %(email_status)s, linkedin = %(linkedin)s,
             linkedin_normalizado = %(linkedin_normalizado)s where id = %(id)s""",
        {**sets, "id": existente["id"]},
    )
    return False, True, cls.papel_icp


# ---------- 6. ICP: fit + cobertura de comitê ----------


def _calcular_icp(conn, conta_ids: set) -> None:
    if not conta_ids:
        return
    criterios = (rubrica.ativa(conn) or {}).get("criterios", {}).get("icp", {})
    regioes = tuple(criterios.get("regioes", UFS_ICP_PADRAO))
    fora = [sem_acentos(s).lower() for s in criterios.get("fora", [])]

    for conta_id in conta_ids:
        conta = conn.execute("select * from conta where id = %s", (conta_id,)).fetchone()
        decisores_fora = conn.execute(
            """select count(*) as n from pessoa where conta_id = %s and ativo and papel_icp in ('pagador', 'dono_problema')
               and uf is not null and uf = any(%s)""",
            (conta_id, list(regioes)),
        ).fetchone()
        uf_decisor_relevante = bool(decisores_fora and decisores_fora["n"] > 0 and conta["uf"] and conta["uf"] not in regioes)

        setor_norm = sem_acentos(conta["setor"] or "").lower()
        excluido = any(k in setor_norm for k in fora) if setor_norm else False
        if conta["etapa"] == "descartada":
            fit = None
        elif conta["uf"]:
            fit = (conta["uf"] in regioes or uf_decisor_relevante) and not excluido
        elif conta["regiao_validada"]:
            fit = not excluido  # sem UF, mas o sourcing já filtrou pelo recorte
        else:
            fit = None

        cobertura = conn.execute(
            "select count(distinct papel_icp) as n from pessoa where conta_id = %s and ativo and papel_icp in ('pagador', 'dono_problema', 'guardiao')",
            (conta_id,),
        ).fetchone()["n"]

        conn.execute(
            "update conta set uf_decisor_relevante = %s, fit_icp = %s, cobertura_comite = %s where id = %s",
            (uf_decisor_relevante, fit, cobertura, conta_id),
        )


# ---------- orquestração + relatório ----------


def importar_snov(conn: psycopg.Connection, caminho: str | Path, origem: str = "snov") -> RelatorioSnov:
    linhas, nao_mapeadas = ler_csv(caminho)
    rel = RelatorioSnov(arquivo=str(caminho), linhas=len(linhas), colunas_nao_mapeadas=nao_mapeadas)

    grupos: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for linha in linhas:
        grupos[chave_da_conta(linha)].append(linha)

    contas_tocadas: set = set()
    with conn.transaction():
        for (tipo_chave, chave), grupo in grupos.items():
            if not chave:
                continue
            conta, nova = _agregar_grupo(conn, rel, origem, tipo_chave, chave, grupo, grupo[0]["_linha"])
            contas_tocadas.add(conta["id"])
            rel.contas_criadas += int(nova)
            rel.contas_mescladas += int(not nova)
            if conta["etapa"] == "descartada":
                rel.contas_fora_do_brasil += 1

            for linha in grupo:
                criada, duplicada, _papel = _upsert_pessoa(conn, rel, origem, conta["id"], linha, linha["_linha"])
                rel.pessoas_criadas += int(criada)
                rel.pessoas_duplicadas += int(duplicada and not criada)

        _calcular_icp(conn, contas_tocadas)

        if contas_tocadas:
            for r in conn.execute(
                "select coalesce(papel_icp, 'a_classificar') as papel, count(*) as n from pessoa "
                "where conta_id = any(%s) and origem = %s group by papel",
                (list(contas_tocadas), origem),
            ):
                rel.distribuicao_papel[r["papel"]] = r["n"]
            for r in conn.execute(
                "select coalesce(uf, '?') as uf, count(*) as n from conta where id = any(%s) group by uf order by n desc",
                (list(contas_tocadas),),
            ):
                rel.distribuicao_uf[r["uf"]] = r["n"]
            rel.fora_do_recorte = conn.execute(
                "select count(*) as n from conta where id = any(%s) and etapa = 'ativa' and fit_icp = false",
                (list(contas_tocadas),),
            ).fetchone()["n"]
            for r in conn.execute(
                "select coalesce(prioridade, '?') as p, count(*) as n from conta where id = any(%s) group by 1 order by 1",
                (list(contas_tocadas),),
            ):
                rel.distribuicao_prioridade[r["p"]] = r["n"]
            rel.contas_fit_por_regiao_sourcing = conn.execute(
                "select count(*) as n from conta where id = any(%s) and uf is null and regiao_validada and fit_icp",
                (list(contas_tocadas),),
            ).fetchone()["n"]
            rel.contas_sem_icp = conn.execute(
                "select count(*) as n from conta where id = any(%s) and fit_icp is null", (list(contas_tocadas),)
            ).fetchone()["n"]
            pessoas_tocadas = conn.execute(
                "select count(*) as total, count(*) filter (where email_status = 'verificado') as verificado "
                "from pessoa where conta_id = any(%s) and origem = %s",
                (list(contas_tocadas), origem),
            ).fetchone()
            rel.pct_email_verificado = round(100 * pessoas_tocadas["verificado"] / pessoas_tocadas["total"], 1) if pessoas_tocadas["total"] else 0.0
            rel.top_contas = [
                {"nome": r["nome"], "cobertura": r["cobertura_comite"], "fit_icp": r["fit_icp"], "uf": r["uf"]}
                for r in conn.execute(
                    "select nome, cobertura_comite, fit_icp, uf from conta where id = any(%s) "
                    "order by cobertura_comite desc nulls last, fit_icp desc nulls last, nome limit 20",
                    (list(contas_tocadas),),
                )
            ]

        conn.execute(
            "insert into importacao_relatorio (importacao, arquivo, resumo) values (%s, %s, %s::jsonb)",
            (origem, str(caminho), json.dumps(_resumo_json(rel), ensure_ascii=False)),
        )

    return rel


def _resumo_json(rel: RelatorioSnov) -> dict:
    return {
        "linhas": rel.linhas,
        "pessoas_criadas": rel.pessoas_criadas,
        "pessoas_duplicadas": rel.pessoas_duplicadas,
        "contas_criadas": rel.contas_criadas,
        "contas_mescladas": rel.contas_mescladas,
        "contas_fora_do_brasil": rel.contas_fora_do_brasil,
        "contas_sem_icp": rel.contas_sem_icp,
        "conflitos": rel.conflitos,
        "distribuicao_papel": rel.distribuicao_papel,
        "distribuicao_uf": rel.distribuicao_uf,
        "distribuicao_prioridade": rel.distribuicao_prioridade,
        "contas_fit_por_regiao_sourcing": rel.contas_fit_por_regiao_sourcing,
        "fora_do_recorte": rel.fora_do_recorte,
        "pct_email_verificado": rel.pct_email_verificado,
        "top_contas": rel.top_contas,
        "colunas_nao_mapeadas": rel.colunas_nao_mapeadas,
    }


def imprimir_relatorio(rel: RelatorioSnov) -> None:
    print(f"{rel.linhas} linhas lidas de {rel.arquivo}")
    print(f"Pessoas: {rel.pessoas_criadas} criadas, {rel.pessoas_duplicadas} duplicadas descartadas "
          f"({rel.pct_email_verificado}% com e-mail verificado)")
    print(f"Contas: {rel.contas_criadas} criadas, {rel.contas_mescladas} mescladas com a base-mãe, "
          f"{rel.contas_fora_do_brasil} fora do Brasil (etapa descartada)")
    print(f"Conflitos registrados em importacao_conflito: {rel.conflitos}")
    print(f"Fora do recorte SP/PR/SC/RS (e sem decisor relevante nessas UFs): {rel.fora_do_recorte}")
    print(f"Contas sem ICP calculado (UF indefinida): {rel.contas_sem_icp}")
    if rel.contas_fit_por_regiao_sourcing:
        print(f"Contas no ICP pela região validada no sourcing (sem UF ainda): {rel.contas_fit_por_regiao_sourcing}")
    if set(rel.distribuicao_prioridade) - {"?"}:
        print("Distribuição por prioridade: " + ", ".join(f"{k}={v}" for k, v in rel.distribuicao_prioridade.items()))
    print("Distribuição por papel: " + ", ".join(f"{k}={v}" for k, v in sorted(rel.distribuicao_papel.items())))
    print("Distribuição por UF: " + ", ".join(f"{k}={v}" for k, v in sorted(rel.distribuicao_uf.items(), key=lambda kv: -kv[1])))
    if rel.colunas_nao_mapeadas:
        print("Colunas do arquivo sem mapeamento (revisar aliases?): " + ", ".join(rel.colunas_nao_mapeadas))
    print("Top 20 contas por cobertura de comitê:")
    for c in rel.top_contas:
        print(f"  {c['cobertura']}/3  fit={c['fit_icp']}  {c['uf'] or '??'}  {c['nome']}")
