#!/usr/bin/env python3
"""Classificador (IA): lê cada sinal/evento de notícia e reescreve tipo, rótulo e um resumo curto.

uso: python3 scripts/classificar_sinais.py [--limite N] [--dormir SEGUNDOS]
precisa de: variável de ambiente ANTHROPIC_API_KEY

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
except ImportError:
    sys.exit("precisa do pacote 'anthropic' (pip install anthropic)")

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
MODELO = "claude-haiku-5-5"
LOTE = 20
MAX_TOKENS_SAIDA = 4096

# peso de cada tipo — mesma escala usada em gerar_dados.py e nos outros coletores (0-9).
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
    "layoffs": ("Corte de equipe", 5),
    "noticia_setorial": ("Notícia do setor", 3),
}

PROMPT_SISTEMA = f"""Você classifica notícias sobre empresas de TI/B2B pra um radar de prospecção. Pra \
cada item (um texto cru de manchete ou título, já associado a uma empresa), devolva:
- "tipo": uma destas chaves exatas, a que melhor descreve o fato — {", ".join(TAXONOMIA)}.
  Se a notícia é sobre lançamento de produto OU serviço ligado a Inteligência Artificial (IA, modelo de \
linguagem, agente de IA, automação com IA etc.), classifique como "lancamento_ia", não como \
"lancamento_produto"/"lancamento_servico" — isso tem prioridade sobre as outras categorias de lançamento.
  "executivo_chegou"/"executivo_saiu" são sobre C-level, diretoria, VPs — não gerentes ou cargos \
operacionais. "resultados_crescimento" é só pra resultado POSITIVO (lucro, receita ou faturamento subindo, \
recorde) — resultado em queda, prejuízo, ação caindo ou projeção pra baixo NÃO é "resultados_crescimento" \
(isso infla o score como se fosse boa notícia), classifique como "noticia_setorial". Se a notícia não se \
encaixa em nenhuma categoria específica, use "noticia_setorial".
- "porQueAgora": um resumo DIRETO do fato, em português, menor que um tweet (até 140 caracteres), sem \
precisar abrir o link pra entender. Comece pela ação (verbo), não pelo nome da empresa (isso já aparece \
em outro lugar na tela). Nada de linguagem de manchete de marketing ("revoluciona", "transforma", \
"ponta a ponta") — diga o fato puro. Exemplos bons: "Contratou novo CFO vindo do Nubank.", "Abriu \
escritório em Belo Horizonte.", "Cortou 12% do time após reestruturação.", "Lançou agente de IA pra \
atendimento ao cliente.", "Faturamento cresceu 40% no último trimestre."

Devolva SOMENTE um array JSON, sem nenhum texto antes ou depois, no formato:
[{{"chave": "...", "tipo": "...", "porQueAgora": "..."}}, ...]
Um objeto por item recebido, usando a mesma "chave" que veio no item de entrada."""


def montar_itens() -> list[dict]:
    """Cada item: chave (id do sinal, ou url do evento de histórico — histórico não tem id próprio),
    texto (porQueAgora cru de hoje), fonte, empresa. Pula vaga (fonte "Página de carreiras") e exemplo."""
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    itens = []
    for s in base.get("sinais", []):
        if s.get("exemplo") or s.get("fonte") == "Página de carreiras":
            continue
        itens.append({"chave": s["id"], "texto": s["porQueAgora"], "fonte": s.get("fonte", ""), "_onde": ("sinal", s["id"])})
    for c in base.get("contas", []):
        for e in c.get("historico", []):
            if e.get("exemplo") or e.get("fonte") == "Página de carreiras":
                continue
            itens.append({"chave": e["url"], "texto": e["porQueAgora"], "fonte": e.get("fonte", ""), "_onde": ("historico", c["id"], e["url"])})
    return itens


def classificar_lote(client: "anthropic.Anthropic", lote: list[dict]) -> dict[str, dict]:
    """Retorna {chave: {tipo, porQueAgora}} só pras chaves que o modelo devolveu corretamente."""
    entrada = [{"chave": i["chave"], "texto": i["texto"], "fonte": i["fonte"]} for i in lote]
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
    bruto = json.loads(texto)

    resultado = {}
    for item in bruto:
        chave = item.get("chave")
        tipo = item.get("tipo")
        resumo = item.get("porQueAgora")
        if not (chave and tipo in TAXONOMIA and resumo and len(resumo) <= 280):
            continue
        resultado[chave] = {"tipo": tipo, "porQueAgora": resumo}
    return resultado


def aplicar(base: dict, itens: list[dict], resultados: dict[str, dict]) -> int:
    sinais_por_id = {s["id"]: s for s in base.get("sinais", [])}
    contas_por_id = {c["id"]: c for c in base.get("contas", [])}
    aplicados = 0
    for item in itens:
        r = resultados.get(item["chave"])
        if not r:
            continue
        tipo, peso_novo = r["tipo"], TAXONOMIA[r["tipo"]][1]
        onde = item["_onde"]
        if onde[0] == "sinal":
            alvo = sinais_por_id.get(onde[1])
            if alvo is None:
                continue
            alvo["tipo"], alvo["rotulo"], alvo["peso"], alvo["porQueAgora"] = tipo, TAXONOMIA[tipo][0], peso_novo, r["porQueAgora"]
        else:
            conta = contas_por_id.get(onde[1])
            if conta is None:
                continue
            evento = next((e for e in conta.get("historico", []) if e["url"] == onde[2]), None)
            if evento is None:
                continue
            evento["tipo"], evento["rotulo"], evento["porQueAgora"] = tipo, TAXONOMIA[tipo][0], r["porQueAgora"]
        aplicados += 1
    return aplicados


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limite", type=int, default=None, help="só os N primeiros itens (pra testar rápido)")
    ap.add_argument("--dormir", type=float, default=0.5, help="segundos de espera entre lotes (padrão 0.5)")
    args = ap.parse_args()

    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")

    client = anthropic.Anthropic()  # resolve ANTHROPIC_API_KEY (ou outro mecanismo do SDK) do ambiente
    itens = montar_itens()
    if args.limite:
        itens = itens[: args.limite]
    if not itens:
        print("nada pra classificar.")
        return

    lotes = [itens[i : i + LOTE] for i in range(0, len(itens), LOTE)]
    total_classificado = 0
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
    total_classificado = aplicar(base, itens, resultados_acumulados)
    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{len(itens)} itens enviados · {total_classificado} reclassificados com sucesso")
    if erros:
        print(f"{len(erros)} erro(s) de lote:")
        for msg in erros[:10]:
            print(f"  - {msg}")


if __name__ == "__main__":
    main()
