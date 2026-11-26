// Testes de lib/relacionamentos.ts (relacionamento 0–5, decisão de 26/11). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregar, chavePessoa, contasComViaQuente, validarNota } from '../../lib/relacionamentos.ts';

const agora = new Date('2026-11-26T12:00:00Z');
const L = (pessoa, nota, autor, em = '2026-11-20T10:00:00Z', conta = 'c1') => ({ conta_id: conta, pessoa, nota, autor_email: autor, registrado_em: em });

test('nota válida: inteiro de 0 a 5', () => {
  for (const v of [0, 3, 5]) assert.equal(validarNota(v), v);
  for (const v of [-1, 6, 2.5, '3', null, undefined]) assert.equal(validarNota(v), null);
});

test('agrega por pessoa: maior nota do time, data dela e a nota de quem vê', () => {
  const r = agregar([L('Fulana de Tal', 2, 'a@v.br'), L('Fulana de Tal', 5, 'b@v.br', '2026-11-10T00:00:00Z'), L('Beltrano', 1, 'a@v.br')], agora, 'a@v.br');
  assert.deepEqual(r[chavePessoa('Fulana de Tal')], { nota: 5, em: '2026-11-10', minha: 2, registros: 2 });
  assert.equal(r[chavePessoa('Beltrano')].minha, 1);
});

test('nome casa sem acento, caixa ou espaço extra', () => {
  assert.equal(chavePessoa('  Fábio   SOUZA '), chavePessoa('fabio souza'));
});

test('registro com mais de 365 dias não vale', () => {
  const r = agregar([L('Fulana', 5, 'a@v.br', '2025-06-01T00:00:00Z')], agora);
  assert.deepEqual(r, {});
});

test('via quente: conta com alguém em 4 ou 5', () => {
  const linhas = [L('A', 4, 'a@v.br', undefined, 'c1'), L('B', 3, 'a@v.br', undefined, 'c2'), L('C', 5, 'a@v.br', '2024-01-01T00:00:00Z', 'c3')];
  assert.deepEqual(contasComViaQuente(linhas, agora), ['c1']);
});
