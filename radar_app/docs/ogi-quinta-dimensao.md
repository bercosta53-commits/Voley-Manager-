# OGI como 5ª dimensão: leitura e simulação

Status: **simulação**. Não está publicado como modelo. O OGI não altera VSCS, nota integrada, classe, Tier, a tela nem o banco.
Direcionamento de 27/11/2026. Este documento descreve só a metodologia; resultados com dados reais ficam fora do repositório.

## Decisões em vigor

1. As quatro dimensões originais ficam como estão: ICP (peso 1), Sinais (peso 1), Clima (peso 0,5, sem mínimo) e Digital (peso 1).
2. O OGI entra como 5ª dimensão com peso 1, só em leitura e simulação (`lib/ogi.ts`, `lib/simulacao-ogi.ts`).
3. O OGI não é somado ao VSCS. O cenário B (`VSCS + OGI × 0,20`) está descartado.
4. A materialidade continua linear, como gravada pelo pipeline. O app não recalcula o OGI: lê `payload.ogi.simulacaoAssimetria.resultados[contaId]`.
5. Travas preservadas:
   - ICP < 3 continua sendo C;
   - os mínimos de Sinais e Digital continuam;
   - o Tier vem só do ICP;
   - não há promoção automática.
6. Destino: cenário C, com filas comerciais por aderência, capacidade, necessidade e timing.

## Estados do OGI por conta

| Estado | Regra | Nota |
|---|---|---|
| Sem dado | sem resultado, ou sem `total`/`delta365` numéricos | null (dimensão faltante) |
| Base não comparável | `total − delta365 ≤ 0`, ou status do pipeline de bloqueio/não comparável/erro | null |
| Ruído | 0 < \|delta365\| < 3 pessoas | 3 (neutro) |
| Estagnação confirmada | delta365 = 0 com base comparável | pela força gravada (leve abaixo de 3) |
| Crescimento / Retração | \|delta365\| ≥ 3 | pela força gravada |

Ausência nunca vira zero nem penalidade.

## Normalização para 1–5

`nota = limitar(3 + força / 45, 1, 5)`, sendo `força = pesoAposPersistencia × fatorMaterialidade × fatorConfiabilidade`.

- A inclinação é a mesma nos dois lados. Assim, a assimetria do OGI (uma queda pesa mais que uma alta do mesmo tamanho) chega intacta à nota.
- Pontos de referência: +90 → 5 e −90 → 1. Abaixo de −90, a nota fica limitada em 1.
- Com confiabilidade abaixo de 1, a nota é marcada como provisória.
- A simulação testa outras variantes: sem confiabilidade e escala 90.

## Deduplicação por causa empresarial comum

- Se um sinal na janela de 12 meses registra a mesma causa do movimento de equipe, o afastamento do neutro é descontado. O padrão é 0,5. A simulação também testa 0 e 1.
- As causas consideradas são:
  - **Expansão:** expansão de mercado, nova unidade, captação, resultados de crescimento, vaga de expansão comercial.
  - **Retração:** demissões, fechamento de unidade.
  - **Reorganização:** fusão e aquisição, reestruturação. Explica tanto alta quanto queda.
- Vagas genéricas não são causa: abrir uma vaga não é expandir a empresa.

## Achado do teste de regra

Um OGI neutro (3) com peso 1 **dilui** quem está acima de 4.

- Uma conta A2 com média 4,14 cai para 3,89 (B1).
- Uma conta A1 com média 4,71 cai para 4,33 (A2).

Ou seja, a 5ª dimensão com peso 1 também tira contas do sweet spot só por não terem crescido. Os testes deixam isso registrado (`scripts/tests/ogi.test.mjs`). A medida real vem da simulação.

## Como rodar a simulação

```bash
node --experimental-strip-types --import ./scripts/tests/resolver.mjs scripts/simular-ogi.mjs --snapshot /caminho/payload.json --saida /pasta/privada
```

- Aceita o payload puro ou a resposta do SQL (`[{ "payload": … }]`).
- Recusa saída dentro do repositório e recusa snapshot fictício.

## Reconciliação com o VSCS 3.3-DC (antes de qualquer publicação)

Textos e constantes do app que ainda citam o VSCS 3.0 e precisam ser conferidos contra o `scoreModelo` 3.3-DC do snapshot:

- `lib/prioridade-config.ts` (`ORIGEM.sinais`: a transformação `1 + 4 × VSCS / 100` e o rótulo "VSCS 3.0");
- `components/metricas/como-calcula.tsx` (explicação e histórico);
- `lib/dados.ts` (faixas de estágio 85/70/55/40 quando a carga não traz o estágio);
- `lib/cobertura.ts` (piso de "Oportunidade emergente");
- `lib/proximidade-real.ts` (`versaoPesos`);
- `lib/tipos.ts` (comentários).

O motor 3.3-DC (`scripts/vscs/motor33`) não está neste repositório. `scripts/reconstruir_serie_180.py` exige que o motor e o snapshot estejam na mesma versão.
