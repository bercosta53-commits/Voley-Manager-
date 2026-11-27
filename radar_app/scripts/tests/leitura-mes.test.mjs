// Testes de lib/leitura-mes.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leituraDoMes, fraseDoMes, variacaoPct } from '../../lib/leitura-mes.ts';

const conta = (id, tier, familia) => ({ id, nome: id, tier, ramoTI: familia ? { nome: familia, familia } : undefined });
const fato = (id, contaId, data, tipo, pontos = 10, extra = {}) => ({ id, contaId, data, tipo, pontos, ...extra });
const ATE = '2026-11-26';
const contas = [conta('a', 'A', 'Software'), conta('b', 'B', 'Software'), conta('c', 'C', 'Dados')];

test('compara os 30 dias até a carga com os 30 anteriores, por fatos, contas e tema', () => {
  const l = leituraDoMes(contas, [
    fato('1', 'a', '2026-11-20', 'vaga_comercial'),
    fato('2', 'b', '2026-11-10', 'vaga_marketing'),
    fato('3', 'c', '2026-10-30', 'executivo_chegou'),
    fato('4', 'a', '2026-10-15', 'vaga_comercial'), // período anterior
    fato('5', 'a', '2026-08-01', 'vaga_comercial'), // fora das duas janelas
  ], ATE);
  assert.deepEqual(l.fatos, { agora: 3, antes: 1 });
  assert.deepEqual(l.contas, { agora: 3, antes: 1 });
  assert.equal(l.contasAB, 2);
  assert.deepEqual(l.temas[0], { tema: 'time', agora: 2, antes: 1 });
  assert.equal(l.desde, '2026-10-28');
});

test('não conta exemplo, notícia setorial, contexto, data futura nem conta fora da base', () => {
  const l = leituraDoMes(contas, [
    fato('1', 'a', '2026-11-20', 'vaga_comercial', 10, { exemplo: true }),
    fato('2', 'a', '2026-11-20', 'noticia_setorial'),
    fato('3', 'a', '2026-11-20', 'evento'),
    fato('4', 'a', '2026-12-20', 'vaga_comercial'),
    fato('5', 'zz', '2026-11-20', 'vaga_comercial'),
    fato('6', 'a', 'sem data', 'vaga_comercial'),
  ], ATE);
  assert.equal(l.fatos.agora, 0);
  assert.equal(fraseDoMes(l), 'Nenhum fato de movimento nos 30 dias até a última carga.');
});

test('principais: um fato por conta, A/B primeiro e variedade de temas', () => {
  const l = leituraDoMes(contas, [
    fato('1', 'a', '2026-11-20', 'vaga_comercial', 30),
    fato('2', 'a', '2026-11-19', 'vaga_comercial', 20),
    fato('3', 'b', '2026-11-18', 'vaga_marketing', 25),
    fato('4', 'c', '2026-11-17', 'executivo_chegou', 40),
  ], ATE, { principais: 2 });
  assert.deepEqual(l.principais.map(p => p.fato.id), ['1', '4']); // 'b' fica de fora: mesmo tema de 'a'
  assert.equal(l.principais[0].outros, 1);
});

test('semanas: 12 barras, a última termina na carga', () => {
  const l = leituraDoMes(contas, [fato('1', 'a', ATE, 'vaga_comercial'), fato('2', 'a', '2026-11-19', 'vaga_comercial')], ATE);
  assert.equal(l.semanas.length, 12);
  assert.equal(l.semanas.at(-1).ate, ATE);
  assert.equal(l.semanas.at(-1).n, 1);
  assert.equal(l.semanas.at(-2).n, 1);
});

test('frase só com números calculados', () => {
  const l = leituraDoMes(contas, [
    fato('1', 'a', '2026-11-20', 'vaga_comercial'), fato('2', 'b', '2026-11-20', 'vaga_comercial'),
    fato('3', 'a', '2026-11-10', 'vaga_comercial'), fato('4', 'c', '2026-11-10', 'lancamento_produto'),
    fato('5', 'a', '2026-10-20', 'vaga_comercial'),
  ], ATE);
  assert.equal(fraseDoMes(l), '4 fatos em 3 contas, +300% sobre o mês anterior. Contratação puxa o crescimento (1 → 3). Software concentra 75% dos fatos.');
  assert.equal(variacaoPct({ agora: 3, antes: 0 }), null);
});
