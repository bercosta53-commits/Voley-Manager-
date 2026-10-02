"""Normaliza o campo de localização (texto livre) de exports de prospecção em país, UF e cidade.

Heurística, não geocodificação: cobre o que aparece de fato nesses exports (sigla, nome do estado por
extenso em PT ou EN, com ou sem acento, e as maiores cidades brasileiras). O que não reconhece como
Brasil vira país "a confirmar" — não força um país errado.
"""

from __future__ import annotations

from dataclasses import dataclass

from .identidade import sem_acentos

UFS = (
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
    "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)

# Nome do estado por extenso (PT e as variantes em EN mais comuns em exports de ferramentas americanas),
# sempre comparado sem acento e em minúsculas — a chave já está nessa forma.
_NOMES_UF = {
    "AC": ["acre"], "AL": ["alagoas"], "AP": ["amapa"], "AM": ["amazonas"],
    "BA": ["bahia"], "CE": ["ceara"], "DF": ["distrito federal", "federal district"],
    "ES": ["espirito santo"], "GO": ["goias"], "MA": ["maranhao"],
    "MT": ["mato grosso"], "MS": ["mato grosso do sul"], "MG": ["minas gerais"],
    "PA": ["para"], "PB": ["paraiba"], "PR": ["parana"], "PE": ["pernambuco"],
    "PI": ["piaui"], "RJ": ["rio de janeiro"], "RN": ["rio grande do norte"],
    "RS": ["rio grande do sul"], "RO": ["rondonia"], "RR": ["roraima"],
    "SC": ["santa catarina"], "SP": ["sao paulo"], "SE": ["sergipe"], "TO": ["tocantins"],
}
# "State of São Paulo" etc.: mesma lista, com o prefixo em inglês.
_ALIASES_UF: dict[str, str] = {}
for _uf, _nomes in _NOMES_UF.items():
    for _nome in _nomes:
        _ALIASES_UF[_nome] = _uf
        _ALIASES_UF[f"state of {_nome}"] = _uf
        _ALIASES_UF[f"estado de {_nome}"] = _uf
        _ALIASES_UF[f"estado do {_nome}"] = _uf

# ~100 maiores cidades do Brasil por população, mapeadas para a UF. Cobre as capitais e os polos
# citados no pedido (Joinville, Caxias do Sul, Londrina, Campinas); não é exaustivo.
CIDADE_PARA_UF = {
    "sao paulo": "SP", "guarulhos": "SP", "campinas": "SP", "sao bernardo do campo": "SP",
    "santo andre": "SP", "osasco": "SP", "sorocaba": "SP", "ribeirao preto": "SP",
    "sao jose dos campos": "SP", "mogi das cruzes": "SP", "santos": "SP", "diadema": "SP",
    "jundiai": "SP", "piracicaba": "SP", "carapicuiba": "SP", "bauru": "SP", "sao vicente": "SP",
    "franca": "SP", "praia grande": "SP", "limeira": "SP", "suzano": "SP", "taubate": "SP",
    "sao jose do rio preto": "SP", "americana": "SP", "barueri": "SP", "indaiatuba": "SP",
    "cotia": "SP", "marilia": "SP", "itu": "SP",
    "rio de janeiro": "RJ", "sao goncalo": "RJ", "duque de caxias": "RJ", "nova iguacu": "RJ",
    "niteroi": "RJ", "belford roxo": "RJ", "campos dos goytacazes": "RJ", "sao joao de meriti": "RJ",
    "petropolis": "RJ", "volta redonda": "RJ", "mage": "RJ", "macae": "RJ", "itaborai": "RJ",
    "cabo frio": "RJ", "angra dos reis": "RJ", "nova friburgo": "RJ", "barra mansa": "RJ", "resende": "RJ",
    "belo horizonte": "MG", "uberlandia": "MG", "contagem": "MG", "juiz de fora": "MG", "betim": "MG",
    "montes claros": "MG", "ribeirao das neves": "MG", "uberaba": "MG", "governador valadares": "MG",
    "ipatinga": "MG", "sete lagoas": "MG", "divinopolis": "MG", "santa luzia": "MG",
    "pocos de caldas": "MG", "patos de minas": "MG",
    "salvador": "BA", "feira de santana": "BA", "vitoria da conquista": "BA", "camacari": "BA",
    "itabuna": "BA", "juazeiro": "BA", "ilheus": "BA", "lauro de freitas": "BA",
    "curitiba": "PR", "londrina": "PR", "maringa": "PR", "ponta grossa": "PR", "cascavel": "PR",
    "sao jose dos pinhais": "PR", "foz do iguacu": "PR", "colombo": "PR", "guarapuava": "PR",
    "paranagua": "PR", "toledo": "PR", "apucarana": "PR",
    "porto alegre": "RS", "caxias do sul": "RS", "pelotas": "RS", "canoas": "RS", "santa maria": "RS",
    "gravatai": "RS", "viamao": "RS", "novo hamburgo": "RS", "sao leopoldo": "RS", "passo fundo": "RS",
    "rio grande": "RS", "alvorada": "RS",
    "recife": "PE", "jaboatao dos guararapes": "PE", "olinda": "PE", "caruaru": "PE",
    "petrolina": "PE", "paulista": "PE",
    "fortaleza": "CE", "caucaia": "CE", "juazeiro do norte": "CE", "maracanau": "CE", "sobral": "CE",
    "belem": "PA", "ananindeua": "PA", "santarem": "PA", "maraba": "PA", "parauapebas": "PA",
    "joinville": "SC", "florianopolis": "SC", "blumenau": "SC", "sao jose": "SC", "criciuma": "SC",
    "chapeco": "SC", "itajai": "SC", "jaragua do sul": "SC", "lages": "SC", "balneario camboriu": "SC",
    "goiania": "GO", "aparecida de goiania": "GO", "anapolis": "GO", "rio verde": "GO",
    "sao luis": "MA", "imperatriz": "MA", "sao jose de ribamar": "MA",
    "joao pessoa": "PB", "campina grande": "PB",
    "vitoria": "ES", "vila velha": "ES", "serra": "ES", "cariacica": "ES", "linhares": "ES",
    "cachoeiro de itapemirim": "ES",
    "teresina": "PI", "parnaiba": "PI",
    "natal": "RN", "mossoro": "RN",
    "maceio": "AL", "arapiraca": "AL",
    "cuiaba": "MT", "varzea grande": "MT", "rondonopolis": "MT",
    "campo grande": "MS", "dourados": "MS",
    "brasilia": "DF",
    "aracaju": "SE",
    "porto velho": "RO", "ji-parana": "RO",
    "palmas": "TO",
    "rio branco": "AC",
    "macapa": "AP",
    "manaus": "AM", "parintins": "AM",
    "boa vista": "RR",
}

_SINAIS_BRASIL = {"brasil", "brazil"}


def _normalizar(texto: str) -> str:
    return sem_acentos(texto).lower().strip()


@dataclass
class Local:
    pais: str  # "Brasil" | texto bruto do que veio (quando não reconhecido) | "desconhecido"
    uf: str | None
    cidade: str | None


def interpretar_local(texto: object) -> Local:
    bruto = str(texto or "").strip()
    if not bruto:
        return Local(pais="desconhecido", uf=None, cidade=None)
    partes = [p.strip() for p in bruto.replace("/", ",").split(",") if p.strip()]
    partes_norm = [_normalizar(p) for p in partes]

    uf_achada: str | None = None
    cidade_achada: str | None = None
    brasil = False

    for p in partes_norm:
        if p in _SINAIS_BRASIL:
            brasil = True

    # 1) sigla isolada (token de 2 letras que bate com uma UF): é o sinal mais forte.
    for original, p in zip(partes, partes_norm):
        if original.strip().upper() in UFS and len(original.strip()) == 2:
            uf_achada = original.strip().upper()
            brasil = True
            break

    # 2) nome do estado por extenso (com ou sem "state of"/"estado de").
    if not uf_achada:
        for p in partes_norm:
            if p in _ALIASES_UF:
                uf_achada = _ALIASES_UF[p]
                brasil = True
                break

    # 3) cidade sozinha (ou "Cidade, Brasil" sem UF): tabela das maiores cidades.
    for p in partes_norm:
        if p in CIDADE_PARA_UF:
            cidade_achada = p
            if not uf_achada:
                uf_achada = CIDADE_PARA_UF[p]
            brasil = True
            break

    if not brasil:
        return Local(pais=partes[-1] if partes else "desconhecido", uf=None, cidade=None)

    # Cidade "bonita": usa o texto original (não o normalizado) quando é o pedaço que bateu.
    cidade_original = None
    if cidade_achada:
        for original, p in zip(partes, partes_norm):
            if p == cidade_achada:
                cidade_original = original
                break
    elif partes and uf_achada and partes_norm[0] not in _ALIASES_UF and partes[0].strip().upper() != uf_achada:
        # "Joinville, SC": o primeiro pedaço que não é a UF nem o país costuma ser a cidade.
        cidade_original = partes[0]

    return Local(pais="Brasil", uf=uf_achada, cidade=cidade_original)
