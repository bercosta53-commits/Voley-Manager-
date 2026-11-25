// Testes de lib/panorama.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panorama } from '../../lib/panorama.ts';

const FAIXAS = [
  [85, 'Prioridade máxima'],
  [70, 'Alta prioridade'],
  [55, 'Oportunidade emergente'],
  [40, 'Atenção'],
  [0, 'Monitoramento'],
];

const pessoa = nome => ({ nome, cargo: 'Diretor', area: 'comercial', papel: 'decisor', fonte: 'teste' });
const conta = (id, score, tier, comite = 0) => ({ id, nome: id, score, tier, comite: Array.from({ length: comite }, (_, i) => pessoa(`${id}-${i}`)) });
const sinal = (id, contaId, data, categoria, tipo = 'fusao_aquisicao') => ({ id, contaId, data, categoria, tipo });

const base = {
  geradoEm: '2026-11-20',
  atualizadoEm: '2026-11-25T00:41',
  contas: [conta('a', 90, 'A', 3), conta('b', 72, 'A', 1), conta('c', 55, 'B', 2), conta('d', 54, 'B'), conta('e', 10, 'C')],
  sinais: [
    sinal('s1', 'a', '2026-11-24', 'expansao'), // 1 dia
    sinal('s2', 'a', '2026-11-18', 'lideranca'), // 7 dias
    sinal('s3', 'b', '2026-11-01', 'expansao'), // 24 dias
    sinal('s4', 'c', '2026-10-20', 'gtm'), // 36 dias: fora dos 30
    sinal('s5', 'd', '2026-11-20', 'contexto', 'noticia_setorial'), // não acionável
    sinal('s6', 'e', '2026-11-26', 'gtm'), // depois da carga: fora
  ],
  fontes: [{ status: 'ok' }, { status: 'erro' }, { status: 'ok' }],
};

test('volume da base', () => {
  const p = panorama(base, FAIXAS);
  assert.equal(p.dataCarga, '2026-11-25');
  assert.equal(p.contas, 5);
  assert.equal(p.decisores, 6);
  assert.equal(p.contasComComite, 3);
  assert.equal(p.contasComComiteMultiplo, 2);
  assert.deepEqual([p.fontes, p.fontesOk], [3, 2]);
});

test('janelas de 7 e 30 dias contam da data da carga e ignoram notícia setorial', () => {
  const p = panorama(base, FAIXAS);
  assert.equal(p.sinais30d, 3);
  assert.equal(p.sinais7d, 2);
  assert.deepEqual(p.porCategoria30d, [{ categoria: 'expansao', n: 2 }, { categoria: 'lideranca', n: 1 }]);
});

test('contas com sinal contam qualquer sinal da base', () => {
  assert.equal(panorama(base, FAIXAS).contasComSinal, 5);
});

test('estágios: cada conta numa faixa, nos pisos 85/70/55/40/0', () => {
  const p = panorama(base, FAIXAS);
  assert.deepEqual(p.porEstagio.map(e => e.n), [1, 1, 1, 1, 1]);
  assert.equal(p.porEstagio.reduce((n, e) => n + e.n, 0), p.contas);
  assert.equal(p.pisoOportunidade, 55);
  assert.equal(p.emOportunidade, 3); // 90, 72 e 55
});

test('tiers', () => {
  assert.deepEqual(panorama(base, FAIXAS).porTier, [{ tier: 'A', n: 2 }, { tier: 'B', n: 2 }, { tier: 'C', n: 1 }]);
});

test('sem atualizadoEm usa geradoEm', () => {
  assert.equal(panorama({ ...base, atualizadoEm: undefined }, FAIXAS).dataCarga, '2026-11-20');
});
