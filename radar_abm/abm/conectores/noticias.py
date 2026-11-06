"""Conector Google News (RSS): vigia o que a imprensa publica sobre cada conta.

1. BUSCA    Monta uma consulta com os aliases ligados da conta e pede ao Google News a lista de notícias
            dos últimos 30 dias no formato RSS (uma lista padronizada de notícias, em texto):
            https://news.google.com/rss/search?q={consulta}&hl=pt-BR&gl=BR&ceid=BR:pt-419
            Escritórios de advocacia têm nome de sobrenome ("Pinheiro Guimarães"), então a consulta exige
            também uma palavra de contexto (advogados, escritório, sócio...). O mesmo vale para alias
            ambíguo que você aprovou. Termos negativos entram com sinal de menos (-"rua").
2. TRADUZ   De cada notícia: título (sem o " - Veículo" do fim), veículo, link, data e trecho.
3. COMPARA  Descarta o que não cita a empresa (o Google às vezes traz notícias que só citam no corpo, ou
            nem isso), o que tem termo negativo e o que já foi visto: mesmo link ou mesmo título
            normalizado (sem acento, pontuação e maiúsculas). Junta a mesma notícia publicada por vários
            veículos num único evento: títulos com as mesmas palavras-chave, publicados com até 3 dias
            de diferença.
4. ENTREGA  Grava cada notícia nova em itens_brutos, com o evento e o veículo. Quem decide se a notícia é
            sinal ou ruído é o classificador (fase 5); aqui ainda não nasce sinal.
"""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

from .. import config
from ..identidade import normalizar_nome, sem_acentos
from .base import Conector, Item

URL = "https://news.google.com/rss/search?q={q}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
MAX_ALIASES = 5
DIAS_MESMO_EVENTO = 3
SEMELHANCA_MINIMA = 0.5  # fração das palavras-chave do título menor que aparece no outro
PALAVRAS_EM_COMUM = 2    # e pelo menos estas palavras-chave em comum (manchete curta não casa com tudo)

CONTEXTO = {
    "servicos_profissionais": ["advogados", "advocacia", "escritório", "sócio", "sócia", "auditoria"],
    "servicos_financeiros": ["cooperativa", "seguros", "seguradora", "crédito", "consórcio", "banco"],
    "tecnologia": ["tecnologia", "software", "startup", "plataforma", "empresa"],
}

_PALAVRAS_VAZIAS = set("""
para como entre sobre apos mais pela pelo pelos pelas esta este isso essa esse seus suas
anos nesta neste desde onde quando qual quais cada muito ainda tambem pode podem sera
""".split())


def palavras_chave(titulo: str, ignorar: set[str]) -> set[str]:
    """Palavras de 4+ letras do título, cortadas nas 5 primeiras letras ('trabalhar' e 'trabalho' viram 'traba')."""
    tokens = re.findall(r"[a-z0-9]+", sem_acentos(titulo).lower())
    return {t[:5] for t in tokens if len(t) >= 4 and t not in _PALAVRAS_VAZIAS and t not in ignorar}


def semelhanca(a: set[str], b: set[str]) -> float:
    if len(a & b) < PALAVRAS_EM_COMUM:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def _cita(texto: str, termo: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(normalizar_nome(termo))}(?![a-z0-9])", normalizar_nome(texto)))


