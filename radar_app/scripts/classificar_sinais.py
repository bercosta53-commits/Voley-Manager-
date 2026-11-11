#!/usr/bin/env python3
"""Classificador (IA): lê cada sinal/evento de notícia e transforma a manchete num sinal de prospecção.

uso: python3 scripts/classificar_sinais.py [--limite N] [--dormir SEGUNDOS] [--tudo]
     python3 scripts/classificar_sinais.py --exportar itens.json      # só gera a lista a classificar
     python3 scripts/classificar_sinais.py --respostas respostas.json # aplica respostas já prontas
precisa de: variável de ambiente ANTHROPIC_API_KEY (menos com --exportar/--respostas)

Pra cada item devolve três coisas:
  - "tipo": a categoria (taxonomia abaixo) ou "irrelevante" quando a notícia não é sobre ESTA empresa
    (homônimo: "Holmes" trazendo Sherlock Holmes ou Elizabeth Holmes, por exemplo).
  - "sinal": a sinalização rápida que aparece em destaque no cartão, até 45 caracteres e sem cara de
    manchete: "Expansão para o Paraná", "Lançamento de novo produto", "Contratação de head de vendas",
    "Abertura de 30 vagas comerciais".
  - "porQueAgora": o fato numa frase curta começando por verbo (vai no "Por quê" da conta e no rascunho
    da mensagem).

O que muda na base:
  - "irrelevante" sai de sinais[]/historico[] e o link vai pra base["descartados"], que os coletores
    consultam pra não trazer o mesmo item de volta na próxima rodada.
  - "noticia_setorial" (notícia sem fato acionável) sai da caixa de Hoje: vai pro histórico da conta e
    não soma ponto no score.
  - itens já classificados (com "sinal") são pulados, a não ser com --tudo.

--exportar e --respostas permitem classificar sem chave da API (por exemplo, numa sessão do Claude
Code): o primeiro grava os itens pendentes, o segundo aplica um arquivo
[{"chave", "tipo", "sinal", "porQueAgora"}, ...] pelo mesmo caminho que a resposta da API.

Esta é a fonte "Classificador (IA)" já cadastrada em gerar_dados.py (categoria 3.4 da spec) — o passo
que sempre ficou pendente: os outros coletores (notícias, vagas) escrevem o texto cru da fonte original
(manchete, título de vaga) em porQueAgora; este script lê esse texto e troca por um resumo direto, do
tamanho de um tweet, mais a classificação certa — sem precisar abrir o link pra entender o que aconteceu.

Não roda em cima de vaga (fonte "Página de carreiras"): título de vaga já é curto e direto, não tem o
problema de manchete de notícia que este passo resolve.

Classifica em lotes (LOTE itens por chamada) pra não fazer uma chamada por sinal. Cada item é identificado
pelo id (sinais) ou pela url (histórico, que não tem id) — relê a resposta por essa chave, nunca por
posição na lista, porque o modelo pode devolver menos itens do que mandou (um item malformado, por
exemplo) e a lista desalinharia.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import anthropic
except ImportError:  # só a chamada à API precisa; --exportar/--respostas rodam sem
    anthropic = None

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
MODELO = "claude-haiku-5-5"
LOTE = 20
MAX_TOKENS_SAIDA = 4096

# peso de cada tipo — mesma escala usada em gerar_dados.py e nos outros coletores (0-9). Notícia sem fato
# acionável vale 0: entra na linha do tempo da conta, mas não é sinal e não esquenta a conta.
TAXONOMIA: dict[str, tuple[str, int]] = {
    "executivo_chegou": ("Novo executivo", 9),
    "executivo_saiu": ("Saída de executivo", 7),
    "fusao_aquisicao": ("Fusão ou aquisição", 9),
    "captacao": ("Captação", 8),
    "lancamento_ia": ("Lançamento ligado a IA", 8),
    "resultados_crescimento": ("Resultados de crescimento", 6),
    "nova_unidade": ("Nova unidade", 6),
    "expansao_mercado": ("Expansão de mercado", 6),
    "lancamento_produto": ("Lançamento de produto", 6),
    "lancamento_servico": ("Lançamento de serviço", 6),
    "parceria": ("Nova parceria", 5),
    "premio": ("Prêmio ou reconhecimento", 4),
    "palestra_evento": ("Palestra ou evento", 4),
    "layoffs": ("Corte de equipe", 5),
    "noticia_setorial": ("Notícia do setor", 0),
}
IRRELEVANTE = "irrelevante"
MAX_SINAL = 45

PROMPT_SISTEMA = f"""Você classifica notícias sobre empresas de TI/B2B pra um radar de prospecção da \
Velora (agência de marketing e crescimento B2B). Cada item traz a manchete crua, o veículo e a empresa a \
que o coletor associou a notícia (nome e site). Devolva:
- "tipo": "{IRRELEVANTE}" quando a notícia NÃO é sobre essa empresa — homônimo (pessoa, filme, peça, \
personagem, outra empresa com o mesmo nome, palavra comum). Ex.: empresa "Holmes" e notícia sobre \
Sherlock Holmes ou Elizabeth Holmes → "{IRRELEVANTE}". Na dúvida sobre ser a mesma empresa, "{IRRELEVANTE}".
  Senão, uma destas chaves exatas, a que melhor descreve o fato — {", ".join(TAXONOMIA)}.
  Se a notícia é sobre lançamento de produto OU serviço ligado a Inteligência Artificial (IA, modelo de \
linguagem, agente de IA, automação com IA etc.), classifique como "lancamento_ia", não como \
"lancamento_produto"/"lancamento_servico" — isso tem prioridade sobre as outras categorias de lançamento.
  "executivo_chegou"/"executivo_saiu" são sobre C-level, diretoria, VPs — não gerentes ou cargos \
