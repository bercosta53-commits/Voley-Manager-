// Testes de lib/memoria.ts (P0-8). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoComValidade } from '../../lib/memoria.ts';

test('reaproveita dentro da validade e lê de novo depois', async () => {
  let t = 0, leituras = 0;
  const ler = memoComValidade(async () => ({ n: ++leituras }), 1000, { agora: () => t });
  assert.equal((await ler()).n, 1);
  t = 999;
  assert.equal((await ler()).n, 1);
  t = 1000;
  assert.equal((await ler()).n, 2);
});

test('leituras simultâneas com a memória vazia fazem uma busca só', async () => {
  let leituras = 0;
  const ler = memoComValidade(async () => (await new Promise(r => setTimeout(r, 10)), ++leituras), 1000);
  const [a, b, c] = await Promise.all([ler(), ler(), ler()]);
  assert.deepEqual([a, b, c, leituras], [1, 1, 1, 1]);
});

test('falha não fica guardada: a próxima chamada tenta de novo', async () => {
  let vez = 0;
  const ler = memoComValidade(async () => {
    if (++vez === 1) throw new Error('Supabase fora');
    return 'ok';
  }, 1000);
  await assert.rejects(ler(), /Supabase fora/);
  assert.equal(await ler(), 'ok');
});

test('congelada, qualquer alteração na base guardada quebra na hora', async () => {
  const ler = memoComValidade(async () => ({ contas: [{ nome: 'A', comite: [{ nome: 'z' }, { nome: 'a' }] }] }), 1000, { congelar: true });
  const base = await ler();
  assert.throws(() => base.contas.push({}), TypeError);
  assert.throws(() => base.contas[0].comite.sort((x, y) => x.nome.localeCompare(y.nome)), TypeError);
  assert.throws(() => { 'use strict'; base.contas[0].nome = 'B'; }, TypeError);
});
