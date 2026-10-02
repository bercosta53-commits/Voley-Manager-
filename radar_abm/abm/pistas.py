"""Pistas de vagas de consultorias de recrutamento (Michael Page, Robert Half, Hays, Talenses...).

Funciona como um conector com uma diferença: o anúncio quase nunca diz quem é o cliente ("Nosso cliente é
uma seguradora nacional em expansão"). Por isso a vaga vira uma pista, não um sinal:

1. BUSCA    As vagas chegam num CSV montado pela rotina do Claude (VAGAS_ROTINA.md, parte D), a partir dos sites
            públicos das consultorias. Colunas: consultoria, referencia, titulo, url, data, local, setor,
            descricao e, quando o anúncio disser, empresa.
2. TRADUZ   Grupo da vaga pelo título (as mesmas regras de vagas do sinais.yaml) e braço do ICP pelo setor e pela
            descrição (seção consultorias.setores do sinais.yaml).
3. COMPARA  Descarta o que não é de liderança/marketing/growth/comercial e o que está fora do ICP. Quando o anúncio
            diz o nome da empresa e ele é de uma conta, liga direto. Senão, lista as contas candidatas: mesmo
            braço e mesma cidade, com pontos a mais quando o subsegmento aparece no anúncio. A mesma vaga (mesma
            consultoria e referência) nunca entra duas vezes.
4. ENTREGA  Grava a pista com as candidatas. Só vira sinal quando alguém confirma a conta
            (`vagas atribuir <pista> <conta>`); aí a confiança é 0,9, porque uma pessoa confirmou. Com o nome
            da empresa no anúncio, o sinal nasce na hora, com confiança 0,8.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .conectores.plataformas import ler_data
from .conectores.vagas import POR_QUE_AGORA, grupo_da_vaga
from .db import agora, novo_id
from .identidade import normalizar_nome, sem_acentos
from .taxonomia import Taxonomia

MAX_CANDIDATAS = 5


def _norm(texto: str) -> str:
    return re.sub(r"\s+", " ", sem_acentos(texto or "").lower()).strip()


def _tem(texto_norm: str, termo: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(_norm(termo))}(?![a-z0-9])", texto_norm))


def ler_arquivo(caminho: str | Path) -> list[dict]:
    texto = Path(caminho).read_text(encoding="utf-8-sig")
    primeira = texto.split("\n", 1)[0]
    delim = ";" if primeira.count(";") > primeira.count(",") else ","
    linhas = []
    for r in csv.DictReader(texto.splitlines(), delimiter=delim):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        if not r.get("titulo") or not r.get("consultoria"):
            continue
        linhas.append({"consultoria": r["consultoria"], "referencia": r.get("referencia") or r.get("url") or r["titulo"],
                       "titulo": r["titulo"], "url": r.get("url", ""), "data": ler_data(r.get("data")),
                       "local": r.get("local", ""), "setor": r.get("setor", ""), "descricao": r.get("descricao", ""),
                       "empresa": r.get("empresa", "")})
    return linhas


def braco_do_anuncio(texto: str, taxonomia: Taxonomia) -> str | None:
    t = _norm(texto)
    pontos = {b: sum(1 for p in palavras if _tem(t, p)) for b, palavras in (taxonomia.setores_consultoria or {}).items()}
    melhor = max(pontos.items(), key=lambda x: x[1], default=(None, 0))
    return melhor[0] if melhor[1] else None


def termos_de_setor(texto: str, braco: str, taxonomia: Taxonomia) -> set[str]:
    """Os termos de setor do sinais.yaml que aparecem no anúncio, reduzidos às 5 primeiras letras
    ('seguradora' e 'seguros' viram 'segur'), para comparar com o subsegmento das contas."""
    t = _norm(texto)
    termos = set()
    for termo in (taxonomia.setores_consultoria or {}).get(braco, ()):
        if _tem(t, termo):
            termos |= {p[:5] for p in re.findall(r"[a-z]{5,}", _norm(termo))}
    return termos - {"servi", "empre", "tecno", "plata"}  # palavras genéricas demais para distinguir contas


def candidatas(conn, braco: str, local: str, texto: str, taxonomia: Taxonomia) -> list[dict]:
    """Contas do mesmo braço e da mesma cidade. Pontos: cidade 2, subsegmento com o mesmo termo de setor do
    anúncio 3 (ex.: anúncio de seguradora e conta de seguro garantia), tier A 1."""
    local_n = _norm(local)
    termos = termos_de_setor(texto, braco, taxonomia)
    saida = []
    for c in conn.execute("select * from contas where braco_icp = ?", (braco,)):
        cidade = _norm(c["cidade"] or "")
        if not cidade or not local_n or not _tem(local_n, cidade):
            continue
        pontos, motivos = 2, [f"mesma cidade ({c['cidade']})"]
        sub = {p[:5] for p in re.findall(r"[a-z]{5,}", _norm(c["subsegmento"] or ""))}
        comuns = sorted(termos & sub)
        if comuns:
            pontos += 3
            motivos.append(f"subsegmento do mesmo setor ({c['subsegmento']})")
        if c["tier"] == "A":
            pontos += 1
            motivos.append("tier A")
        saida.append({"conta_id": c["id"], "nome": c["nome_fantasia"], "pontos": pontos, "motivos": motivos})
    saida.sort(key=lambda x: (-x["pontos"], x["nome"]))
    return saida[:MAX_CANDIDATAS]


@dataclass
class Resultado:
    novas: int = 0
    repetidas: int = 0
    fora_dos_grupos: list[str] = field(default_factory=list)
    fora_do_icp: int = 0
    sem_candidata: int = 0
    com_candidatas: int = 0
    ligadas: int = 0


def _conta_pelo_nome(conn, empresa: str) -> str | None:
    e = normalizar_nome(empresa)
    if not e:
        return None
    donas = {r["conta_id"] for r in conn.execute("select conta_id, termo from aliases where ativo") if normalizar_nome(r["termo"]) == e}
    donas |= {r["id"] for r in conn.execute("select id, nome_fantasia from contas") if normalizar_nome(r["nome_fantasia"]) == e}
    return donas.pop() if len(donas) == 1 else None


def importar(conn, linhas: list[dict], taxonomia: Taxonomia, dry_run: bool = False, saida=print) -> Resultado:
    res = Resultado()
    for v in linhas:
        if conn.execute("select 1 from pistas_vagas where consultoria = ? and referencia = ?",
                        (v["consultoria"], v["referencia"])).fetchone():
            res.repetidas += 1
            continue
        grupo = grupo_da_vaga(v["titulo"], taxonomia.vagas)
        if not grupo:
            res.fora_dos_grupos.append(v["titulo"])
            continue
        texto = " ".join((v["titulo"], v["setor"], v["descricao"]))
        braco = braco_do_anuncio(texto, taxonomia)
        pista_id = novo_id()
        conta_id = _conta_pelo_nome(conn, v["empresa"]) if v["empresa"] else None
        if conta_id:
            status, cands = "atribuida", []
        elif not braco:
            status, cands = "fora_do_icp", []
        else:
            cands = candidatas(conn, braco, v["local"], texto, taxonomia)
            status = "aberta" if cands else "sem_candidato"
        conn.execute(
            """insert into pistas_vagas (id, consultoria, referencia, titulo, url, local, setor, descricao, data_publicacao,
                                         data_coleta, grupo, braco_icp, candidatos_json, status, conta_id)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (pista_id, v["consultoria"], v["referencia"], v["titulo"], v["url"], v["local"], v["setor"], v["descricao"],
             v["data"], agora(), grupo, braco, json.dumps(cands, ensure_ascii=False), status, conta_id))
        res.novas += 1
        rotulo = f"{v['consultoria']}: {v['titulo']} ({v['local'] or 'local não informado'})"
        if conta_id:
            _criar_sinal(conn, pista_id, conta_id, taxonomia, confianca=0.8, confirmado=False)
            res.ligadas += 1
            saida(f"   ligada       {rotulo} -> {conta_id} (o anúncio diz o nome: {v['empresa']})")
        elif status == "fora_do_icp":
            res.fora_do_icp += 1
            saida(f"   fora do ICP  {rotulo}")
        elif status == "sem_candidato":
            res.sem_candidata += 1
            saida(f"   sem conta    {rotulo}: braço {braco}, nenhuma conta nessa cidade")
        else:
            res.com_candidatas += 1
            nomes = ", ".join(f"{c['nome']} ({c['conta_id']}, {c['pontos']} pts)" for c in cands)
            saida(f"   pista {pista_id}  {rotulo}\n                candidatas: {nomes}")
    if dry_run:
        conn.rollback()
    else:
        conn.commit()
    return res


