#!/usr/bin/env python3
"""Monta a requisição de dados faltantes (empresa e contatos) para rodar num chat de IA com busca (ChatGPT).

uso: python3 scripts/exportar_requisicao_chatgpt.py PASTA [--lote 25] [--tiers A,B,C]

Grava em PASTA:
  PROMPT.md            o pedido, com regras (não inventar, fonte obrigatória) e o formato de resposta
  lote_01.csv, …       as contas, uma por linha, com o que já sabemos e só o que falta em cada uma
  COMO_USAR.md         passo a passo (colar o prompt + um lote por vez; salvar cada resposta num .txt)

A volta é scripts/importar_chatgpt.py: lê as respostas, confere CNPJ na Receita (BrasilAPI) e só preenche
campo vazio, marcando a fonte como "ChatGPT (a validar)". A pasta tem nome de empresa: fica fora do Git.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"

COLUNAS_EMPRESAS = ["id", "cnpj", "uf", "cidade", "faixa_funcionarios", "faturamento_faixa", "ano_fundacao",
                    "modelo_negocio", "o_que_faz", "linkedin_empresa", "fonte_url", "confianca", "observacao"]
COLUNAS_CONTATOS = ["id", "nome", "cargo", "area", "papel", "linkedin_url", "fonte_url", "confianca"]

PROMPT = """# Pedido: completar dados de empresas B2B de TI (Brasil) e o comitê de compra

Você é um pesquisador de mercado B2B. Vou colar uma tabela (CSV com ponto e vírgula) de empresas brasileiras
de tecnologia. Para cada linha, complete **somente** o que a coluna `falta_empresa` e a coluna `falta_contatos`
pedem. Use busca na web (site da empresa, LinkedIn da empresa, Receita/CNPJ, imprensa).

## Regras (obrigatórias)

1. **Não invente.** Se não achar com segurança, deixe o campo vazio. Campo vazio é melhor que dado errado.
2. **Toda linha da resposta precisa de `fonte_url`** (a página onde você viu o dado). Sem fonte, não envie a linha.
3. `confianca`: `alta` (vi no site oficial, Receita ou perfil oficial), `media` (imprensa ou base reconhecida),
   `baixa` (indício indireto). Na dúvida, use `baixa`.
4. **CNPJ:** só o da matriz da própria empresa (14 dígitos), achado no rodapé/política de privacidade do site ou
   em fonte oficial. Não use CNPJ de empresa homônima.
5. **Funcionários:** use exatamente uma destas faixas: `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`,
   `1001-5000`, `5001+` (a do LinkedIn da empresa serve).
6. **Faturamento:** só se houver fonte pública; use uma destas faixas: `ate-4.8mi`, `4.8-20mi`, `20-100mi`,
   `100-300mi`, `300mi+`.
7. `modelo_negocio`: `servico` (projeto, fábrica, outsourcing, consultoria, serviços gerenciados), `produto`
   (software/SaaS próprio) ou `misto`.
8. **Contatos:** para cada papel em `falta_contatos`, indique a pessoa **atual** na empresa (confira se ainda está
   lá). Papéis:
   - `decisor`: dono da área de vendas, marketing ou receita (Diretor/Head/VP Comercial, de Marketing, de Growth,
     CRO, CMO);
   - `dono_da_dor`: gerente que vive o problema de geração de demanda/vendas (Gerente Comercial, de Marketing,
     de Novos Negócios);
   - `assina_cheque`: quem aprova o orçamento (CEO, sócio, CFO);
   - `comercial` ou `marketing`: alguém dessa área, de coordenação para cima.
   Não envie e-mail nem telefone pessoal. Só nome, cargo e o link do perfil público.
9. Não repita dados que a tabela já traz preenchidos.

## Formato da resposta (exatamente assim)

Responda com **dois blocos de código CSV** (separador `;`, cabeçalho na primeira linha), nesta ordem:

```csv
EMPRESAS
{empresas}
```

```csv
CONTATOS
{contatos}
```

- `id` é o mesmo da tabela de entrada (não mude).
- Em CONTATOS, `area` ∈ `executivo`, `comercial`, `marketing`, `financeiro`, `produto`, `outro`; `papel` ∈
  `decisor`, `dono_da_dor`, `assina_cheque`, `comercial`, `marketing`.
- Uma linha por pessoa. Uma linha por empresa em EMPRESAS (pode faltar a empresa se não achou nada).
- Depois dos dois blocos, uma lista curta do que não encontrou.

## Tabela de entrada
"""

COMO_USAR = """# Como rodar no ChatGPT

