"""Leitura do registro do modelo (payload.scoreModelo) e adaptação dos sinais históricos para a 3.3.

1. scoreModelo: o registro dos parâmetros efetivamente usados no snapshot. Os valores que casam com chaves do
   parametros_32.json (por nome, ignorando camelCase/snake_case) sobrepõem o JSON; o resto é reportado.
2. scoreModelo.revisoesPorSinal: revisões individuais (por id de sinal). Prevalecem sobre a inferência do motor
   (chave, base, categoria, cargo, pontua, fonte, data, precisão, confiança, vínculo atual).
3. Sinais históricos: os 345 registros ainda não têm os campos novos. O adaptador interpreta o que existe:
   dataPrecisao → dataEstimada; confianca (alta/média/baixa ou número) → classification_confidence;
   fontes[] fica como está (a corroboração é decidida em fontes.corroborar).

O formato exato de scoreModelo é lido de forma tolerante (aliases abaixo); chaves desconhecidas aparecem no
relatório do reconciliador para ajuste, nunca são descartadas em silêncio.
"""
from __future__ import annotations

import copy
import re

ALIAS_REVISAO = {
    "chave": ("chave", "chaveSpec", "tipoSpec", "classe", "classificacao"),
    "base": ("base", "baseScore", "score_base", "scoreBase"),
    "categoria": ("categoria",),
    "nivel": ("nivel", "nivelCargo", "nivel_cargo", "senioridade"),
    "cargo": ("cargo", "cargoOcupante", "cargoVaga", "cargo_ocupante"),
    "pontua": ("pontua", "contar", "ativo", "incluir"),
    "fonte_fator": ("fatorFonte", "fonte_fator", "fonteFator"),
    "fonte_nivel": ("fonteNivel", "nivelFonte", "fonteTipo"),
    "data": ("data", "dataFato", "data_fato"),
    "dataPrecisao": ("dataPrecisao", "precisaoData", "data_precisao"),
    "confianca": ("confianca", "confiança", "confidence"),
    "vinculoAtual": ("vinculoAtual", "vinculo_atual", "vinculoConfirmado"),
    "responsabilidadeClevel": ("responsabilidadeClevel", "clevel", "responsabilidade_clevel"),
    "movimentoId": ("movimentoId", "movimento_id", "movimento"),
    "acontecimentoId": ("acontecimentoId", "acontecimento_id", "evento_grupo"),
    "motivo": ("motivo", "justificativa", "nota"),
}
CONHECIDAS = {a for v in ALIAS_REVISAO.values() for a in v} | {"id", "sinalId", "sinal_id", "revisadoEm", "revisadoPor", "autor", "em"}

PRECISAO_EXATA = {"dia", "exata", "exato", "data_exata", "confirmada"}
CONFIANCA_TEXTO = {"alta": 0.95, "media": 0.85, "média": 0.85, "baixa": 0.65}


def _snake(k: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", k).lower()


def revisoes(modelo: dict | None) -> dict[str, dict]:
    """revisoesPorSinal como dict {id: revisão normalizada}; aceita dict por id ou lista com id."""
    bruto = (modelo or {}).get("revisoesPorSinal") or {}
    if isinstance(bruto, list):
        bruto = {str(r.get("id") or r.get("sinalId") or r.get("sinal_id")): r for r in bruto if isinstance(r, dict)}
    out = {}
    for sid, r in bruto.items():
        if not isinstance(r, dict):
            continue
        norm = {}
        for campo, aliases in ALIAS_REVISAO.items():
            for a in aliases:
                if a in r and r[a] is not None:
                    norm[campo] = r[a]
                    break
        norm["_desconhecidas"] = sorted(set(r) - CONHECIDAS)
        out[str(sid)] = norm
    return out


def parametros_do_modelo(modelo: dict | None, p32: dict) -> tuple[dict, list[tuple[str, object, object]], list[str]]:
    """Sobrepõe ao parametros_32.json os valores do scoreModelo que casam por nome. Devolve (parâmetros, diferenças
    [(caminho, json, modelo)], chaves do modelo sem correspondência)."""
    p = copy.deepcopy(p32)
    difs, sobras = [], []
    if not modelo:
        return p, difs, sobras

    def achar(destino: dict, chave: str):
        for k in destino:
            if _snake(k) == _snake(chave) or k.replace("_", "").lower() == chave.replace("_", "").lower():
                return k
        return None

    def mesclar(destino: dict, origem: dict, caminho: str):
        for k, v in origem.items():
            if k in ("revisoesPorSinal", "versao", "atualizadoEm", "descricao"):
                continue
            alvo = achar(destino, k)
            if alvo is None:
                sobras.append(f"{caminho}{k}")
                continue
            if isinstance(destino[alvo], dict) and isinstance(v, dict):
                mesclar(destino[alvo], v, f"{caminho}{alvo}.")
            elif destino[alvo] != v:
                difs.append((f"{caminho}{alvo}", destino[alvo], v))
                destino[alvo] = v

    fonte = modelo.get("parametros") if isinstance(modelo.get("parametros"), dict) else modelo
    mesclar(p, fonte, "")
    return p, difs, sobras


def adaptar(ev: dict, revisao: dict | None, p33: dict) -> dict:
    """Sinal histórico → sinal 3.3. Não altera o original; a revisão individual prevalece."""
    e = dict(ev)
    rev = revisao or {}
    if rev:
        e["_revisao"] = rev
        for campo in ("data", "dataPrecisao", "confianca", "movimentoId", "acontecimentoId", "vinculoAtual", "responsabilidadeClevel"):
            if campo in rev:
                e[campo] = rev[campo]
        if "fonte_nivel" in rev:
            e["fonteNivelRevisado"] = rev["fonte_nivel"]
        if "fonte_fator" in rev:
            e["fonteFatorRevisado"] = float(rev["fonte_fator"])
    precisao = str(e.get("dataPrecisao") or "").strip().lower()
    if precisao and precisao not in PRECISAO_EXATA:
        e["dataEstimada"] = True
    c = e.get("confianca")
    if c is not None and "classification_confidence" not in e:
        if isinstance(c, (int, float)):
            e["classification_confidence"] = float(c) if c <= 1 else float(c) / 100
        elif str(c).strip().lower() in CONFIANCA_TEXTO:
            e["classification_confidence"] = (p33.get("adaptador", {}).get("confianca") or CONFIANCA_TEXTO)[str(c).strip().lower()]
    return e