operacionais. "resultados_crescimento" é só pra resultado POSITIVO (lucro, receita ou faturamento subindo, \
recorde) — resultado em queda, prejuízo, ação caindo ou projeção pra baixo NÃO é "resultados_crescimento" \
(isso infla o score como se fosse boa notícia), classifique como "noticia_setorial". "palestra_evento" é \
pra quando alguém da própria empresa participou, palestrou ou debateu em evento/congresso/painel — não \
confundir com "premio" (a empresa sendo reconhecida/premiada/ranqueada: GPTW, "melhor empresa pra \
trabalhar", selo, ranking de mercado). Cuidado com "premio": só conta se é a PRÓPRIA empresa sendo \
reconhecida — se é um cliente dela que ganhou prêmio usando o produto, ou se a empresa só publica o \
ranking (não foi ela quem ganhou), isso é "noticia_setorial", não "premio". Se a notícia não se \
encaixa em nenhuma categoria específica, use "noticia_setorial".
- "sinal": a sinalização rápida do fato, até 45 caracteres, sem nome da empresa, sem cara de manchete. \
Exemplos: "Expansão para o Paraná", "Lançamento de novo produto", "Contratação de head de vendas", \
"Novo CFO vindo do Nubank", "Aquisição da Celero", "Série A de R$ 15 milhões", "Reconhecida no GPTW 2026", \
"Lançamento de agente de IA", "Receita cresceu 40% no trimestre". Pra "noticia_setorial", algo como \
"Citada em matéria do setor".
- "porQueAgora": um resumo DIRETO do fato, em português, menor que um tweet (até 140 caracteres), sem \
precisar abrir o link pra entender. Comece pela ação (verbo), não pelo nome da empresa (isso já aparece \
em outro lugar na tela). Nada de linguagem de manchete de marketing ("revoluciona", "transforma", \
"ponta a ponta") — diga o fato puro. Exemplos bons: "Contratou novo CFO vindo do Nubank.", "Abriu \
escritório em Belo Horizonte.", "Cortou 12% do time após reestruturação.", "Lançou agente de IA pra \
atendimento ao cliente.", "Faturamento cresceu 40% no último trimestre."

