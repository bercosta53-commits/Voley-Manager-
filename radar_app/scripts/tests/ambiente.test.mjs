// Testes de lib/ambiente.ts (ambiente de decisão do Radar). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambiente, pontosQueFaltam, faixaPorFalta } from '../../lib/ambiente.ts';
import { visaoIntegrada } from '../../lib/prioridade.ts';

const dim = nota => ({ nota, resumo: null, status: nota === null ? 'sem_avaliacao' : 'avaliada', motivoSemNota: null, semAchados: false, entraNoCalculo: nota !== null, motivoExclusao: null, dataReferencia: null, fontes: [], pendenciasQualidade: [] });
const linha = (id, [icp, sinais, clima, dig], tier = 'A') => ({
  contaId: id, nome: id, outrosNomes: [], setor: null, uf: 'SP', tier, evidencia: null, acaoOficial: null, acaoDaMatriz: false,
  visao: visaoIntegrada(id, { icp: dim(icp), sinais: dim(sinais), clima: dim(clima), oportunidadeDigital: dim(dig) }),
});

test('pontos que faltam: soma abaixo dos mínimos ou o que falta para a nota integrada 4,0', () => {
  assert.equal(pontosQueFaltam({ icp: 5, sinais: 4, clima: 3, oportunidadeDigital: 4 }), 0);
  // 5+1+2+4 = 12; a soma pede 16 → 4 pontos (maior que os 2 abaixo do mínimo em Sinais)
  assert.equal(pontosQueFaltam({ icp: 5, sinais: 1, clima: 2, oportunidadeDigital: 4 }), 4);
  // faltante assumida em 5 (o mínimo possível)
  assert.equal(pontosQueFaltam({ icp: 5, sinais: 4, clima: 3 }), 0);
  assert.equal(faixaPorFalta(1.5), 'proximo');
  assert.equal(faixaPorFalta(1.6), 'aproximacao');
  assert.equal(faixaPorFalta(4.1), 'distante');
});

test('faixas, lacuna principal e contas fora do mapa', () => {
  const a = ambiente([
    linha('sweet', [5, 4, 3, 4]),
    linha('perto', [5, 3, 3, 4]), // soma 15 → falta 1
    linha('timing', [5, 1, 2, 4]), // falta 4, lacuna Sinais
    linha('encaixe', [2, 2, 2, 2]), // longe, lacuna ICP
    linha('semdados', [5, null, null, 4]),
    linha('investigar', [5, 4, 3, null]),
  ]);
  const por = Object.fromEntries(a.pontos.map(p => [p.linha.contaId, p]));
  assert.equal(por.sweet.faixa, 'centro');
  assert.equal(por.sweet.lacuna, null);
  assert.equal(por.perto.faixa, 'proximo');
  assert.equal(por.timing.faixa, 'aproximacao');
  assert.equal(por.timing.lacuna, 'sinais');
  assert.equal(por.encaixe.faixa, 'distante');
  assert.equal(por.encaixe.lacuna, 'icp');
  assert.equal(por.investigar.aInvestigar, true);
  assert.equal(por.investigar.faixa, 'proximo');
  assert.equal(a.semDados, 1);
  assert.equal(por.semdados, undefined);
  // a direção aponta para a força: ICP 5 (passa 1 do mínimo) e Digital 4 (passa 1) → acima e à esquerda
  assert.equal(por.timing.forca, 'icp');
  assert.ok(Math.sin(por.timing.angulo) < 0 && Math.cos(por.timing.angulo) < 0.3);
  // posições estáveis entre chamadas (sem sorteio)
  assert.equal(ambiente([linha('timing', [5, 1, 2, 4])]).pontos[0].angulo, por.timing.angulo);
});
