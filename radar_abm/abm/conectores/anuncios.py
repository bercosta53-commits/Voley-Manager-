"""Conector de bibliotecas de anúncios: Google Ads Transparency Center e Meta Ad Library, uma vez por semana.

1. BUSCA    Para cada conta com anunciante CONFIRMADO (contas.google_advertiser_ids e contas.meta_page_ids), pede ao
            provedor os anúncios mostrados no Brasil (Google pelo SerpApi gratuito, Meta pelo Apify; veja
            provedor_anuncios.py): uma busca por anunciante do
            Google e uma por página do Meta. No Google, o texto e o destino de cada anúncio vêm de uma segunda busca,
            feita só para anúncios que o radar ainda não viu (até RADAR_ANUNCIOS_MAX_DETALHES por conta). Conta sem ID
            confirmado é pulada: os IDs saem de "anuncios descobrir" e só valem depois de "anuncios confirmar".
            LinkedIn não é coletado (regra de não raspar o LinkedIn): o raio-x traz o link para consulta manual.
            Anúncio não muda de hora em hora: a conta coletada há menos de 7 dias é pulada.
2. TRADUZ   Cada anúncio vira: plataforma, data de início, status (ativo ou não), texto, chamada para ação, URL de
            destino e formato. Guarda texto e link; imagens e vídeos nunca são baixados.
3. COMPARA  Com a foto da semana anterior (que carrega um histórico de 12 semanas), por plataforma:
            - começou a anunciar (nenhum anúncio ativo antes, agora tem): ALTO;
            - parou de anunciar (zero anúncios ativos há 30 dias ou mais, depois de ter anunciado): MÉDIO-ALTO;
            - entrou num canal novo (anunciava só no Google e passou a anunciar também no Meta, ou o contrário): MÉDIO;
            - mudou a mensagem (produto, vertical ou público novo): o Claude compara os temas desta semana com os das
              8 anteriores (sem a chave da API, uma regra simples procura público empresarial e temas novos): MÉDIO;
            - destino novo (landing page dedicada, subdomínio, ferramenta de LP como HubSpot ou RD Station): MÉDIO;
            - variação brusca de criativos ativos (±50% em 4 semanas): BAIXO;
            - infraestrutura sem operação (o site tem pixel do Meta, tag do Google Ads ou LinkedIn Insight, mas não há
              anúncio ativo): MÉDIO. As tecnologias do site vêm do conector de site, em site_tecnologias.
            Na primeira coleta de cada plataforma, a foto vira só a linha de base.
4. ENTREGA  Cada mudança vira sinal com um "por que agora" que interpreta o movimento (não repete o dado) e diz com quem
            falar: CMO ou head de marketing; sem essa pessoa, diretor comercial ou CEO. Os anúncios ficam na tabela
            anuncios e o raio-x de mídia da conta é refeito.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

from .. import config
from ..db import agora, novo_id
from ..identidade import normalizar_dominio, sem_acentos
from ..taxonomia import Taxonomia, carregar
from .base import Conector, Item
from .provedor_anuncios import ProvedorAnuncios

PLATAFORMAS = ("google", "meta")
NOME_PLATAFORMA = {"google": "Google", "meta": "Meta (Facebook e Instagram)"}
DIAS_ATIVO_GOOGLE = 7          # anúncio do Google visto nos últimos 7 dias conta como ativo
DIAS_PARADO = 30               # "parou de anunciar" só depois de 30 dias sem anúncio ativo
SEMANAS_HISTORICO = 12
SEMANAS_MENSAGEM = 8
FERRAMENTAS_LP = {
    "hubspot": ("hs-sites.com", "hubspotpages.com", "hubspot.com", "hsforms.com", "hs-sites-na"),
    "RD Station": ("rdstation.com", "rdstation.com.br", "lp.rdstation"),
    "Unbounce": ("unbouncepages.com",),
    "Leadlovers": ("leadlovers.com",),
    "Instapage": ("pagedemo.co", "instapage.com"),
    "Landingi": ("landingi.com",),
}
PALAVRAS_B2B = ("empresa", "empresas", "pj", "cnpj", "negocio", "negocios", "b2b", "corporativo", "industria",
                "capital de giro", "antecipacao", "folha de pagamento", "para o seu negocio")
PARADAS = set("a o e de da do das dos para com sem por em no na nos nas um uma que se seu sua seus suas mais voce voces "
              "ao aos como ja nao sim ate sobre agora hoje aqui ou the and to of".split())


# ------------------------------------------------------------------------------------------ leitura

def _data(texto) -> str | None:
    if not texto:
        return None
    return str(texto)[:10]


def _textos(no, chaves=("headline", "title", "long_headline", "description", "body", "text")) -> list[str]:
    """Procura, em qualquer nível, os textos do anúncio (a tela de detalhes do Google varia de formato)."""
    achados: list[str] = []
    if isinstance(no, dict):
        for k, v in no.items():
            if isinstance(v, str) and k in chaves and v.strip():
                achados.append(v.strip())
            elif isinstance(v, (dict, list)):
                achados += _textos(v, chaves)
    elif isinstance(no, list):
        for x in no:
            achados += _textos(x, chaves)
    return list(dict.fromkeys(achados))


def _primeiro(no, chaves) -> str:
    v = _textos(no, chaves)
    return v[0] if v else ""


def ler_google(resposta: dict, hoje: date, detalhes: dict[str, dict]) -> list[dict]:
    anuncios = []
    for c in resposta.get("ad_creatives") or []:
        ultimo = _data(c.get("last_shown_datetime"))
        det = detalhes.get(c.get("id"), {})
        destino = _primeiro(det, ("destination_url", "final_url", "link", "url", "visible_url", "display_url"))
        if not destino and c.get("target_domain"):
            destino = f"https://{c['target_domain']}/"
        anuncios.append({
            "plataforma": "google", "id": c.get("id"), "anunciante_id": (c.get("advertiser") or {}).get("id"),
            "inicio": _data(c.get("first_shown_datetime")), "ultimo": ultimo,
            "ativo": bool(ultimo and (hoje - date.fromisoformat(ultimo)).days <= DIAS_ATIVO_GOOGLE),
            "texto": " · ".join(_textos(det))[:600], "cta": _primeiro(det, ("call_to_action", "cta", "cta_text")),
            "url_destino": destino, "formato": c.get("format") or "",
        })
    return anuncios


def ler_meta(resposta: dict) -> list[dict]:
    anuncios = []
    for a in resposta.get("ads") or []:
        s = a.get("snapshot") or {}
        cartoes = s.get("cards") or []
        corpo = ((s.get("body") or {}).get("text") if isinstance(s.get("body"), dict) else s.get("body")) or ""
        if not corpo and cartoes:
            corpo = " · ".join(filter(None, (c.get("body") for c in cartoes)))
        titulo = s.get("title") or (cartoes[0].get("title") if cartoes else "")
        link = s.get("link_url") or (cartoes[0].get("link_url") if cartoes else "") or ""
        anuncios.append({
            "plataforma": "meta", "id": str(a.get("ad_archive_id")), "anunciante_id": str(a.get("page_id") or s.get("page_id") or ""),
            "inicio": _data(a.get("start_date")), "ultimo": _data(a.get("end_date")), "ativo": bool(a.get("is_active")),
            "texto": " · ".join(filter(None, [titulo if titulo and titulo != s.get("page_name") else "", corpo]))[:600],
            "cta": s.get("cta_text") or s.get("cta_type") or "", "url_destino": link,
            "formato": (s.get("display_format") or "").lower(),
        })
    return anuncios


# ------------------------------------------------------------------------------------------ destinos

def classificar_destino(url: str, dominio_conta: str | None) -> tuple[str, str]:
    """(tipo, rótulo) do destino: home, lp_dedicada, subdominio, ferramenta_lp, formulario, whatsapp, app, rede_social, outro."""
    if not url:
        return "desconhecido", "sem destino"
    u = urlparse(url if "://" in url else f"https://{url}")
    host = (u.hostname or "").lower().removeprefix("www.")
    caminho = u.path.strip("/").lower()
    if host in ("wa.me", "api.whatsapp.com", "whatsapp.com") or "whatsapp" in host:
        return "whatsapp", "WhatsApp"
    if host in ("play.google.com", "apps.apple.com") or "onelink" in host:
        return "app", "loja de aplicativo"
    if host.endswith(("facebook.com", "instagram.com", "fb.com", "linkedin.com", "youtube.com")):
        return "rede_social", "rede social"
    if host.endswith(("forms.gle",)) or "typeform" in host or "docs.google.com" in host:
        return "formulario", "formulário"
    for ferramenta, dominios in FERRAMENTAS_LP.items():
        if any(host.endswith(d) or d in host for d in dominios):
            return "ferramenta_lp", f"landing page em {ferramenta}"
    base = normalizar_dominio(dominio_conta) if dominio_conta else None
    if base and host != base and host.endswith("." + base):
        return "subdominio", f"subdomínio {host}"
    if base and host == base:
        if not caminho or caminho in ("home", "index.html", "inicio"):
            return "home", "home do site"
        if any(p in caminho for p in ("contato", "fale-conosco", "formulario")):
            return "formulario", "formulário do site"
        return "lp_dedicada", f"página dedicada /{caminho.split('/')[0]}"
    return "outro", host or "outro destino"


def _chave_destino(url: str) -> str:
    u = urlparse(url if "://" in url else f"https://{url}")
    host = (u.hostname or "").lower().removeprefix("www.")
    primeiro = u.path.strip("/").split("/")[0].lower()
    return f"{host}/{primeiro}"


# ------------------------------------------------------------------------------------------ mensagem

def _palavras(texto: str) -> list[str]:
    t = re.sub(r"[^a-z0-9 ]", " ", sem_acentos(texto).lower())
    return [p for p in t.split() if len(p) > 3 and p not in PARADAS]


class ComparadorRegras:
    """Sem a chave da API do Claude: procura público empresarial novo e temas novos. Confiança baixa (vai para revisão)."""

    nome = "regras"

    def comparar(self, conta: dict, atuais: list[str], anteriores: list[list[str]]) -> dict | None:
        antes = " ".join(" ".join(s) for s in anteriores)
        agora_ = " ".join(atuais)
        norm = lambda t: " " + re.sub(r"[^a-z0-9 ]", " ", sem_acentos(t).lower()) + " "
        b2b_agora = [p for p in PALAVRAS_B2B if f" {p} " in norm(agora_)]
        b2b_antes = [p for p in PALAVRAS_B2B if f" {p} " in norm(antes)]
        if b2b_agora and not b2b_antes:
            return {"tipo_mudanca": "publico", "novo_tema": ", ".join(b2b_agora[:3]),
                    "resumo": f"os anúncios passaram a falar com empresas ({', '.join(b2b_agora[:3])}), o que não aparecia nas "
                              f"{len(anteriores)} semanas anteriores", "confianca": 0.5}
        vistas = set(_palavras(antes))
        contagem: dict[str, int] = {}
        for texto in atuais:
            for p in set(_palavras(texto)) - vistas:
                contagem[p] = contagem.get(p, 0) + 1
        novas = [p for p, n in sorted(contagem.items(), key=lambda x: -x[1]) if n >= 2][:4]
        if len(novas) >= 2:
            return {"tipo_mudanca": "produto", "novo_tema": ", ".join(novas),
                    "resumo": f"apareceu um tema novo nos anúncios ({', '.join(novas)}), ausente nas {len(anteriores)} semanas anteriores",
                    "confianca": 0.5}
        return None


class ComparadorClaude:
    """O Claude compara os temas dos anúncios desta semana com os das 8 anteriores (saída em esquema JSON)."""

    SISTEMA = ("Você analisa anúncios de uma empresa brasileira para uma consultoria de growth B2B. Compare os anúncios "
               "desta semana com os das semanas anteriores e diga se a MENSAGEM mudou de forma relevante: produto novo, "
               "vertical nova, público novo (por exemplo, passou a falar com empresas) ou oferta nova. Variações de "
               "redação do mesmo tema não contam. No resumo, em uma frase em português, interprete o movimento para quem "
               "vai abordar a empresa; não repita o texto dos anúncios.")
    ESQUEMA = {"type": "object", "additionalProperties": False,
               "required": ["mudou", "tipo_mudanca", "novo_tema", "resumo", "confianca"],
               "properties": {"mudou": {"type": "boolean"},
                              "tipo_mudanca": {"type": "string", "enum": ["produto", "vertical", "publico", "oferta", "nenhuma"]},
                              "novo_tema": {"type": "string"}, "resumo": {"type": "string"}, "confianca": {"type": "number"}}}

    def __init__(self, client=None, modelo: str | None = None):
        from ..classificador import MODELO_PADRAO

        self.modelo = modelo or config.valor("ANTHROPIC_MODEL") or MODELO_PADRAO
        self._client = client
        self.nome = f"claude:{self.modelo}"

    @property
    def client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic(max_retries=4, timeout=120)
        return self._client

    def comparar(self, conta: dict, atuais: list[str], anteriores: list[list[str]]) -> dict | None:
        from ..classificador import COM_FALLBACK, ClassificacaoFalhou

        pedido = json.dumps({"empresa": conta.get("nome_fantasia"), "segmento": conta.get("subsegmento"),
                             "esta_semana": atuais[:20],
                             "semanas_anteriores": [s[:12] for s in anteriores[-SEMANAS_MENSAGEM:]]}, ensure_ascii=False)
        params = dict(model=self.modelo, max_tokens=2000, system=self.SISTEMA,
                      messages=[{"role": "user", "content": pedido}],
                      output_config={"effort": "low", "format": {"type": "json_schema", "schema": self.ESQUEMA}})
        if self.modelo in COM_FALLBACK:
            params.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        try:
            resp = self.client.beta.messages.create(**params)
        except Exception as e:  # sem API, a comparação de mensagem fica para a próxima semana; o resto do conector segue
            raise ClassificacaoFalhou(f"comparação de mensagem com o Claude falhou: {e}") from e
        if resp.stop_reason in ("refusal", "max_tokens"):
            return None
        texto = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        r = json.loads(texto or "{}")
        if not r.get("mudou") or r.get("tipo_mudanca") == "nenhuma":
            return None
        r["confianca"] = min(max(float(r.get("confianca") or 0), 0.0), 1.0)
        return r


def comparador_padrao():
    return ComparadorClaude() if config.valor("ANTHROPIC_API_KEY") else ComparadorRegras()


# ------------------------------------------------------------------------------------------ conector

class ConectorAnuncios(Conector):
    nome = "anuncios"
    descricao = "Bibliotecas de anúncios (Google e Meta)"

    def __init__(self, *args, hoje: date | None = None, taxonomia: Taxonomia | None = None, comparador=None,
                 forcar: bool = False, **kw):
        super().__init__(*args, **kw)
        self.hoje = hoje or date.today()
        self.tax = taxonomia or carregar()
        self.comparador = comparador or comparador_padrao()
        self.forcar = forcar
        self.provedor = ProvedorAnuncios(self.conn, self.http, self.dry_run, self.nome)
        self.intervalo = int(config.valor("RADAR_ANUNCIOS_INTERVALO_DIAS", "7"))
        # No SerpApi gratuito (250 buscas/mês), o detalhe do Google (uma busca por anúncio) sai caro: 2 por conta.
        self.max_detalhes = int(config.valor("RADAR_ANUNCIOS_MAX_DETALHES", "5" if self.provedor.tipo == "searchapi" else "2"))
        self._foto: dict | None = None
        self._anuncios: list[dict] = []

    # ---- dry-run sem gastar busca

    def executar(self, contas: list):
        """Com o provedor pago, o dry-run não faz nenhuma busca: mostra o plano e o custo estimado.
        Com respostas salvas (testes e ensaios), roda os quatro passos normalmente, sem gravar."""
        if not (self.dry_run and not getattr(self.http, "pasta", None)):
            return super().executar(contas)
        from ..registro import Execucao

        ex = Execucao(self.nome, True)
        ex.comecar()
        self.passo(f"== {self.nome}: {len(contas)} conta(s)  (DRY-RUN: nenhuma busca paga é feita)")
        google = paginas = 0
        for conta in contas:
            self.conta = conta
            if self.pode_rodar(conta):
                continue
            g, m = len(self.ids(conta, "google")), len(self.ids(conta, "meta"))
            google += g * (1 + self.max_detalhes)
            paginas += m
            self.passo(f"-- {conta['id']} {conta['nome_fantasia']}: {self.descrever_busca(conta)}")
        p = self.provedor
        if p.tipo == "searchapi":
            total = google + paginas
            self.passo(f"== até {total} busca(s) no SearchAPI, cerca de US$ {total * p.custo_busca:.2f}")
        else:
            usadas, _ = p.uso_do_mes("serpapi")
            _, gasto = p.uso_do_mes("apify")
            custo_meta = paginas * p.max_anuncios_pagina * p.custo_anuncio_apify
            self.passo(f"== Google (SerpApi, grátis): até {google} busca(s); já usadas {usadas} de {p.limite_serpapi} este mês")
            self.passo(f"== Meta (Apify): {paginas} página(s), até {paginas * p.max_anuncios_pagina} anúncios, cerca de "
                       f"US$ {custo_meta:.2f}; já gastos US$ {gasto:.2f} de {p.limite_apify:.2f} este mês")
        self.passo("   (o detalhe do Google só é pedido para anúncio que o radar ainda não viu)")
        ex.terminar(self.conn)
        return ex

    # ---- quais contas

    @staticmethod
    def ids(conta, plataforma: str) -> list[str]:
        campo = "google_advertiser_ids" if plataforma == "google" else "meta_page_ids"
        try:
            return [str(x) for x in json.loads(conta[campo] or "[]") if str(x).strip()]
        except (json.JSONDecodeError, TypeError, IndexError, KeyError):
            return []

    def pode_rodar(self, conta) -> str:
        if not any(self.ids(conta, p) for p in PLATAFORMAS):
            return "sem anunciante confirmado (rode: anuncios descobrir)"
        if not self.forcar:
            r = self.conn.execute("select max(data) as d from snapshots where conta_id = ? and conector = ?",
                                  (conta["id"], self.nome)).fetchone()
            if r and r["d"] and (self.hoje - date.fromisoformat(r["d"][:10])).days < self.intervalo:
                return f"coletada há menos de {self.intervalo} dias (checagem semanal)"
        return ""

    def descrever_busca(self, conta) -> str:
        g, m = self.ids(conta, "google"), self.ids(conta, "meta")
        partes = []
        if g:
            partes.append(f"Google: {len(g)} anunciante(s)")
        if m:
            partes.append(f"Meta: {len(m)} página(s)")
        return f"{self.provedor.provedor_google}/{self.provedor.provedor_meta}, anúncios mostrados no Brasil · " + "; ".join(partes)

    # ---- 1. BUSCA

    def buscar(self, conta) -> dict:
        from .provedor_anuncios import LimiteMensal

        vistos = {r["id"] for r in self.conn.execute(
            "select id from anuncios where conta_id = ? and plataforma = 'google' and texto is not null and texto != ''",
            (conta["id"],))}
        bruto = {"google": [], "meta": [], "detalhes": {}, "plataformas": []}
        # Plataforma sem orçamento no mês fica fora desta coleta (não conta como "parou de anunciar").
        try:
            for adv in self.ids(conta, "google"):
                resp = self.provedor.google_anuncios(adv)
                bruto["google"].append(resp)
                novos = [c for c in resp.get("ad_creatives") or [] if c.get("id") not in vistos]
                for c in novos[: self.max_detalhes]:
                    try:
                        bruto["detalhes"][c["id"]] = self.provedor.google_detalhe(adv, c["id"])
                    except LimiteMensal:
                        raise
                    except Exception as e:  # sem detalhe, o anúncio entra sem texto; tenta de novo na próxima semana
                        self.passo(f"               detalhe do anúncio {c['id']} indisponível: {e}")
            if self.ids(conta, "google"):
                bruto["plataformas"].append("google")
        except LimiteMensal as e:
            bruto["google"] = []
            self.passo(f"               Google fora desta coleta: {e}")
        try:
            for pagina in self.ids(conta, "meta"):
                bruto["meta"].append(self.provedor.meta_anuncios(pagina))
            if self.ids(conta, "meta"):
                bruto["plataformas"].append("meta")
        except LimiteMensal as e:
            bruto["meta"] = []
            self.passo(f"               Meta fora desta coleta: {e}")
        return bruto

    # ---- 2. TRADUZ

    def traduzir(self, bruto: dict) -> dict:
        anuncios = [a for r in bruto["google"] for a in ler_google(r, self.hoje, bruto["detalhes"])]
        anuncios += [a for r in bruto["meta"] for a in ler_meta(r)]
        # o mesmo anúncio pode vir de duas páginas ou dois anunciantes: fica um
        unicos = {(a["plataforma"], a["id"]): a for a in anuncios}
        return {"anuncios": list(unicos.values()), "plataformas": bruto["plataformas"]}

    def resumir(self, novo: dict) -> str:
        partes = []
        for p in novo["plataformas"]:
            doP = [a for a in novo["anuncios"] if a["plataforma"] == p]
            partes.append(f"{NOME_PLATAFORMA[p]}: {sum(a['ativo'] for a in doP)} ativo(s) de {len(doP)} anúncio(s)")
        return "; ".join(partes) or "nenhuma plataforma"

    # ---- 3. COMPARA

    def comparar(self, novo: dict, anterior: dict | None) -> list[Item]:
        conta = self.conta
        hoje = self.hoje.isoformat()
        ativos = [a for a in novo["anuncios"] if a["ativo"]]
        contagem = {p: sum(1 for a in ativos if a["plataforma"] == p) for p in novo["plataformas"]}
        ant = anterior or {}
        ant_cont = ant.get("ativos", {})
        estado = {p: dict(v) for p, v in (ant.get("estado") or {}).items()}
        itens: list[Item] = []
        quem = self._quem_abordar(conta["id"])

        comecaram, canais_novos = [], []
        for p in novo["plataformas"]:
            e = estado.setdefault(p, {})
            n, antes = contagem[p], ant_cont.get(p)
            if n > 0:
                if not antes:
                    # Na linha de base, a sequência começa no anúncio ativo mais antigo; depois, na semana em que voltou.
                    inicio = min((a["inicio"] for a in ativos if a["plataforma"] == p and a["inicio"]), default=hoje)
                    e["ativo_desde"] = inicio if antes is None else hoje
                    e["zerado_desde"] = None
                e["ultimo_ativo"] = hoje
                e["parou_avisado"] = False
            else:
                if antes is None:
                    # Linha de base sem anúncio ativo: o histórico da biblioteca diz quando parou (se já anunciou).
                    doP = [a for a in novo["anuncios"] if a["plataforma"] == p]
                    fins = [a["ultimo"] for a in doP if a["ultimo"]]
                    if fins:
                        e["ultimo_ativo"] = max(fins)
                        e["ativo_desde"] = min((a["inicio"] for a in doP if a["inicio"]), default=max(fins))
                if not e.get("zerado_desde"):
                    e["zerado_desde"] = e.get("ultimo_ativo") or hoje
            if anterior is None or antes is None:
                continue  # primeira coleta desta plataforma: linha de base
            if antes == 0 and n > 0:
                (canais_novos if any(ant_cont.get(o, 0) > 0 for o in ant_cont if o != p) else comecaram).append(p)
            parado = n == 0 and e.get("ultimo_ativo") and not e.get("parou_avisado") and \
                (self.hoje - date.fromisoformat(e["ultimo_ativo"])).days >= DIAS_PARADO
            if parado:
                e["parou_avisado"] = True
                itens.append(self._item_parou(p, e, quem))

        if comecaram:
            n = sum(contagem[p] for p in comecaram)
            zerado = min((estado[p].get("zerado_desde") or hoje for p in comecaram), default=hoje)
            semanas = max(1, (self.hoje - date.fromisoformat(zerado)).days // 7)
            onde = " e no ".join(NOME_PLATAFORMA[p] for p in comecaram)
            itens.append(self._item("anuncio_comecou", "/".join(comecaram),
                                    f"Começou a anunciar no {onde} ({n} anúncio(s) ativo(s)) depois de pelo menos {semanas} "
                                    "semana(s) sem mídia: está montando aquisição agora.", quem, 0.9,
                                    f"{n} anúncio(s) ativo(s) no {onde}"))
        for p in canais_novos:
            outros = [NOME_PLATAFORMA[o] for o in ant_cont if o != p and ant_cont.get(o, 0) > 0]
            itens.append(self._item("anuncio_canal_novo", p,
                                    f"Passou a anunciar também no {NOME_PLATAFORMA[p]} ({contagem[p]} anúncio(s)), além do "
                                    f"{' e do '.join(outros)}: está ampliando os canais de aquisição.", quem, 0.9,
                                    f"{contagem[p]} anúncio(s) no {NOME_PLATAFORMA[p]}"))

        historico = list(ant.get("historico") or []) + [{"semana": hoje, **contagem}]
        historico = historico[-SEMANAS_HISTORICO:]
        if anterior is not None:
            itens += self._volume(historico, contagem, estado, quem)
            itens += self._destinos(ativos, set(ant.get("destinos") or []), quem)
        temas = list(ant.get("temas") or [])
        textos_novos = [a["texto"] for a in ativos if a["texto"]]
        if anterior is not None and textos_novos and len([t for t in temas if t]) >= 2:
            itens += self._mensagem(conta, textos_novos, temas[-SEMANAS_MENSAGEM:], quem)
        temas = (temas + [[t[:200] for t in textos_novos[:20]]])[-(SEMANAS_MENSAGEM + 1):]

        infra_avisado = ant.get("infra_avisado")
        tecnologias = [r["tecnologia"] for r in self.conn.execute(
            "select tecnologia from site_tecnologias where conta_id = ?", (conta["id"],))]
        if tecnologias and not ativos and (not infra_avisado or (self.hoje - date.fromisoformat(infra_avisado)).days >= 90):
            nomes = {"meta_pixel": "pixel do Meta", "google_ads_tag": "tag do Google Ads", "linkedin_insight": "LinkedIn Insight Tag"}
            lista = " e ".join(nomes[t] for t in tecnologias)
            itens.append(self._item("infraestrutura_sem_operacao", "site",
                                    f"Tem {lista} instalado(s) no site, mas nenhum anúncio ativo nas bibliotecas: tem a "
                                    "ferramenta, falta o motor.", quem, 0.8, f"{lista} no site; 0 anúncios ativos"))
            infra_avisado = hoje

        destinos = sorted(set(ant.get("destinos") or []) | {_chave_destino(a["url_destino"]) for a in ativos if a["url_destino"]})
        self._foto = {"ativos": contagem, "estado": estado, "historico": historico, "temas": temas,
                      "destinos": destinos[-200:], "infra_avisado": infra_avisado}
        self._anuncios = novo["anuncios"]
        return itens

    def conteudo_snapshot(self, novo: dict) -> dict:
        return self._foto or {}

    def _volume(self, historico, contagem, estado, quem) -> list[Item]:
        itens = []
        alvo = self.hoje - timedelta(days=28)
        base = min(historico[:-1], key=lambda h: abs((date.fromisoformat(h["semana"]) - alvo).days), default=None)
        if not base or abs((date.fromisoformat(base["semana"]) - alvo).days) > 7:
            return itens
        for p, n in contagem.items():
            antes = base.get(p)
            if antes is None or max(n, antes) < 4:
                continue
            variacao = (n - antes) / max(antes, 1)
            ultimo = estado[p].get("volume_avisado")
            if abs(variacao) >= 0.5 and (not ultimo or (self.hoje - date.fromisoformat(ultimo)).days >= 28):
                estado[p]["volume_avisado"] = self.hoje.isoformat()
                leitura = "aumento de orçamento ou campanha nova" if variacao > 0 else "corte de orçamento ou pausa de campanhas"
                itens.append(self._item("anuncio_volume", p,
                                        f"Criativos ativos no {NOME_PLATAFORMA[p]} foram de {antes} para {n} em 4 semanas "
                                        f"({variacao:+.0%}): provável {leitura}.", quem, 0.9,
                                        f"{antes} → {n} criativos ativos"))
        return itens

    def _destinos(self, ativos, vistos: set, quem) -> list[Item]:
        novos = {}
        for a in ativos:
            if not a["url_destino"]:
                continue
            chave = _chave_destino(a["url_destino"])
            tipo, rotulo = classificar_destino(a["url_destino"], self.conta["dominio"])
            if chave not in vistos and tipo in ("lp_dedicada", "subdominio", "ferramenta_lp"):
                novos.setdefault(chave, (a, rotulo))
        if not novos:
            return []
        rotulos = ", ".join(r for _, r in list(novos.values())[:3])
        a = next(iter(novos.values()))[0]
        return [self._item("anuncio_destino_novo", a["plataforma"],
                           f"Os anúncios passaram a levar para {rotulos}: sinal de que está estruturando o funil de aquisição.",
                           quem, 0.8, "; ".join(x["url_destino"] for x, _ in list(novos.values())[:3]), url=a["url_destino"])]

    def _mensagem(self, conta, atuais, anteriores, quem) -> list[Item]:
        try:
            r = self.comparador.comparar(dict(conta), atuais, anteriores)
        except Exception as e:
            self.passo(f"               comparação de mensagem ficou para a próxima semana: {e}")
            return []
        if not r:
            return []
        resumo = r["resumo"].rstrip(".")
        resumo = resumo[0].upper() + resumo[1:]
        return [self._item("anuncio_mensagem_nova", "anuncios", f"{resumo}.", quem, float(r.get("confianca", 0.5)),
                           f"tema novo: {r.get('novo_tema', '')}", classificador_extra=getattr(self.comparador, "nome", ""))]

    def _item_parou(self, p, e, quem) -> Item:
        semanas = max(1, (self.hoje - date.fromisoformat(e["ultimo_ativo"])).days // 7)
        duracao = ""
        if e.get("ativo_desde"):
            meses = (date.fromisoformat(e["ultimo_ativo"]) - date.fromisoformat(e["ativo_desde"])).days // 30
            duracao = f" depois de {meses} meses contínuos" if meses >= 2 else " depois de um período curto"
        return self._item("anuncio_parou", p,
                          f"Parou de anunciar no {NOME_PLATAFORMA[p]} há {semanas} semanas{duracao}: provável corte, troca de "
                          "agência ou problema de resultado.", quem, 0.9, f"0 anúncios ativos desde {e['ultimo_ativo']}")

    def _item(self, tipo, plataforma, por_que, quem, confianca, trecho, url=None, classificador_extra="") -> Item:
        if quem:
            por_que = f"{por_que} Falar com {quem}."
        return Item(self.conta["id"], tipo, por_que, url, trecho, self.hoje.isoformat(),
                    {"plataforma": plataforma, "confianca": confianca, "por_que_agora": por_que,
                     "classificador_extra": classificador_extra})

    def _quem_abordar(self, conta_id: str) -> str | None:
        """CMO ou head de marketing; sem essa pessoa, diretor comercial ou CEO."""
        pessoas = self.conn.execute("select nome, cargo from pessoas where conta_id = ? and cargo is not null", (conta_id,)).fetchall()
        ordem = [r"\b(cmo|marketing|growth|marca)\b", r"\b(comercial|vendas|cro|receita|negocios)\b",
                 r"\b(ceo|presidente|superintendente|diretor[a]? executiv|diretor[a]?[- ]geral|fundador)"]
        for padrao in ordem:
            for p in pessoas:
                if re.search(padrao, sem_acentos(p["cargo"] or "").lower()):
                    return f"{p['nome']} ({p['cargo']})"
        return None

    # ---- 4. ENTREGA

    def entregar(self, itens: list[Item]) -> int:
        from ..raiox_midia import gerar_raiox

        for a in self._anuncios:
            self.conn.execute(
                """insert into anuncios (plataforma, id, conta_id, anunciante_id, inicio, ultimo, ativo, texto, cta, url_destino,
                                         formato, visto_em)
                   values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   on conflict (plataforma, id) do update set ultimo = excluded.ultimo, ativo = excluded.ativo,
                       texto = coalesce(nullif(excluded.texto, ''), anuncios.texto), cta = coalesce(nullif(excluded.cta, ''), anuncios.cta),
                       url_destino = coalesce(nullif(excluded.url_destino, ''), anuncios.url_destino), visto_em = excluded.visto_em""",
                (a["plataforma"], a["id"], self.conta["id"], a["anunciante_id"], a["inicio"], a["ultimo"], int(a["ativo"]),
                 a["texto"], a["cta"], a["url_destino"], a["formato"], agora()))
        # anúncio da conta que não voltou nesta coleta deixou de estar ativo
        vistos = {(a["plataforma"], a["id"]) for a in self._anuncios}
        for r in self.conn.execute("select plataforma, id from anuncios where conta_id = ? and ativo = 1", (self.conta["id"],)).fetchall():
            if (r["plataforma"], r["id"]) not in vistos:
                self.conn.execute("update anuncios set ativo = 0 where plataforma = ? and id = ?", (r["plataforma"], r["id"]))

        gravados = 0
        for it in itens:
            hash_ = self.impressao_digital(self.nome, it.conta_id, it.tipo, it.extra["plataforma"], self.hoje.isoformat())
            if not self.gravar_item_bruto(it, hash_, veiculo="Bibliotecas de anúncios"):
                continue
            tipo = self.tax.tipo(it.tipo, self.conta["braco_icp"])
            status = "alerta" if it.extra["confianca"] >= self.tax.limiar_confianca else "revisar"
            self.conn.execute(
                """insert into sinais (id, conta_id, tipo, evento_id, peso, confianca, membro_comite, angulo, evidencia_url,
                                       evidencia_trecho, data_fato, data_alerta, status, por_que_agora, classificador)
                   values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (novo_id(), it.conta_id, it.tipo, hash_, tipo.peso if tipo else None, it.extra["confianca"],
                 tipo.membro_comite if tipo else None, tipo.angulo_sugerido if tipo else None, it.url, it.trecho,
                 it.data_fato, agora(), status, it.extra["por_que_agora"], self.nome))
            gravados += 1
        gerar_raiox(self.conn, self.conta["id"], self.hoje, self._foto)
        return gravados
