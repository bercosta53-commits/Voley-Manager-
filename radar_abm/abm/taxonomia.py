"""Leitura e validação do sinais.yaml: tipos de sinal, pesos, meia-vida, membro do comitê e ângulo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from . import config

BRACOS = ("servicos_profissionais", "servicos_financeiros", "tecnologia")
MEMBROS = ("decisor", "influenciador", "usuario", "bloqueador")


class TaxonomiaInvalida(ValueError):
    pass


@dataclass(frozen=True)
class Tipo:
    id: str
    rotulo: str
    bracos: tuple[str, ...]  # vazio = todos
    peso: int
    meia_vida_dias: int
    membro_comite: str
    angulo_sugerido: str
    palavras_chave: tuple[str, ...]
    ajustes: dict

    def vale_para(self, braco: str | None) -> bool:
        return not self.bracos or braco in self.bracos

    def para(self, braco: str | None) -> "Tipo":
        """O tipo com os ajustes do braço aplicados (ex.: peso maior em serviços profissionais)."""
        ajuste = self.ajustes.get(braco or "", {})
        if not ajuste:
            return self
        return Tipo(self.id, self.rotulo, self.bracos, int(ajuste.get("peso", self.peso)),
                    int(ajuste.get("meia_vida_dias", self.meia_vida_dias)),
                    ajuste.get("membro_comite", self.membro_comite), ajuste.get("angulo_sugerido", self.angulo_sugerido),
                    self.palavras_chave, self.ajustes)


@dataclass(frozen=True)
class RegrasVagas:
    areas: tuple[str, ...] = ()
    lideranca: tuple[str, ...] = ()
    comercial: tuple[str, ...] = ()
    ignorar: tuple[str, ...] = ()


@dataclass(frozen=True)
class Taxonomia:
    versao: int
    limiar_confianca: float
    tipos: dict[str, Tipo]
    ruido: dict[str, tuple[str, ...]]
    vagas: RegrasVagas = RegrasVagas()

    def tipos_para(self, braco: str | None) -> list[Tipo]:
        return [t.para(braco) for t in self.tipos.values() if t.vale_para(braco)]

    def tipo(self, tipo_id: str, braco: str | None) -> Tipo | None:
        t = self.tipos.get(tipo_id)
        return t.para(braco) if t else None


def caminho() -> Path:
    return Path(config.valor("RADAR_TAXONOMIA", str(config.RAIZ / "sinais.yaml")))


def carregar(arquivo: str | Path | None = None) -> Taxonomia:
    arquivo = Path(arquivo or caminho())
    try:
        dados = yaml.safe_load(arquivo.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise TaxonomiaInvalida(f"{arquivo.name} não é um YAML válido: {e}") from e
    erros: list[str] = []
    tipos: dict[str, Tipo] = {}
    for tid, t in (dados.get("tipos") or {}).items():
        t = t or {}
        onde = f"tipo '{tid}'"
        bracos = t.get("braco_icp", "todos")
        bracos = () if bracos == "todos" else tuple(bracos if isinstance(bracos, list) else [bracos])
        for b in bracos:
            if b not in BRACOS:
                erros.append(f"{onde}: braço '{b}' desconhecido (use {', '.join(BRACOS)} ou todos)")
        peso, meia = t.get("peso"), t.get("meia_vida_dias")
        if not isinstance(peso, int) or not 1 <= peso <= 10:
            erros.append(f"{onde}: peso deve ser um número inteiro de 1 a 10 (está {peso!r})")
        if not isinstance(meia, int) or meia <= 0:
            erros.append(f"{onde}: meia_vida_dias deve ser um número inteiro maior que zero (está {meia!r})")
        if t.get("membro_comite") not in MEMBROS:
            erros.append(f"{onde}: membro_comite deve ser {', '.join(MEMBROS)} (está {t.get('membro_comite')!r})")
        if not t.get("angulo_sugerido"):
            erros.append(f"{onde}: falta angulo_sugerido")
        for b, aj in (t.get("ajustes") or {}).items():
            if b not in BRACOS:
                erros.append(f"{onde}: ajuste para braço desconhecido '{b}'")
            if "peso" in aj and not (isinstance(aj["peso"], int) and 1 <= aj["peso"] <= 10):
                erros.append(f"{onde}: ajuste de peso em {b} deve ser de 1 a 10")
        tipos[tid] = Tipo(tid, t.get("rotulo") or tid, bracos, peso if isinstance(peso, int) else 1,
                          meia if isinstance(meia, int) and meia > 0 else 1, t.get("membro_comite") or "decisor",
                          t.get("angulo_sugerido") or "", tuple(t.get("palavras_chave") or ()), t.get("ajustes") or {})
    limiar = dados.get("limiar_confianca", 0.6)
    if not isinstance(limiar, (int, float)) or not 0 < limiar <= 1:
        erros.append(f"limiar_confianca deve ficar entre 0 e 1 (está {limiar!r})")
    if not tipos:
        erros.append("nenhum tipo de sinal definido em 'tipos'")
    if erros:
        raise TaxonomiaInvalida(f"{arquivo.name} tem {len(erros)} problema(s):\n  - " + "\n  - ".join(erros))
    ruido = {k: tuple(v or ()) for k, v in (dados.get("ruido") or {}).items()}
    v = dados.get("vagas") or {}
    vagas = RegrasVagas(*(tuple(str(x) for x in (v.get(k) or ())) for k in ("areas", "lideranca", "comercial", "ignorar")))
    return Taxonomia(int(dados.get("versao", 1)), float(limiar), tipos, ruido, vagas)
