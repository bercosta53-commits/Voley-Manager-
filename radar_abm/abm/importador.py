"""Importa contas e pessoas de uma planilha (CSV, XLSX ou XLSM) para o banco.

- Na .xlsm, lê as abas "02 Contas" e "03 Pessoas". A linha de cabeçalho muda de aba para aba, então
  ela é detectada: é a linha, entre as 30 primeiras, que mais tem nomes de coluna conhecidos.
- Cada linha é casada com uma conta nesta ordem: raiz do CNPJ, id da planilha, domínio, nome.
- Duas linhas com a mesma raiz de CNPJ são a mesma empresa: fica a matriz (CNPJ terminado em 0001),
  as filiais ficam registradas na tabela filiais.
- Importar de novo a mesma planilha atualiza as contas; campo vazio na planilha não apaga o banco.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from .db import agora, novo_id
from .identidade import (
    cnpj_normalizado,
    cnpj_raiz,
    dominio_generico,
    e_matriz,
    limpo,
    normalizar_chave,
    normalizar_dominio,
    normalizar_nome,
    normalizar_uf,
    sem_acentos,
)

CAMPOS_CONTA = {
    "id": ["id_conta", "conta_id", "id", "codigo", "cod_conta"],
    "nome_fantasia": ["empresa", "nome_fantasia", "fantasia", "nome_da_empresa", "conta", "nome", "company", "account"],
    "razao_social": ["razao_social", "razao"],
    "cnpj": ["cnpj", "cnpj_matriz", "cnpj_empresa"],
    "site": ["site", "dominio", "website", "site_oficial", "url_site", "domain"],
    "uf": ["uf", "estado"],
    "cidade": ["cidade", "municipio"],
    "braco_icp": ["icp", "braco_icp", "braco"],
    "subsegmento": ["subsegmento", "segmento", "setor"],
    "grupo_economico": ["grupo_economico", "grupo"],
    "status": ["status_comercial", "status"],
    "tier": ["tier", "abc", "classe"],
    "score_estrutural": ["score_estrutural"],
    "score_ativacao": ["score_ativacao"],
    "confianca_base": ["confianca"],
    "fonte_principal": ["fonte_principal", "fonte"],
}

CAMPOS_PESSOA = {
    "conta_id": ["id_conta", "conta_id"],
    "conta_nome": ["empresa", "conta", "nome_fantasia", "nome_da_empresa"],
    "nome": ["nome", "pessoa", "nome_pessoa", "nome_completo", "contato"],
    "cargo": ["cargo", "titulo", "title"],
    "papel": ["papel_comite", "papel", "papel_no_comite"],
    "apollo_id": ["apollo_id"],
}

# Pessoas que vêm na própria linha da conta: pessoa_p1/cargo_p1, pessoa_p2/cargo_p2...
_PESSOA_NA_LINHA = re.compile(r"^(?:pessoa|decisor|contato)_?p?(\d*)$")

CONHECIDAS = {a for campos in (CAMPOS_CONTA, CAMPOS_PESSOA) for lista in campos.values() for a in lista}
CONHECIDAS |= {"pessoa_p1", "cargo_p1"}

BRACOS = [
    ("servicos_profissionais", r"advoca|juridic|servicos profissionais|auditoria|contab|tributar"),
    ("servicos_financeiros", r"financ|cooperat|segur|previd|consorc|credito"),
    ("tecnologia", r"tecnolog|software|saas|tech"),
]


@dataclass
class Aba:
    nome: str
    linha_cabecalho: int  # 1 = primeira linha da aba
    linhas: list[dict[str, str]]


@dataclass
class Planilha:
    contas: Aba
    pessoas: Aba | None = None


@dataclass
class Relatorio:
    linhas: int = 0
    novas: int = 0
    atualizadas: int = 0
    pessoas: int = 0
    filiais: list[str] = field(default_factory=list)
    mescladas: list[str] = field(default_factory=list)
    cnpj_invalidos: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- leitura


def _detectar_cabecalho(linhas: list[list[str]]) -> int:
    """Índice (0-based) da linha com mais nomes de coluna conhecidos, entre as 30 primeiras."""
    melhor, pontos = 0, -1
    for i, linha in enumerate(linhas[:30]):
        p = sum(1 for c in linha if normalizar_chave(c) in CONHECIDAS)
        if p > pontos:
            melhor, pontos = i, p
    if pontos < 2:
        raise ValueError("não achei a linha de cabeçalho (nenhuma linha tem ao menos 2 colunas conhecidas)")
    return melhor


def _aba(nome: str, linhas: list[list[str]]) -> Aba:
    i = _detectar_cabecalho(linhas)
    cab = [normalizar_chave(c) for c in linhas[i]]
    registros = []
    for linha in linhas[i + 1 :]:
        if not any(str(c).strip() for c in linha):
            continue
        linha = list(linha) + [""] * (len(cab) - len(linha))
        registros.append({k: str(v).strip() for k, v in zip(cab, linha) if k})
    return Aba(nome, i + 1, registros)


def _valor_celula(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))  # CNPJ salvo como número no Excel
    return str(v)


def ler(caminho: str | Path) -> Planilha:
    caminho = Path(caminho)
    if caminho.suffix.lower() in {".xlsx", ".xlsm"}:
        from openpyxl import load_workbook

        # data_only=True: lê o valor calculado das fórmulas, não a fórmula.
        livro = load_workbook(caminho, read_only=True, data_only=True, keep_vba=False)
        abas = {normalizar_chave(a.title): a for a in livro.worksheets}

        def achar(palavra: str):
            return next((a for chave, a in abas.items() if palavra in chave), None)

        aba_contas = achar("contas") or livro.worksheets[0]
        aba_pessoas = achar("pessoas")

        def linhas(aba):
            return [[_valor_celula(v) for v in linha] for linha in aba.iter_rows(values_only=True)]

        return Planilha(
            _aba(aba_contas.title, linhas(aba_contas)),
            _aba(aba_pessoas.title, linhas(aba_pessoas)) if aba_pessoas is not None else None,
        )
    texto = caminho.read_bytes().decode("utf-8-sig", errors="replace")
    primeira = texto.split("\n", 1)[0]
    delim = max(["\t", ";", ","], key=primeira.count)
    return Planilha(_aba(caminho.name, list(csv.reader(io.StringIO(texto), delimiter=delim))))


def _pegar(linha: dict[str, str], aliases: list[str]) -> str:
    for a in aliases:
        v = limpo(linha.get(a))
        if v:
            return v
    return ""


def braco_icp(texto: str) -> str | None:
    t = sem_acentos(texto).lower()
    if not t:
        return None
    for chave, padrao in BRACOS:
        if re.search(padrao, t):
            return chave
    return normalizar_chave(t)


def inferir_papel(cargo: str) -> str:
    """Papel no comitê pelo cargo. É um palpite inicial; a aba de pessoas pode informar o papel."""
    c = sem_acentos(cargo).lower()
    if re.search(r"\b(compras|procurement|suprimentos)\b", c):
        return "bloqueador"
    if re.search(r"\b(ceo|cfo|cmo|cro|coo|cto|cio|presidente|vice.presidente|vp|fundador|cofundador|co.fundador|"
                 r"socio|socia|diretor|diretora|superintendente|partner|owner|dono|dona)\b", c):
        return "decisor"
    if re.search(r"\b(analista|assistente|especialista|executivo de contas|sdr|bdr)\b", c):
        return "usuario"
    return "influenciador"


def _papel(texto: str, cargo: str) -> str:
    t = sem_acentos(texto).lower()
    for papel in ("decisor", "influenciador", "usuario", "bloqueador"):
        if t.startswith(papel[:6]):
            return papel
    return inferir_papel(cargo)


def _inteiro(texto: str) -> int | None:
    try:
        return int(float(texto.replace(",", ".")))
    except ValueError:
        return None


# ---------------------------------------------------------------- gravação


def mesclar(conn: sqlite3.Connection, mantida: str, removida: str) -> None:
    """Junta a conta `removida` na `mantida`, levando pessoas, aliases, fotos, itens e sinais."""
    velha = conn.execute("select * from contas where id = ?", (removida,)).fetchone()
    for tabela, chave in (("pessoas", "nome"), ("aliases", "termo")):
        conn.execute(
            f"delete from {tabela} where conta_id = ? and {chave} in (select {chave} from {tabela} where conta_id = ?)",
            (removida, mantida),
        )
    for tabela in ("pessoas", "aliases", "snapshots", "itens_brutos", "sinais", "filiais"):
        conn.execute(f"update {tabela} set conta_id = ? where conta_id = ?", (mantida, removida))
    conn.execute("delete from contas where id = ?", (removida,))
    if velha["cnpj"]:
        conn.execute(
            "insert into filiais (cnpj, conta_id, nome_planilha, uf, cidade, mesclada_de) values (?, ?, ?, ?, ?, ?) "
            "on conflict (cnpj) do nothing",
            (velha["cnpj"], mantida, velha["nome_fantasia"], velha["uf"], velha["cidade"], removida),
        )
    # Campos que a mantida não tem são herdados da removida.
    campos = ["razao_social", "dominio", "uf", "cidade", "braco_icp", "subsegmento", "grupo_economico", "status", "tier"]
    atual = conn.execute("select * from contas where id = ?", (mantida,)).fetchone()
    faltando = {c: velha[c] for c in campos if not atual[c] and velha[c]}
    if faltando:
        conn.execute(
            f"update contas set {', '.join(f'{c} = ?' for c in faltando)} where id = ?", (*faltando.values(), mantida)
        )


def _achar(conn, raiz, id_planilha, dominio, nome_norm) -> tuple[sqlite3.Row | None, str]:
    if raiz:
        c = conn.execute("select * from contas where cnpj_raiz = ?", (raiz,)).fetchone()
        if c:
            return c, "cnpj"
    if id_planilha:
        c = conn.execute("select * from contas where id = ?", (id_planilha,)).fetchone()
        if c:
            return c, "id"
    if dominio:
        c = conn.execute("select * from contas where dominio = ?", (dominio,)).fetchone()
        if c and not (raiz and c["cnpj_raiz"] and c["cnpj_raiz"] != raiz):
            return c, "dominio"
    if nome_norm:
        compativeis = [
            c for c in conn.execute("select * from contas")
            if normalizar_nome(c["nome_fantasia"]) == nome_norm and not (raiz and c["cnpj_raiz"] and c["cnpj_raiz"] != raiz)
        ]
        if len(compativeis) == 1:
            return compativeis[0], "nome"
    return None, ""


def _gravar_pessoa(conn, conta_id: str, nome: str, cargo: str, papel: str, apollo_id: str = "") -> bool:
    existente = conn.execute("select id from pessoas where conta_id = ? and nome = ?", (conta_id, nome)).fetchone()
    if existente:
        conn.execute(
            "update pessoas set cargo = coalesce(?, cargo), papel_comite = ?, apollo_id = coalesce(?, apollo_id) where id = ?",
            (cargo or None, papel, apollo_id or None, existente["id"]),
        )
        return False
    conn.execute(
        "insert into pessoas (id, conta_id, nome, cargo, papel_comite, apollo_id) values (?, ?, ?, ?, ?, ?)",
        (novo_id(), conta_id, nome, cargo or None, papel, apollo_id or None),
    )
    return True


def importar(conn: sqlite3.Connection, planilha: Planilha, dry_run: bool = False) -> Relatorio:
    """Grava a planilha no banco. Com dry_run=True faz tudo e desfaz no fim: só o relatório sobra."""
    rel = Relatorio()
    usados = set(CAMPOS_CONTA_USADOS)
    try:
        for n, linha in enumerate(planilha.contas.linhas, start=planilha.contas.linha_cabecalho + 1):
            rel.linhas += 1
            _importar_conta(conn, linha, n, rel, usados)
        if planilha.pessoas:
            for n, linha in enumerate(planilha.pessoas.linhas, start=planilha.pessoas.linha_cabecalho + 1):
                _importar_pessoa(conn, linha, n, rel)
    except Exception:
        conn.rollback()
        raise
    if dry_run:
        conn.rollback()
    else:
        conn.commit()
    return rel


CAMPOS_CONTA_USADOS = {a for lista in CAMPOS_CONTA.values() for a in lista}


def _importar_conta(conn, linha: dict[str, str], n: int, rel: Relatorio, usados: set[str]) -> None:
    v = {campo: _pegar(linha, aliases) for campo, aliases in CAMPOS_CONTA.items()}
    if not v["nome_fantasia"] and not v["cnpj"]:
        rel.avisos.append(f"linha {n}: sem nome e sem CNPJ, ignorada")
        return
    cnpj = cnpj_normalizado(v["cnpj"])
    if v["cnpj"] and not cnpj:
        rel.cnpj_invalidos.append(f"linha {n} ({v['nome_fantasia']}): {v['cnpj']}")
    raiz = cnpj_raiz(cnpj)
    dominio = normalizar_dominio(v["site"])
    if dominio and dominio_generico(dominio):
        rel.avisos.append(f"linha {n} ({v['nome_fantasia']}): site {v['site']} é genérico (rede social ou e-mail grátis), ignorado")
        dominio = None
    uf = normalizar_uf(v["uf"])
    if v["uf"] and not uf:
        rel.avisos.append(f"linha {n} ({v['nome_fantasia']}): UF '{v['uf']}' não reconhecida")

    conta, por = _achar(conn, raiz, v["id"], dominio, normalizar_nome(v["nome_fantasia"]))

    # Linha de filial de uma empresa que já tem a matriz: registra a filial e não mexe na conta.
    if conta and cnpj and conta["cnpj"] and conta["cnpj"] != cnpj and not e_matriz(cnpj):
        _registrar_filial(conn, conta["id"], cnpj, v, uf, rel)
        _duplicata_por_id(conn, conta["id"], v["id"], rel)
        _pessoas_da_linha(conn, conta["id"], linha, rel)
        return

    extras = {k: val for k, val in linha.items() if k not in usados and limpo(val) and not _PESSOA_NA_LINHA.match(k)
              and not k.startswith("cargo_p")}
    if v["cnpj"] and not cnpj:
        extras["cnpj_invalido"] = v["cnpj"]
    dados = {
        "nome_fantasia": v["nome_fantasia"] or None,
        "razao_social": v["razao_social"] or None,
        "uf": uf,
        "cidade": v["cidade"] or None,
        "braco_icp": braco_icp(v["braco_icp"]),
        "subsegmento": v["subsegmento"] or None,
        "grupo_economico": v["grupo_economico"] or None,
        "status": v["status"] or None,
        "tier": (v["tier"].upper()[:1] or None) if v["tier"] else None,
        "score_estrutural": _inteiro(v["score_estrutural"]),
        "score_ativacao": _inteiro(v["score_ativacao"]),
        "confianca_base": v["confianca_base"] or None,
        "fonte_principal": v["fonte_principal"] or None,
    }
    if conta is None:
        conta_id = v["id"] or f"C-{novo_id()[:6]}"
        conn.execute(
            "insert into contas (id, nome_fantasia, criada_em, atualizada_em) values (?, ?, ?, ?)",
            (conta_id, v["nome_fantasia"] or f"CNPJ {cnpj}", agora(), agora()),
        )
        rel.novas += 1
    else:
        conta_id = conta["id"]
        rel.atualizadas += 1
        _duplicata_por_id(conn, conta_id, v["id"], rel)

    sets = {k: val for k, val in dados.items() if val is not None}
    if extras:
        anterior = conn.execute("select contexto_json from contas where id = ?", (conta_id,)).fetchone()["contexto_json"]
        sets["contexto_json"] = json.dumps({**json.loads(anterior or "{}"), **extras}, ensure_ascii=False)
    if cnpj:
        _definir_cnpj(conn, conta_id, cnpj, v, uf, rel)
    if dominio:
        dono = conn.execute("select id from contas where dominio = ?", (dominio,)).fetchone()
        if dono and dono["id"] != conta_id:
            rel.avisos.append(f"linha {n} ({v['nome_fantasia']}): domínio {dominio} já é da conta {dono['id']}; não gravado")
        else:
            sets["dominio"] = dominio
    if sets:
        conn.execute(
            f"update contas set {', '.join(f'{k} = ?' for k in sets)}, atualizada_em = ? where id = ?",
            (*sets.values(), agora(), conta_id),
        )
    _pessoas_da_linha(conn, conta_id, linha, rel)


def _duplicata_por_id(conn, conta_id: str, id_planilha: str, rel: Relatorio) -> None:
    """A linha tem id próprio que já é outra conta no banco, mas o CNPJ diz que é a mesma empresa: junta."""
    if id_planilha and id_planilha != conta_id and conn.execute("select 1 from contas where id = ?", (id_planilha,)).fetchone():
        mesclar(conn, conta_id, id_planilha)
        rel.mescladas.append(f"{id_planilha} juntada em {conta_id} (mesmo CNPJ raiz)")


def _definir_cnpj(conn, conta_id: str, cnpj: str, v: dict, uf: str | None, rel: Relatorio) -> None:
    atual = conn.execute("select cnpj from contas where id = ?", (conta_id,)).fetchone()["cnpj"]
    if atual == cnpj:
        return
    if atual and atual[:8] == cnpj[:8]:
        if e_matriz(cnpj) and not e_matriz(atual):
            # Chegou a matriz de uma conta que só tinha filial: a filial desce para a tabela de filiais.
            conn.execute("update contas set cnpj = ? where id = ?", (cnpj, conta_id))
            _registrar_filial(conn, conta_id, atual, {"nome_fantasia": None, "cidade": None}, None, rel)
        else:
            _registrar_filial(conn, conta_id, cnpj, v, uf, rel)
        return
    if atual:
        rel.avisos.append(f"{conta_id}: CNPJ trocado de {atual} para {cnpj} pela planilha")
    conn.execute("update contas set cnpj = ?, cnpj_raiz = ? where id = ?", (cnpj, cnpj[:8], conta_id))


def _registrar_filial(conn, conta_id: str, cnpj: str, v: dict, uf: str | None, rel: Relatorio) -> None:
    feito = conn.execute(
        "insert into filiais (cnpj, conta_id, nome_planilha, uf, cidade) values (?, ?, ?, ?, ?) on conflict (cnpj) do nothing",
        (cnpj, conta_id, v.get("nome_fantasia"), uf, v.get("cidade")),
    ).rowcount
    if feito:
        rel.filiais.append(f"{cnpj} registrado como filial de {conta_id}")


def _pessoas_da_linha(conn, conta_id: str, linha: dict[str, str], rel: Relatorio) -> None:
    for chave, valor in linha.items():
        m = _PESSOA_NA_LINHA.match(chave)
        nome = limpo(valor)
        if not m or not nome:
            continue
        sufixo = m.group(1)
        cargo = limpo(linha.get(f"cargo_p{sufixo}") or linha.get(f"cargo_{chave}") or (linha.get("cargo") if not sufixo else ""))
        if _gravar_pessoa(conn, conta_id, nome, cargo, inferir_papel(cargo)):
            rel.pessoas += 1


def _importar_pessoa(conn, linha: dict[str, str], n: int, rel: Relatorio) -> None:
    v = {campo: _pegar(linha, aliases) for campo, aliases in CAMPOS_PESSOA.items()}
    if not v["nome"]:
        return
    conta = None
    if v["conta_id"]:
        conta = conn.execute("select id from contas where id = ?", (v["conta_id"],)).fetchone()
    if conta is None and v["conta_nome"]:
        alvo = normalizar_nome(v["conta_nome"])
        achadas = [c for c in conn.execute("select id, nome_fantasia from contas") if normalizar_nome(c["nome_fantasia"]) == alvo]
        conta = achadas[0] if len(achadas) == 1 else None
    if conta is None:
        rel.avisos.append(f"pessoas, linha {n}: {v['nome']} sem conta correspondente ({v['conta_id'] or v['conta_nome']})")
        return
    if _gravar_pessoa(conn, conta["id"], v["nome"], v["cargo"], _papel(v["papel"], v["cargo"]), v["apollo_id"]):
        rel.pessoas += 1