1. Abra um chat novo com **busca na web ligada** (modelo com navegação).
2. Cole o conteúdo de `PROMPT.md` e, logo abaixo, o conteúdo de **um** `lote_XX.csv`.
3. Copie a resposta inteira (os dois blocos CSV) e salve como `resposta_XX.txt` nesta pasta.
4. Repita para os outros lotes (um chat por lote funciona melhor; os primeiros lotes são as contas Tier A).
5. Me mande os arquivos `resposta_XX.txt` (ou cole aqui). Eu rodo `scripts/importar_chatgpt.py`, que:
   - confere cada CNPJ na Receita (BrasilAPI) antes de gravar;
   - só preenche o que está vazio na base (não sobrescreve dado confirmado);
   - marca tudo como "ChatGPT (a validar)" e recalcula tier, comitê e score.

{resumo}
"""

AREA_PAPEL = {"Decisor": "decisor", "Dono da dor": "dono_da_dor", "Assina o cheque": "assina_cheque"}


def falta_empresa(c: dict) -> list[str]:
    f = []
    if not c.get("cnpj"):
        f.append("cnpj")
    if not c.get("uf"):
        f.append("uf")
        f.append("cidade")
    elif c.get("ufFonte") not in ("receita", "site"):
        f.append("uf (confirmar sede)")
    if not c.get("funcionarios"):
        f.append("faixa_funcionarios")
    if not c.get("faturamentoEstimado"):
        f.append("faturamento_faixa")
    if not c.get("dataAbertura") and not c.get("anoFundacao"):
        f.append("ano_fundacao")
    if not c.get("modeloNegocio"):
        f.append("modelo_negocio")
    if (c.get("ramoTI") or {}).get("codigo") in (None, "A classificar"):
        f.append("o_que_faz")
    f.append("linkedin_empresa")
    return f


def falta_contatos(c: dict) -> list[str]:
    f = [AREA_PAPEL[x] for x in c.get("comiteFaltando", []) if x in AREA_PAPEL]
    if not any(p.get("area") == "comercial" for p in c.get("comite", [])):
        f.append("comercial")
    if not any(p.get("area") == "marketing" for p in c.get("comite", [])):
        f.append("marketing")
    return f


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pasta", type=Path)
    ap.add_argument("--lote", type=int, default=25)
    ap.add_argument("--tiers", default="A,B,C")
    args = ap.parse_args()
    base = json.loads(DESTINO.read_text(encoding="utf-8"))
    tiers = args.tiers.split(",")
    contas = [c for c in base["contas"] if c.get("tier") in tiers]
    contas.sort(key=lambda c: (tiers.index(c["tier"]), -c.get("score", 0), c["nome"]))
    linhas = []
    for c in contas:
        fe, fc = falta_empresa(c), falta_contatos(c)
        if not fe and not fc:
            continue
        linhas.append({
            "id": c["id"], "empresa": c["nome"], "site": c.get("dominio", ""), "tier": c.get("tier", ""),
            "uf_atual": c.get("uf", ""), "cidade_atual": c.get("cidade", ""), "cnpj_atual": c.get("cnpj", ""),
            "ramo_atual": (c.get("ramoTI") or {}).get("nome", ""),
            "falta_empresa": ", ".join(fe), "falta_contatos": ", ".join(fc),
        })
    args.pasta.mkdir(parents=True, exist_ok=True)
    n_lotes = 0
    for i in range(0, len(linhas), args.lote):
        n_lotes += 1
        with (args.pasta / f"lote_{n_lotes:02d}.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), delimiter=";")
            w.writeheader()
            w.writerows(linhas[i:i + args.lote])
    (args.pasta / "PROMPT.md").write_text(
        PROMPT.format(empresas=";".join(COLUNAS_EMPRESAS), contatos=";".join(COLUNAS_CONTATOS)), encoding="utf-8")
    por_tier = {t: sum(1 for l in linhas if l["tier"] == t) for t in tiers}
    resumo = (f"{len(linhas)} contas em {n_lotes} lotes de até {args.lote} "
              f"({', '.join(f'{n} tier {t}' for t, n in por_tier.items())}). "
              f"Faltam: decisor em {sum('decisor' in l['falta_contatos'].split(', ') for l in linhas)}, "
              f"dono da dor em {sum('dono_da_dor' in l['falta_contatos'] for l in linhas)}, "
              f"quem assina o cheque em {sum('assina_cheque' in l['falta_contatos'] for l in linhas)}, "
              f"CNPJ em {sum(l['falta_empresa'].startswith('cnpj') for l in linhas)}, "
              f"funcionários em {sum('faixa_funcionarios' in l['falta_empresa'] for l in linhas)}.")
    (args.pasta / "COMO_USAR.md").write_text(COMO_USAR.format(resumo=resumo), encoding="utf-8")
    print(resumo)


if __name__ == "__main__":
    main()
