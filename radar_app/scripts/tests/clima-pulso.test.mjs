// Clima em contexto × pulso (lib/clima-pulso.ts). Casos ilustrativos, não empresas reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { climaComposto, contraAMare, efeitoNaNota, leituraPulso, pulsoDoGrupo, MIN_CONTAS_PULSO } from '../../lib/clima-pulso.ts';

const C = (i, ogi, movimento = false, vertical = 'GEN', crescimentoPct = ogi === 'crescimento' ? 20 : null) => ({ id: `c${i}`, nome: `C${i}`, tier: 'A', vertical, ogi, movimento, crescimentoPct });
const grupo = (cresce, encolhe, mov = 0, sem = 0) => [
  ...Array.from({ length: cresce }, (_, i) => C(i, 'crescimento', i < mov)),
  ...Array.from({ length: encolhe }, (_, i) => C(100 + i, 'retracao')),
  ...Array.from({ length: sem }, (_, i) => C(200 + i, 'sem_dado')),
];

test('pulso: 0,7 × saldo de quem cresce menos quem encolhe + 0,3 × movimento relativo à base', () => {
  const g = grupo(8, 2, 0); // saldo (8−2)/10 = 0,6; sem movimento e base sem movimento → 0
  assert.equal(pulsoDoGrupo(g).saldo, 0.6);
  assert.equal(pulsoDoGrupo(g).S, 0.42);
  // o grupo contrata o dobro da base: movimento relativo +1 → +0,3
  const base = [...grupo(8, 2, 2), ...grupo(10, 10, 0, 0).map((c, i) => ({ ...c, id: `b${i}` }))];
  const p = pulsoDoGrupo(grupo(8, 2, 2), base);
  assert.equal(p.taxaMovimento, 0.2);
  assert.equal(p.S, 0.72);
});

test(`amostra pequena (menos de ${MIN_CONTAS_PULSO} com OGI) herda o pulso da base; sem OGI na base, não há pulso`, () => {
  const base = grupo(20, 10);
  const p = pulsoDoGrupo(grupo(3, 0), base);
  assert.equal(p.usaBase, true);
  assert.equal(p.S, pulsoDoGrupo(base).S);
  assert.equal(pulsoDoGrupo(grupo(0, 0, 0, 30)).S, null);
});

test('composto: 35% contexto + 65% pulso; sem pulso, fica o contexto', () => {
  assert.equal(climaComposto(-0.5, 0.4), 0.09);
  assert.equal(climaComposto(-0.5, null), -0.5);
});

test('contra a maré: setor negativo e a conta cresce 10% ou mais ou contrata; ruído e crescimento pequeno não contam', () => {
  assert.equal(contraAMare({ ogi: 'crescimento', crescimentoPct: 12, movimento: false }, -0.3), true);
  assert.equal(contraAMare({ ogi: 'crescimento', crescimentoPct: 4, movimento: false }, -0.3), false);
  assert.equal(contraAMare({ ogi: 'ruido', movimento: true }, -0.3), true);
  assert.equal(contraAMare({ ogi: 'crescimento', crescimentoPct: 30, movimento: true }, 0.1), false); // setor não é negativo
});

test('efeito na nota (simulação): ancorado no neutro, ±0,25 no máximo, e não rebaixa quem vai contra a maré', () => {
  assert.equal(efeitoNaNota(0, false), 0);
  assert.equal(efeitoNaNota(0.2, false), 0.1);
  assert.equal(efeitoNaNota(-0.9, false), -0.25);
  assert.equal(efeitoNaNota(0.9, false), 0.25);
  assert.equal(efeitoNaNota(-0.4, true), 0);
});

test('leitura da base: conta sem código vai para a Generalista; movimento só em 90 dias e sem exemplo; relativo à média', () => {
  const contas = Array.from({ length: 20 }, (_, i) => ({ id: `k${i}`, nome: `K${i}`, tier: i < 2 ? 'A' : 'B', especializacao: i < 10 ? { codigo: 'ESP01' } : null }));
  const resultados = Object.fromEntries(
    contas.map((c, i) => [c.id, { total: 100, delta365: i % 4 === 0 ? -20 : 20, crescimento365Pct: i % 4 === 0 ? -16.7 : 25, status: 'simulacao_nao_publicada' }]),
  );
  const base = {
    contas,
    atualizadoEm: '2026-11-27T10:00:00-03:00',
    ogi: { simulacaoAssimetria: { resultados } },
    sinais: [
      { contaId: 'k1', categoria: 'contratacao', data: '2026-11-01' },
      { contaId: 'k2', categoria: 'expansao', data: '2026-05-01' }, // fora dos 90 dias
      { contaId: 'k3', categoria: 'contratacao', data: '2026-11-10', exemplo: true },
    ],
  };
  const l = leituraPulso(base, [
    { id: 'ESP01', nome: 'Fintech', codigos: ['ESP01'], S: 0.2 },
    { id: 'GEN', nome: 'Generalista', codigos: ['GEN'], S: -0.5 },
  ]);
  assert.equal(l.disponivel, true);
  assert.equal(l.base.cresce, 15);
  assert.equal(l.base.encolhe, 5);
  assert.equal(l.base.comMovimento, 1);
  const gen = l.verticais.find(v => v.id === 'GEN');
  assert.equal(gen.pulso.n, 10);
  assert.ok(gen.relativo < 0 && l.verticais.find(v => v.id === 'ESP01').relativo > 0);
  // contra a maré só na Generalista (contexto negativo): as que crescem 25%
  assert.equal(l.totalContraMare, gen.contraMare);
  assert.ok(l.contraMare.every(c => c.vertical === 'Generalista' && (c.cresce || c.movimento)));
  assert.equal(l.contraMare[0].tier, 'B'); // as Tier A (k0, k1) estão na Fintech
});
