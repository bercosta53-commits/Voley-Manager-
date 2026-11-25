// Testes de lib/frescor.ts. Rodar: npm test (node --experimental-strip-types --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frescor, hojeEmSaoPaulo, instanteBase, rotuloCarga, rotuloIdade } from '../../lib/frescor.ts';

const em = iso => new Date(iso);

test('data sem fuso é lida no horário de São Paulo', () => {
  assert.equal(instanteBase('2026-11-25T00:41')?.toISOString(), '2026-11-25T03:41:00.000Z');
  assert.equal(instanteBase('2026-11-25 00:41:10')?.toISOString(), '2026-11-25T03:41:10.000Z');
  assert.equal(instanteBase('2026-11-25')?.toISOString(), '2026-11-25T03:00:00.000Z');
});

test('data com fuso explícito é respeitada', () => {
  assert.equal(instanteBase('2026-11-25T03:41:00Z')?.toISOString(), '2026-11-25T03:41:00.000Z');
});

test('valor ausente ou ilegível é desconhecido', () => {
  assert.equal(instanteBase(undefined), null);
  assert.equal(instanteBase('ontem'), null);
  assert.deepEqual(frescor('ontem', em('2026-11-25T12:00:00Z')), { nivel: 'desconhecido', horas: null });
});

test('limites: até 36 h ok, até 72 h atenção, acima crítico', () => {
  const carga = '2026-11-25T00:30'; // 03:30 UTC
  assert.equal(frescor(carga, em('2026-11-25T12:00:00Z')).nivel, 'ok');
  assert.equal(frescor(carga, em('2026-11-26T15:30:00Z')).nivel, 'ok'); // exatamente 36 h
  assert.equal(frescor(carga, em('2026-11-26T15:31:00Z')).nivel, 'atencao');
  assert.equal(frescor(carga, em('2026-11-28T03:31:00Z')).nivel, 'critico');
});

test('relógio adiantado em relação à base não gera idade negativa', () => {
  assert.equal(frescor('2026-11-25T10:00', em('2026-11-25T12:00:00Z')).horas, 0);
});

test('hoje em São Paulo vira o dia às 3h UTC, não à meia-noite UTC', () => {
  assert.equal(hojeEmSaoPaulo(em('2026-11-26T02:59:00Z')), '2026-11-25');
  assert.equal(hojeEmSaoPaulo(em('2026-11-26T03:00:00Z')), '2026-11-26');
});

test('rótulos', () => {
  assert.equal(rotuloCarga('2026-11-25T00:41'), '25/11 às 00h41');
  assert.equal(rotuloCarga('2026-11-25'), '25/11');
  assert.equal(rotuloIdade(0.5), 'há menos de 1 h');
  assert.equal(rotuloIdade(30), 'há 30 h');
  assert.equal(rotuloIdade(80), 'há 3 dias');
});
