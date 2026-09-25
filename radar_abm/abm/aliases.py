"""Aliases: os nomes pelos quais cada empresa aparece em notícias e fontes públicas.

Gerados automaticamente a partir do nome fantasia e da razão social:
- fantasia: o nome como está na planilha ("Junto Seguros");
- variacao: o nome sem forma jurídica e sem descritor do setor ("Junto");
- sigla: siglas que já estão no nome ("KLA") ou montadas pelas iniciais ("ABA").

Um alias é ambíguo quando pode trazer notícia de outra empresa: palavra comum, sobrenome comum, termo
curto, sigla montada ou termo repetido em duas contas. Alias ambíguo nasce desligado (não entra nas
buscas) até ser revisado. O nome fantasia fica sempre ligado.
"""

from __future__ import annotations

import csv
import re
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .db import novo_id
from .identidade import UFS, normalizar_nome, sem_acentos

# Formas jurídicas e descritores de setor que não fazem parte do nome "falado" da empresa.
_DESCRITORES = re.compile(
    r"\b(ltda|limitada|s\s*/?\s*a|s\s*/\s*c|eireli|me|epp|cia|companhia|sociedade individual de advocacia|"
    r"sociedade de advogados|advogados associados|advogados|advogado|advocacia|associados|consultores|"
    r"cooperativa de credito|cooperativa|confederacao|central|administradora de consorcios|administradora|"
    r"consorcios|consorcio|seguradora|seguros|previdencia|tecnologia|sistemas|software|solucoes|servicos|"
    r"brasil|do brasil|group|grupo|holding|e|&|de|da|do|das|dos)\b",
    re.IGNORECASE,
)

_PALAVRAS_LIGACAO = {"e", "de", "da", "do", "das", "dos", "the", "and", "&"}

# Maiúsculas que não são sigla da empresa: UFs, formas jurídicas, abreviações de setor.
_NAO_SIGLAS = UFS | {"LTDA", "EIRELI", "EPP", "ADV", "ADVS", "CIA", "BR", "BRA", "DO", "DA", "DE", "DOS", "DAS", "SA", "S/A"}

# Palavras e sobrenomes que aparecem em muitas notícias sem relação com a conta.
COMUNS = set("""
silva santos oliveira souza sousa lima pereira costa ferreira rodrigues almeida nascimento carvalho araujo ribeiro
martins rocha gomes barbosa machado mendes freitas cardoso teixeira moreira correia correa castro campos monteiro
vieira pinto moura cavalcanti dias nunes lopes marques ramos reis fernandes andrade batista rezende mattos neves
pires leite tavares azevedo franco prado brito siqueira bastos farias guimaraes coelho morais moraes miranda fonseca
veiga barros duarte porto sales viana queiroz toledo lacerda bueno pacheco sampaio medeiros xavier amaral borges
aguiar cunha pimentel magalhaes assis leal braga brandao menezes lobo paiva pessoa filho neto junior sobrinho
junto uniao unica unico viver vida sol norte sul leste oeste nacional central capital global total prime mais nova
novo alianca confianca futuro rio vale terra mar forte bem grupo sistema banco credito digital tech data cloud smart
one pro plus max top ideal alpha beta omega delta gama sigma integra conecta cresce agil facil simples conta pay bank
cred coop soma valor base rede elo ponto meta foco lider master summit leader first up go next hub lab labs
alfa argo pier too abe saude porto seguro
""".split())


@dataclass
class Candidato:
    termo: str
    tipo: str
    motivo: str = ""