def _criar_sinal(conn, pista_id: str, conta_id: str, taxonomia: Taxonomia, confianca: float, confirmado: bool) -> str:
    p = conn.execute("select * from pistas_vagas where id = ?", (pista_id,)).fetchone()
    conta = conn.execute("select braco_icp from contas where id = ?", (conta_id,)).fetchone()
    tipo = taxonomia.tipo(p["grupo"], conta["braco_icp"])
    origem = "cliente confirmado por você" if confirmado else "o anúncio diz o nome da empresa"
    trecho = f"{p['consultoria']}: {p['titulo']} ({p['local'] or '-'}). {(p['descricao'] or '')[:220]}".strip()
    evento = f"consultoria:{p['consultoria']}:{p['referencia']}"
    conn.execute(
        """insert into itens_brutos (id, conector, conta_id, url, titulo, trecho, data_publicacao, data_coleta, hash, evento_id, veiculo)
           values (?, 'consultorias', ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict (hash) do nothing""",
        (novo_id(), conta_id, p["url"], p["titulo"], trecho, p["data_publicacao"], agora(), f"consultoria:{pista_id}",
         evento, p["consultoria"]))
    sinal_id = novo_id()
    conn.execute(
        """insert into sinais (id, conta_id, tipo, evento_id, peso, confianca, membro_comite, angulo, evidencia_url,
                               evidencia_trecho, data_fato, data_alerta, status, item_id, por_que_agora, classificador)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'alerta', ?, ?, 'consultoria')""",
        (sinal_id, conta_id, p["grupo"], evento, tipo.peso if tipo else None, confianca,
         tipo.membro_comite if tipo else None, tipo.angulo_sugerido if tipo else None, p["url"], trecho,
         p["data_publicacao"] or date.today().isoformat(), agora(), pista_id,
         POR_QUE_AGORA[p["grupo"]].format(titulos=p["titulo"]) + f" Vaga conduzida pela {p['consultoria']} ({origem})."))
    conn.execute("update pistas_vagas set status = 'atribuida', conta_id = ?, sinal_id = ? where id = ?", (conta_id, sinal_id, pista_id))
    return sinal_id


