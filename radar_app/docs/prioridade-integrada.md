# Prioridade integrada (Radar) — regras vigentes

Modelo experimental, separado do score oficial (VSCS). Código: `lib/prioridade.ts` e `lib/prioridade-config.ts`;
testes: `scripts/tests/prioridade*.test.mjs`.

## Dimensões (notas de 1 a 5)

| Dimensão | Origem | Peso |
|---|---|---:|
| ICP | Tier ICP da conta | 1 |
| Sinais | VSCS 0–100 → 1 + 4·v/100 | 1 |
| Clima do setor | edição do Clima da vertical da conta | **0,5** |
| Oportunidade digital | nível do Atlas de aquisição (L1 → 2 · L2 → 4 · L3 → 4 · L4 → 3) | 1 |

## Classes

- **C**: ICP abaixo de 3 ou nota integrada abaixo de 2,5.
- **A1**: nota ≥ 4,5, ICP ≥ 4, Sinais ≥ 4, Oportunidade digital ≥ 3.
- **A2** (entrada do sweet spot): nota ≥ 4,0, ICP ≥ 4, Sinais ≥ 3, Oportunidade digital ≥ 3.
- **B1**: nota ≥ 3,25. **B2**: o resto.
- Sweet spot = A1 ou A2.

## Decisões de 27/11/2026

1. **Clima menos rigoroso.** O Clima deixou de ter mínimo próprio (o mínimo virou 1, o piso da escala) e passou a pesar 0,5 na média.
   Antes: mínimo 2 e peso 1 (decisão de 26/11). Um setor em momento ruim baixa a média, mas não barra o sweet spot.
2. **Faltar uma dimensão não desclassifica.** Com três dimensões avaliadas, a conta é classificada pela média ponderada e pelos mínimos das três.
   Ela ganha o selo "3 de 4", e a dimensão faltante vira investigação, com a nota mínima que levaria a conta ao sweet spot (só quando as outras já cumprem os mínimos).
   Com duas ou mais faltando, continua sem métrica. Antes, uma faltando deixava a conta sem classe ("candidata" ou "fora por critério").
3. **Aquisição provisória conta.** Uma conta do Atlas sem página válida auditada (confiança insuficiente) entra com o nível provisório.
   Ela carrega a pendência "nível provisório: sem página válida auditada".

Efeito medido no snapshot local de 26/11, ainda sem o Atlas de aquisição: as contas classificadas passam de 10 para 348, e a maioria cai em C por Sinais baixo.
O Atlas deve elevar a dimensão digital da base. Conferir em produção antes de recalibrar outra regra.

## Ambiente de decisão

O alvo do Radar (`lib/ambiente.ts`) é uma leitura visual e não altera nenhuma regra acima.
- **Distância** = pontos de nota que faltam para os critérios de A2, só com as dimensões avaliadas.
- **Lado** = a dimensão em que a conta mais passa do mínimo.