class ConectorNoticias(Conector):
    nome = "noticias"
    descricao = "Notícias do Google News (RSS)"

    def __init__(self, *args, hoje: date | None = None, **kw):
        super().__init__(*args, **kw)
        self.hoje = hoje or date.today()
        self.janela_dias = int(config.valor("RADAR_NOTICIAS_JANELA_DIAS", "30"))

    # --- consulta --------------------------------------------------------------------------------

    def aliases_ativos(self, conta) -> list:
        return self.conn.execute(
            """select * from aliases where conta_id = ? and ativo
               order by case tipo when 'fantasia' then 0 when 'manual' then 1 when 'variacao' then 2 else 3 end, termo""",
            (conta["id"],),
        ).fetchall()[:MAX_ALIASES]

    def negativos(self, aliases) -> list[str]:
        termos = []
        for a in aliases:
            for t in (a["termos_negativos"] or "").split(";"):
                if t.strip() and t.strip() not in termos:
                    termos.append(t.strip())
        return termos

    def consulta(self, conta) -> str:
        aliases = self.aliases_ativos(conta)
        termos = [f'"{a["termo"]}"' for a in aliases]
        q = termos[0] if len(termos) == 1 else f"({' OR '.join(termos)})"
        precisa_contexto = conta["braco_icp"] == "servicos_profissionais" or any(a["ambiguo"] for a in aliases)
        if precisa_contexto and conta["braco_icp"] in CONTEXTO:
            q += f" ({' OR '.join(CONTEXTO[conta['braco_icp']])})"
        q += "".join(f' -"{t}"' for t in self.negativos(aliases))
        return f"{q} when:{self.janela_dias}d"

    def pode_rodar(self, conta) -> str:
        return "" if self.aliases_ativos(conta) else "sem alias ligado"

    def descrever_busca(self, conta) -> str:
        return f"Google News, consulta: {self.consulta(conta)}"

    # 1. BUSCA
    def buscar(self, conta) -> dict:
        q = self.consulta(conta)
        return {"consulta": q, "xml": self.http.get(URL.format(q=quote_plus(q)), chave=conta["id"])}

    # 2. TRADUZ
    def traduzir(self, resposta_bruta: dict) -> dict:
        raiz = ET.fromstring(resposta_bruta["xml"])
        noticias = []
        for it in raiz.iter("item"):
            titulo = (it.findtext("title") or "").strip()
            veiculo = (it.findtext("source") or "").strip()
            if veiculo and titulo.endswith(f" - {veiculo}"):
                titulo = titulo[: -len(veiculo) - 3].strip()
            # "Título | Nome do Site..." : o nome do site no fim do título não é notícia.
            if veiculo and " | " in titulo and sem_acentos(veiculo.split()[0]).lower() in sem_acentos(titulo.rsplit(" | ", 1)[1]).lower():
                titulo = titulo.rsplit(" | ", 1)[0].strip()
            data = None
            if it.findtext("pubDate"):
                try:
                    data = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
                except (TypeError, ValueError):
                    data = None
            trecho = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", it.findtext("description") or ""))).strip()
            if veiculo and trecho.endswith(veiculo):
                trecho = trecho[: -len(veiculo)].strip()
            noticias.append({"titulo": titulo, "veiculo": veiculo, "url": (it.findtext("link") or "").strip(),
                             "data": data, "trecho": trecho or titulo})
        return {"consulta": resposta_bruta["consulta"], "noticias": noticias}

    def resumir(self, novo: dict) -> str:
        return f"{len(novo['noticias'])} notícia(s) no feed"

    def conteudo_snapshot(self, novo: dict) -> dict:
        # As notícias vistas ficam em itens_brutos; a foto guarda só a consulta usada (muda quando os aliases mudam).
        return {"consulta": novo["consulta"]}

    # 3. COMPARA
    def comparar(self, novo: dict, snapshot_anterior: dict | None) -> list[Item]:
        conta = self.conta
        aliases = self.aliases_ativos(conta)
        negativos = self.negativos(aliases)
        ignorar = {p for a in aliases for p in re.findall(r"[a-z0-9]+", sem_acentos(a["termo"]).lower())}
        limite = (self.hoje - timedelta(days=self.janela_dias)).isoformat()

        # Eventos recentes já gravados, para uma notícia nova poder se juntar a eles.
        eventos: dict[str, list[tuple[set[str], str | None]]] = {}  # evento -> (palavras-chave, data) de cada título
        for r in self.conn.execute(
                """select evento_id, titulo, data_publicacao from itens_brutos
                   where conector = ? and conta_id = ? and data_publicacao >= ?""",
                (self.nome, conta["id"], (self.hoje - timedelta(days=self.janela_dias + DIAS_MESMO_EVENTO)).isoformat()),
        ):
            eventos.setdefault(r["evento_id"], []).append((palavras_chave(r["titulo"], ignorar), r["data_publicacao"]))
        descartes: dict[str, list[str]] = {"não cita a empresa": [], "termo negativo": [], "já vista": [], "fora da janela": []}
        vistos_agora: set[str] = set()
        itens: list[Item] = []
        for n in novo["noticias"]:
            texto = f"{n['titulo']} {n['trecho']}"
            titulo_norm = normalizar_nome(n["titulo"])
            hash_ = self.impressao_digital(self.nome, conta["id"], titulo_norm)
            if n["data"] and n["data"] < limite:
                descartes["fora da janela"].append(n["titulo"])
                continue
            if not any(_cita(texto, a["termo"]) for a in aliases):
                descartes["não cita a empresa"].append(n["titulo"])
                continue
            if any(_cita(texto, t) for t in negativos):
                descartes["termo negativo"].append(n["titulo"])
                continue
            ja_vista = hash_ in vistos_agora or self.conn.execute(
                "select 1 from itens_brutos where conector = ? and conta_id = ? and (hash = ? or url = ?)",
                (self.nome, conta["id"], hash_, n["url"]),
            ).fetchone()
            if ja_vista:
                descartes["já vista"].append(n["titulo"])
                continue
            vistos_agora.add(hash_)

            chave = palavras_chave(n["titulo"], ignorar)
            evento_id = self._evento_mais_parecido(eventos, chave, n["data"])
            novo_evento = evento_id is None
            evento_id = evento_id or hash_
            eventos.setdefault(evento_id, []).append((chave, n["data"]))
            itens.append(Item(conta["id"], "noticia", n["titulo"], n["url"], n["trecho"], n["data"],
                              {"veiculo": n["veiculo"], "evento_id": evento_id, "hash": hash_, "novo_evento": novo_evento}))

        for motivo, titulos in descartes.items():
            if titulos:
                exemplos = "; ".join(t[:70] for t in titulos[:3])
                self.passo(f"               descartadas ({motivo}): {len(titulos)}  ex.: {exemplos}")
        return itens

    @staticmethod
    def _evento_mais_parecido(eventos: dict, chave: set[str], data: str | None) -> str | None:
        """O evento com o título mais parecido, publicado com até 3 dias de diferença; None se nenhum passar."""
        melhor, nota = None, 0.0
        for evento_id, titulos in eventos.items():
            for chave_outro, data_outro in titulos:
                if data and data_outro and abs((date.fromisoformat(data) - date.fromisoformat(data_outro)).days) > DIAS_MESMO_EVENTO:
                    continue
                s = semelhanca(chave, chave_outro)
                if s >= SEMELHANCA_MINIMA and s > nota:
                    melhor, nota = evento_id, s
        return melhor

    # 4. ENTREGA
    def entregar(self, itens: list[Item]) -> int:
        return sum(
            self.gravar_item_bruto(it, it.extra["hash"], evento_id=it.extra["evento_id"], veiculo=it.extra["veiculo"])
            for it in itens
        )
