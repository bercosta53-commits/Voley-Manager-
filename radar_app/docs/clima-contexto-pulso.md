# Clima: contexto × pulso (leitura proposta)

Status: **leitura proposta**, visível na aba Clima. Não muda a nota do Clima, a nota integrada nem a classe.
Direcionamento de 28/11/2026. Os indicadores e as notícias ("hard news") tendem ao negativo, e no Brasil muitas empresas crescem contra a maré. Por isso o Clima ganha uma segunda metade, medida pelo que as empresas da própria base fazem.

## Regras (`lib/clima-pulso.ts`)

| Parte | Peso | O que mede |
|---|---|---|
| Contexto | 35% | O Clima atual: macro, driver setorial e notícias (`data/clima.json`) |
| Pulso | 65% | 0,7 × saldo do OGI ((crescem − encolhem) / (crescem + encolhem)) + 0,3 × fatia que contrata ou expande em 90 dias, comparada com a base |

- **Amostra mínima:** vertical com menos de 8 contas com crescimento comparável usa o pulso da base. Amostra pequena não vira sinal.
- **Relativo:** o composto de cada vertical é comparado com a média da base. Um macro ruim para todo mundo não diferencia ninguém.
- **Contra a maré:** em setor com contexto negativo, a conta que cresce 10% ou mais em 12 meses ou contrata ou expande em 90 dias. Variações abaixo de 3 pessoas são ruído.
- **Efeito na prioridade (só simulação):** ancorado no neutro, ±0,25 ponto de nota no máximo. A conta contra a maré não perde nota pelo setor.

## Próximos passos (coleta, ainda não implementados)

- **Notícias balanceadas por construção:** buscar sinais positivos (rodadas, IPOs, investimento anunciado, recordes de contratação) e negativos por vertical, cada um pesado pela materialidade para o setor. Sem notícia relevante, o componente fica neutro, nunca negativo.
- **Indicadores setoriais e positivos, com fonte e data:**
  - emprego formal em TI por CNAE (Novo CAGED);
  - Brasscom e ABES;
  - venture capital por vertical;
  - PMI de serviços e confiança empresarial (FGV).

## Testes

`scripts/tests/clima-pulso.test.mjs`. Os casos de teste são ilustrativos.