def _variacao(nome: str) -> str:
    texto = sem_acentos(nome)
    texto = re.sub(r"\(.*?\)", " ", texto)
    texto = re.sub(r"[.,/\-–—|]", " ", texto)
    texto = _DESCRITORES.sub(" ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    if not re.search(r"[A-Za-z]{3,}", texto):
        return ""
    # Devolve com a grafia original (acentos) quando possível.
    original = [p for p in re.split(r"\s+", re.sub(r"[.,/\-–—|()]", " ", nome)) if p]
    alvo = texto.lower().split()
    escolhidas = [p for p in original if sem_acentos(p).lower() in alvo]
    return " ".join(escolhidas) or texto


def _siglas(nome: str, iniciais_ok: bool) -> list[Candidato]:
    saida = []
    # Siglas já escritas no nome: entre parênteses ("(AMTF Advogados)") ou em maiúsculas no meio de um nome
    # normal ("KLA Advogados"). Nome todo em maiúsculas não conta: ali toda palavra parece sigla.
    trechos = re.findall(r"\(([^)]*)\)", nome)
    if not nome.isupper():
        trechos.append(re.sub(r"\(.*?\)", " ", nome))
    for trecho in trechos:
        for palavra in re.findall(r"\b[A-Z][A-Z0-9&]{2,5}\b", trecho):
            if palavra not in _NAO_SIGLAS:
                saida.append(Candidato(palavra, "sigla"))
    palavras = [p for p in re.findall(r"[A-Za-zÀ-ÿ]+", _variacao(nome) or nome) if p.lower() not in _PALAVRAS_LIGACAO]
    if iniciais_ok and 3 <= len(palavras) <= 4 and not nome.isupper():
        iniciais = "".join(sem_acentos(p[0]).upper() for p in palavras)
        saida.append(Candidato(iniciais, "sigla", "sigla montada pelas iniciais; confirmar se a empresa usa"))
    return saida


def _nomes_antigos(nome: str) -> list[Candidato]:
    """'WeCogno (ex-Datarisk)': o nome antigo ainda aparece em notícias."""
    return [Candidato(n.strip(), "variacao") for n in re.findall(r"\bex[-\s]+([^)]+)\)", nome, flags=re.IGNORECASE)]


def candidatos(nome_fantasia: str, razao_social: str | None, braco_icp: str | None = None) -> list[Candidato]:
    """Siglas por iniciais só para serviços profissionais, onde escritórios costumam usá-las (ex.: "PMKA")."""
    lista = [Candidato(nome_fantasia.strip(), "fantasia")]
    for nome in filter(None, [nome_fantasia, razao_social]):
        var = _variacao(nome)
        if var:
            lista.append(Candidato(var, "variacao"))
    lista += _siglas(nome_fantasia, braco_icp == "servicos_profissionais") + _nomes_antigos(nome_fantasia)
    vistos, unicos = set(), []
    for c in lista:
        chave = normalizar_nome(c.termo)
        if chave and chave not in vistos:
            vistos.add(chave)
            unicos.append(c)
    return unicos


def motivo_ambiguidade(c: Candidato) -> str:
    if c.motivo:
        return c.motivo
    chave = normalizar_nome(c.termo)
    palavras = chave.split()
    if len(chave.replace(" ", "")) <= 3:
        return "termo curto demais; aparece em muitos contextos"
    if len(palavras) == 1 and palavras[0] in COMUNS:
        return "palavra ou sobrenome comum"
    if len(palavras) == 2 and all(p in COMUNS for p in palavras):
        return "só palavras ou sobrenomes comuns"
    return ""


def gerar(conn: sqlite3.Connection) -> dict[str, int]:
    """Cria os aliases que faltam. Não mexe nos que você já revisou nem nos manuais."""
    contas = conn.execute("select id, nome_fantasia, razao_social, braco_icp from contas").fetchall()
    por_conta = {c["id"]: candidatos(c["nome_fantasia"], c["razao_social"], c["braco_icp"]) for c in contas}
    # Termo que aparece em mais de uma conta é ambíguo por definição.
    donos: dict[str, set[str]] = defaultdict(set)
    for conta_id, lista in por_conta.items():
        for c in lista:
            donos[normalizar_nome(c.termo)].add(conta_id)

    criados = ambiguos = 0
    for conta_id, lista in por_conta.items():
        existentes = {normalizar_nome(r["termo"]) for r in conn.execute("select termo from aliases where conta_id = ?", (conta_id,))}
        for c in lista:
            chave = normalizar_nome(c.termo)
            if chave in existentes:
                continue
            motivo = motivo_ambiguidade(c)
            outras = donos[chave] - {conta_id}
            if outras:
                motivo = f"mesmo termo de outra conta ({', '.join(sorted(outras))})"
            ambiguo = bool(motivo)
            # O nome fantasia é o nome oficial da conta: fica ligado mesmo se ambíguo, mas vai para revisão.
            ativo = c.tipo == "fantasia" or not ambiguo
            conn.execute(
                "insert into aliases (id, conta_id, termo, tipo, ambiguo, motivo, ativo, revisado) values (?, ?, ?, ?, ?, ?, ?, ?)",
                (novo_id(), conta_id, c.termo, c.tipo, ambiguo, motivo or None, ativo, False),
            )
            criados += 1
            ambiguos += ambiguo
    conn.commit()
    return {"criados": criados, "ambiguos": ambiguos}


COLUNAS_REVISAO = ["alias_id", "conta_id", "empresa", "termo", "tipo", "motivo", "usar", "termos_negativos"]


def exportar_revisao(conn: sqlite3.Connection, destino: str | Path) -> int:
    """Planilha para você revisar os ambíguos: preencha 'usar' com sim ou nao e, se quiser, termos negativos."""
    linhas = conn.execute(
        """select a.id, a.conta_id, c.nome_fantasia, a.termo, a.tipo, a.motivo, a.ativo, a.termos_negativos
           from aliases a join contas c on c.id = a.conta_id
           where a.ambiguo and not a.revisado
           order by coalesce(c.tier, 'Z'), c.nome_fantasia, a.tipo"""
    ).fetchall()
    with open(destino, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUNAS_REVISAO)
        for r in linhas:
            w.writerow([r[0], r[1], r[2], r[3], r[4], r[5], "sim" if r[6] else "nao", r[7] or ""])
    return len(linhas)


def aplicar_revisao(conn: sqlite3.Connection, origem: str | Path) -> dict[str, int]:
    texto = Path(origem).read_text(encoding="utf-8-sig")
    delim = ";" if texto.split("\n", 1)[0].count(";") >= texto.split("\n", 1)[0].count(",") else ","
    contagem = {"ligados": 0, "desligados": 0, "ignorados": 0}
    for linha in csv.DictReader(texto.splitlines(), delimiter=delim):
        usar = sem_acentos(linha.get("usar", "")).strip().lower()
        if usar not in {"sim", "s", "nao", "n"}:
            contagem["ignorados"] += 1
            continue
        ativo = usar in {"sim", "s"}
        feito = conn.execute(
            "update aliases set ativo = ?, revisado = ?, termos_negativos = ? where id = ?",
            (ativo, True, (linha.get("termos_negativos") or "").strip() or None, linha.get("alias_id")),
        ).rowcount
        if not feito:
            contagem["ignorados"] += 1
            continue
        contagem["ligados" if ativo else "desligados"] += 1
    conn.commit()
    return contagem


def adicionar(conn: sqlite3.Connection, conta_id: str, termo: str, termos_negativos: str = "") -> None:
    conn.execute(
        """insert into aliases (id, conta_id, termo, tipo, termos_negativos, ambiguo, ativo, revisado)
           values (?, ?, ?, 'manual', ?, false, true, true)
           on conflict (conta_id, termo) do update set ativo = true, revisado = true, termos_negativos = excluded.termos_negativos""",
        (novo_id(), conta_id, termo.strip(), termos_negativos.strip() or None),
    )
    conn.commit()