Devolva SOMENTE um array JSON, sem nenhum texto antes ou depois, no formato:
[{{"chave": "...", "tipo": "...", "sinal": "...", "porQueAgora": "..."}}, ...]
Um objeto por item recebido, usando a mesma "chave" que veio no item de entrada."""


def montar_itens(tudo: bool = False) -> list[dict]:
    """Cada item: chave (id do sinal, ou url do evento de histórico — histórico não tem id próprio),
    texto (porQueAgora cru de hoje), fonte e a empresa (nome + site, pra pegar homônimo). Pula vaga
    (fonte "Página de carreiras"), exemplo e o que já foi classificado (tem "sinal"), menos com tudo=True."""
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    contas = {c["id"]: c for c in base.get("contas", [])}

    def pular(x: dict) -> bool:
        return bool(x.get("exemplo") or x.get("fonte") == "Página de carreiras" or (x.get("sinal") and not tudo))

    def empresa(c: dict | None) -> str:
        return f'{c["nome"]} ({c.get("dominio") or "sem site"})' if c else ""

    itens = []
    for s in base.get("sinais", []):
        if pular(s):
            continue
        itens.append({"chave": s["id"], "texto": s["porQueAgora"], "fonte": s.get("fonte", ""),
                      "empresa": empresa(contas.get(s["contaId"])), "_onde": ("sinal", s["id"])})
    for c in base.get("contas", []):
        for e in c.get("historico", []):
            if pular(e):
                continue
            itens.append({"chave": e["url"], "texto": e["porQueAgora"], "fonte": e.get("fonte", ""),
                          "empresa": empresa(c), "_onde": ("historico", c["id"], e["url"])})
    return itens


def classificar_lote(client, lote: list[dict]) -> dict[str, dict]:
    """Retorna {chave: {tipo, porQueAgora}} só pras chaves que o modelo devolveu corretamente."""
    entrada = [{"chave": i["chave"], "empresa": i["empresa"], "texto": i["texto"], "fonte": i["fonte"]} for i in lote]
    resposta = client.messages.create(
        model=MODELO,
        max_tokens=MAX_TOKENS_SAIDA,
        output_config={"effort": "low"},
        system=PROMPT_SISTEMA,
        messages=[{"role": "user", "content": json.dumps(entrada, ensure_ascii=False)}],
    )
    texto = "".join(b.text for b in resposta.content if b.type == "text").strip()
    if texto.startswith("```"):
        texto = texto.split("\n", 1)[1].rsplit("```", 1)[0]
    return validar(json.loads(texto))


def validar(bruto: list[dict]) -> dict[str, dict]:
    """Retorna {chave: {tipo, sinal, porQueAgora}} só pros itens bem formados (API ou --respostas)."""
    resultado = {}
    for item in bruto:
        chave, tipo = item.get("chave"), item.get("tipo")
        if not chave:
            continue
        if tipo == IRRELEVANTE:
            resultado[chave] = {"tipo": tipo}
            continue
        sinal = (item.get("sinal") or "").strip().rstrip(".")
        resumo = (item.get("porQueAgora") or "").strip()
        if not (tipo in TAXONOMIA and sinal and len(sinal) <= MAX_SINAL and resumo and len(resumo) <= 280):
            continue
        resultado[chave] = {"tipo": tipo, "sinal": sinal, "porQueAgora": resumo}
    return resultado


def aplicar(base: dict, itens: list[dict], resultados: dict[str, dict]) -> dict[str, int]:
    """Grava as respostas na base. Devolve a contagem por desfecho (reclassificado, descartado,
    para_historico)."""
    sinais_por_id = {s["id"]: s for s in base.get("sinais", [])}
    contas_por_id = {c["id"]: c for c in base.get("contas", [])}
    descartados = set(base.get("descartados", []))
    remover_sinais: set[str] = set()
    contagem = {"reclassificado": 0, "descartado": 0, "para_historico": 0}

    for item in itens:
        r = resultados.get(item["chave"])
        if not r:
            continue
        onde = item["_onde"]
        if onde[0] == "sinal":
            alvo = sinais_por_id.get(onde[1])
            conta = contas_por_id.get(alvo["contaId"]) if alvo else None
        else:
            conta = contas_por_id.get(onde[1])
            alvo = next((e for e in conta.get("historico", []) if e["url"] == onde[2]), None) if conta else None
        if alvo is None:
            continue

        if r["tipo"] == IRRELEVANTE:
            descartados.add(alvo["url"])
            if conta is not None:
                # conta com homônimo recorrente: o coletor de notícias passa a buscar com contexto
                conta["homonimos"] = conta.get("homonimos", 0) + 1
            if onde[0] == "sinal":
                remover_sinais.add(alvo["id"])
            else:
                conta["historico"] = [e for e in conta["historico"] if e["url"] != alvo["url"]]
            contagem["descartado"] += 1
            continue

        tipo = r["tipo"]
        alvo["tipo"], alvo["rotulo"], alvo["sinal"], alvo["porQueAgora"] = tipo, TAXONOMIA[tipo][0], r["sinal"], r["porQueAgora"]
        if onde[0] == "sinal":
            alvo["peso"] = TAXONOMIA[tipo][1]
            if tipo == "noticia_setorial" and conta is not None:
                # notícia sem fato acionável não é sinal: sai da caixa e fica só na linha do tempo
                remover_sinais.add(alvo["id"])
                conta.setdefault("historico", []).append({k: alvo[k] for k in (
                    "tipo", "rotulo", "sinal", "porQueAgora", "fonte", "data", "url", "exemplo")})
                conta["historico"].sort(key=lambda h: h["data"], reverse=True)
                contagem["para_historico"] += 1
                continue
        contagem["reclassificado"] += 1

    base["sinais"] = [s for s in base.get("sinais", []) if s["id"] not in remover_sinais]
    base["descartados"] = sorted(descartados)
    return contagem


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limite", type=int, default=None, help="só os N primeiros itens (pra testar rápido)")
    ap.add_argument("--dormir", type=float, default=0.5, help="segundos de espera entre lotes (padrão 0.5)")
    ap.add_argument("--tudo", action="store_true", help="reclassifica também o que já tem sinal")
    ap.add_argument("--exportar", type=Path, help="só grava os itens pendentes nesse arquivo e sai")
    ap.add_argument("--respostas", type=Path, help="aplica respostas prontas desse arquivo, sem chamar a API")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")

    itens = montar_itens(args.tudo)
    if args.limite:
        itens = itens[: args.limite]
    if not itens:
        print("nada pra classificar.")
        return

    if args.exportar:
        publico = [{k: v for k, v in i.items() if not k.startswith("_")} for i in itens]
        args.exportar.write_text(json.dumps(publico, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(itens)} itens pendentes gravados em {args.exportar}")
        return

    if args.respostas:
        base = json.loads(DESTINO.read_text(encoding="utf-8"))
        resultados = validar(json.loads(args.respostas.read_text(encoding="utf-8")))
        contagem = aplicar(base, itens, resultados)
        DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(itens)} itens pendentes · {len(resultados)} respostas válidas · {contagem}")
        return

    if anthropic is None:
        sys.exit("precisa do pacote 'anthropic' (pip install anthropic)")
    client = anthropic.Anthropic()  # resolve ANTHROPIC_API_KEY (ou outro mecanismo do SDK) do ambiente

    lotes = [itens[i : i + LOTE] for i in range(0, len(itens), LOTE)]
    erros: list[str] = []
    resultados_acumulados: dict[str, dict] = {}

    for i, lote in enumerate(lotes, 1):
        try:
            resultados_acumulados.update(classificar_lote(client, lote))
        except Exception as e:
            # um lote malformado não pode derrubar a rodada inteira (mesma lição dos outros coletores).
            erros.append(f"lote {i}: {e}")
        print(f"  lote {i}/{len(lotes)} processado...", file=sys.stderr)
        time.sleep(args.dormir)

    # recarrega a base pra aplicar em cima do estado mais atual (outro coletor pode ter rodado nesse meio tempo)
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    contagem = aplicar(base, itens, resultados_acumulados)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{len(itens)} itens enviados · {contagem}")
    if erros:
        print(f"{len(erros)} erro(s) de lote:")
        for msg in erros[:10]:
            print(f"  - {msg}")


if __name__ == "__main__":
    main()
