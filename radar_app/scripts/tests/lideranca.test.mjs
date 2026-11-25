// Testes de lib/lideranca.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lideranca } from '../../lib/lideranca.ts';

const conta = (id, score, extra = {}) => ({ id, nome: id.toUpperCase(), score, ...extra });
const sinal = (id, contaId, data, extra = {}) => ({ id, contaId, data, alertaEm: data, tipo: 'captacao', rotulo: `fato ${id}`, sinal: `fato ${id}`, ...extra });
const base = {
  geradoEm: '2026-11-25',
  atualizadoEm: '2026-11-25T00:41:00-03:00',
  contas: [conta('a', 80), conta('b', 60), conta('c', 56), conta('d', 30, { qualificada: { status: 'sim' } }), conta('e', 20)],
  sinais: [
    sinal('s1', 'a', '2026-11-24'),
    sinal('s2', 'b', '2026-11-20'),
    sinal('s3', 'c', '2026-11-10'),
    sinal('s4', 'd', '2026-11-23'),
    sinal('s5', 'e', '2026-11-22', { tipo: 'noticia_setorial' }),
  ],
};

test('o que o Radar trouxe na semana, sem depender de clique', () => {
  const l = lideranca(base, {}, {});
  assert.equal(l.fatosSemana, 3); // s1, s2, s4 (s3 tem 15 dias; s5 é notícia setorial)
  assert.equal(l.contasComFatoSemana, 3);
});

test('quentes = VSCS ≥ 55 ou qualificada pelo motor; sem ação, da mais quente para a menos', () => {
  const l = lideranca(base, {}, {});
  assert.equal(l.quentes, 4); // a, b, c (≥55) e d (qualificada)
  assert.deepEqual(l.quentesSemAcao.map(c => c.contaId), ['a', 'b', 'c', 'd']);
  assert.equal(l.quentesSemAcao[0].diasDesdeAviso, 1);
});

test('qualquer clique do fluxo conta como ação; andamento também, mas é opcional', () => {
  const estados = { s1: { acao: 'abordado', em: '2026-11-25' }, s2: { avaliacao: 'ruido', em: '2026-11-21' } };
  const l = lideranca(base, estados, { c: { status: 'reuniao' } });
  assert.equal(l.quentesComAcao, 3);
  assert.deepEqual(l.quentesSemAcao.map(c => c.contaId), ['d']);
  assert.equal(l.diasAteAgir, 1); // s1: 1 dia; s2: 1 dia
  assert.deepEqual(l.andamento, { reuniao: 1 });
  assert.deepEqual(lideranca(base, estados, {}).andamento, {}); // ninguém usou: vazio, não é falha
});

test('limite da lista e total separado', () => {
  const l = lideranca(base, {}, {}, { limite: 2 });
  assert.equal(l.quentesSemAcao.length, 2);
  assert.equal(l.quentesSemAcaoTotal, 4);
});

test('sem nenhuma ação, o tempo até agir é desconhecido (null), não zero', () => {
  assert.equal(lideranca(base, {}, {}).diasAteAgir, null);
});
