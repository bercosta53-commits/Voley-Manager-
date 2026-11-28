# Clima: contexto × pulso (leitura proposta)

Status:
- **Na aba Clima:** a leitura aparece como proposta.
- **Na prioridade integrada:** entra no modo **ancorado** (decisão de 28/11), com a comparação com o cálculo anterior visível no Radar.
- **Interruptor:** `RADAR_CLIMA_NA_NOTA=media` no servidor volta ao cálculo anterior, sem mudar dados.
- **Sem crescimento de equipe medido na base**, o servidor volta sozinho ao cálculo anterior.
Direcionamento de 28/11/2026. Os indicadores e as notícias ("hard news") tendem ao negativo, e no Brasil muitas empresas crescem contra a maré. Por isso o Clima ganha uma segunda metade, medida pelo que as empresas da própria base fazem.

## Regras (`lib/clima-pulso.ts`)

| Parte | Peso | O que mede |
|---|---|---|
| Contexto | 35% | O Clima atual: macro, driver setorial e notícias (`data/clima.json`) |
| Pulso | 65% | 0,7 × saldo do OGI ((crescem − encolhem) / (crescem + encolhem)) + 0,3 × fatia que contrata ou expande em 90 dias, comparada com a base |

- **Amostra mínima:** vertical com menos de 8 contas com crescimento comparável usa o pulso da base. Amostra pequena não vira sinal.
- **Relativo:** o composto de cada vertical é comparado com a média da base. Um macro ruim para todo mundo não diferencia ninguém.
- **Contra a maré:** em setor com contexto negativo, a conta que cresce 10% ou mais em 12 meses ou contrata ou expande em 90 dias. Variações abaixo de 3 pessoas são ruído.
- **Efeito na prioridade (modo ancorado, `lib/prioridade.ts`):**
  - A nota integrada é a média de ICP, Sinais e Oportunidade digital, e o Clima ajusta essa média em até ±0,25.
  - A nota do Clima da conta é `3 + 2 × composto relativo`. Cada ponto acima ou abaixo de 3 vale 0,25 na nota integrada.
  - A conta contra a maré não fica abaixo de 3, ou seja, não perde nota pelo setor.
  - Os mínimos de ICP, Sinais e Digital continuam como estão, e o Clima segue sem mínimo.
  - A nota anterior do Clima (`3 + 2·S`) vai junto (`notaClassica`). O Radar mostra "era B1" nas contas que mudaram de classe, um resumo (sweet spot antes → depois, quantas sobem e descem) e o filtro "Só as que mudaram".

## Próximos passos (coleta, ainda não implementados)

- **Notícias balanceadas por construção:** buscar sinais positivos (rodadas, IPOs, investimento anunciado, recordes de contratação) e negativos por vertical, cada um pesado pela materialidade para o setor. Sem notícia relevante, o componente fica neutro, nunca negativo.
- **Indicadores setoriais e positivos, com fonte e data:**
  - emprego formal em TI por CNAE (Novo CAGED);
  - Brasscom e ABES;
  - venture capital por vertical;
  - PMI de serviços e confiança empresarial (FGV).

## Testes

`scripts/tests/clima-pulso.test.mjs`. Os casos de teste são ilustrativos.
