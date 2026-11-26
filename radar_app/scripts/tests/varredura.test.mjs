// Testes de lib/varredura.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coberturaDaConta, resumoCobertura } from '../../lib/varredura.ts';

const HOJE = '2026-11-26';

test('fato recente: com_fato, mesmo sem varredura registrada', () => {
  const c = coberturaDaConta('a', ['2026-10-01'], undefined, HOJE);
  assert.equal(c.estado, 'com_fato');
  assert.equal(c.ultimoFato, '2026-10-01');
});

test('varredura recente sem fato: sem_fato (a ausência é informação)', () => {
  const v = { a: { 'google-news': { em: '2026-11-20T10:00:00-03:00', resultado: 'sem_fato', itens: 0 } } };
  const c = coberturaDaConta('a', [], v, HOJE);
  assert.equal(c.estado, 'sem_fato');
  assert.deepEqual(c.fontesValidas, ['google-news']);
  assert.equal(c.ultimaVarredura, '2026-11-20');
});

test('varredura antiga ou fato antigo: vencida', () => {
  assert.equal(coberturaDaConta('a', [], { a: { x: { em: '2026-09-01', resultado: 'sem_fato' } } }, HOJE).estado, 'vencida');
  assert.equal(coberturaDaConta('a', ['2026-05-01'], undefined, HOJE).estado, 'vencida');
});

test('varredura com erro não conta como olhada', () => {
  assert.equal(coberturaDaConta('a', [], { a: { x: { em: '2026-11-25', resultado: 'erro' } } }, HOJE).estado, 'nao_varrida');
});

test('sem nada: nao_varrida; data ilegível é ignorada', () => {
  assert.equal(coberturaDaConta('a', [], undefined, HOJE).estado, 'nao_varrida');
  assert.equal(coberturaDaConta('a', [], { a: { x: { em: 'ontem', resultado: 'sem_fato' } } }, HOJE).estado, 'nao_varrida');
});

test('validade e janela configuráveis', () => {
  const v = { a: { x: { em: '2026-10-20', resultado: 'sem_fato' } } };
  assert.equal(coberturaDaConta('a', [], v, HOJE, { validadeDias: 60 }).estado, 'sem_fato');
  assert.equal(coberturaDaConta('a', ['2026-10-01'], undefined, HOJE, { janelaFatoDias: 30 }).estado, 'vencida');
});

test('resumo: conta por estado e tier, e lista A/B a varrer (nunca varridas primeiro)', () => {
  const contas = [
    { id: '1', nome: 'Alfa', tier: 'A' },
    { id: '2', nome: 'Beta', tier: 'B' },
    { id: '3', nome: 'Gama', tier: 'C' },
    { id: '4', nome: 'Delta', tier: 'A' },
    { id: '5', nome: 'Épsilon', tier: 'B' },
  ];
  const sinais = [{ contaId: '1', data: '2026-11-01' }, { contaId: '4', data: '2026-03-01' }];
  const v = { 5: { x: { em: '2026-11-22', resultado: 'sem_fato' } } };
  const r = resumoCobertura(contas, sinais, v, HOJE);
  assert.deepEqual(r.porEstado, { com_fato: 1, sem_fato: 1, vencida: 1, nao_varrida: 2 });
  assert.equal(r.porTier.A.com_fato, 1);
  assert.deepEqual(r.aVarrer.map(x => x.nome), ['Beta', 'Delta']);
});