class PistaInvalida(ValueError):
    pass


def atribuir(conn, pista_id: str, conta_id: str, taxonomia: Taxonomia) -> str:
    """Confirma a conta da pista (vira sinal) ou, com '-', descarta a pista."""
    p = conn.execute("select * from pistas_vagas where id = ?", (pista_id,)).fetchone()
    if p is None:
        raise PistaInvalida(f"pista {pista_id} não encontrada (veja: python manager.py vagas pistas)")
    if p["status"] == "atribuida":
        raise PistaInvalida(f"pista {pista_id} já foi atribuída à conta {p['conta_id']}")
    if conta_id == "-":
        conn.execute("update pistas_vagas set status = 'descartada' where id = ?", (pista_id,))
        conn.commit()
        return "descartada"
    if not conn.execute("select 1 from contas where id = ?", (conta_id,)).fetchone():
        raise PistaInvalida(f"conta {conta_id} não encontrada")
    sinal_id = _criar_sinal(conn, pista_id, conta_id, taxonomia, confianca=0.9, confirmado=True)
    conn.commit()
    return sinal_id


def abertas(conn) -> list[dict]:
    return [dict(r) | {"candidatas": json.loads(r["candidatos_json"] or "[]")} for r in conn.execute(
        "select * from pistas_vagas where status = 'aberta' order by data_coleta desc")]
