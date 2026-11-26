# VSCS 3.1 — maturação dos sinais de liderança (proposta, 26/11/2026)

**Origem:** decisão de Bernardo em 26/11; curva confirmada no mesmo dia, valendo também para contratação de head. **Estado:** implementado em `scripts/score_v2.py` (`VERSAO = "vscs-3.1"`),
aguardando alinhamento com a inteligência antes de rodar na carga diária. Nada muda no contrato do snapshot: os
campos são os mesmos; mudam os valores de `v2.contribuicoes[].tempo`, `s`, `pontos` e, por consequência, o VSCS.

## O que muda

No VSCS 3.0, todo fato perde metade do valor a cada meia-vida da categoria e zera depois de três. Para mudança de
liderança, a meia-vida era 60 dias: um diretor novo valia 100% no dia em que chegou e zerava em 180 dias.

Na prática comercial é o contrário: nos primeiros 3 meses a pessoa quase não mexe no orçamento; ao longo de um ano
e pouco ela ganha domínio da posição e do orçamento. O 3.1 trata a categoria `lideranca` com uma curva de maturação:

| Dias desde o fato | Fator de tempo |
| --- | --- |
| 0 a 90 | 0,60 (chegada: o fato é real, o orçamento ainda não) |
| 90 a 365 | sobe em linha de 0,60 a 1,00 |
| 365 a 450 | 1,00 ("um ano e pouco") |
| depois de 450 | cai pela metade a cada 90 dias |
| depois de 720 | 0 |

A mesma curva vale para a **contratação de head** (tipos `vaga_lideranca_alvo` e `vaga_lideranca_growth`, em
`MATURACAO_POR_TIPO`): o head contratado amadurece como o diretor novo. Vagas de time (SDR, analista) e as demais
categorias não mudam. Os parâmetros ficam em `MATURACAO` no motor, para calibrar sem mexer no código.

## Efeito esperado

- Conta com troca de liderança **recente** (até 3 meses): VSCS **menor** que hoje (o fato entra com 60%).
- Conta com troca de liderança **entre 6 e 15 meses**: VSCS **maior** que hoje (no 3.0 o fato já tinha zerado).
- Mudar `VERSAO` zera a histerese do anel na primeira rodada (regra existente do motor: calibração nova).

## O que a inteligência precisa fazer

1. Validar a curva (início 0,60, carência 90, pico 365, platô até 450, meia-vida 90 depois).
2. Rodar o motor 3.1 na carga e conferir o efeito nas contas com troca de liderança.
3. Manter o histórico dos fatos de liderança e de contratação de head por pelo menos 720 dias na base (antes,
   180 e 135 dias bastavam).

A tela já mostra a regra nova em Métricas → "Como o score é calculado" (tabela e histórico do modelo).
