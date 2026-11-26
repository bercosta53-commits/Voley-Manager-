// Testes de lib/casca-dados.ts (S-1). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraCasca } from '../../lib/casca-dados.ts';
import { SEM_FILTRO, aplicar, interpretar } from '../../lib/filtros.ts';
import { baseDeTeste } from '../app-de-teste.mjs';

const base = await baseDeTeste();
base.contas[0].qualificada = { status: 'sim', desde: '2026-11-20', motivo: 'regra', regra_versao: 'cq-1' };
base.contas[0].v2 = { anel: 1, frase: 'x', timing: 0.5, proximity: 0.5, contribuicoes: [{ id: 'z', texto: 'pesado'.repeat(200) }] };
const casca = paraCasca(base);
const porConta = b => {
  const m = new Map();
  for (const s of b.sinais) m.set(s.contaId, [...(m.get(s.contaId) ?? []), s]);
  return m;
};

test('índice leve: mesmas contas, sem campos pesados nem dados de contato', () => {
  assert.equal(casca.contas.length, base.contas.length);
  assert.equal(casca.sinais.length, base.sinais.length);
  const texto = JSON.stringify(casca);
  for (const pesado of ['historico', 'serie', 'contribuicoes', 'composicao', '"v2"', 'porQueAgora', 'email', 'linkedin']) assert.ok(!texto.includes(pesado), pesado);
  assert.ok(texto.length < JSON.stringify(base).length / 2, `${texto.length} de ${JSON.stringify(base).length}`);
  assert.deepEqual(Object.keys(casca.contas[0].comite[0] ?? { nome: 1, cargo: 1 }).sort(), ['cargo', 'nome']);
});

test('filtros e perguntas dão o mesmo resultado no índice e na base completa', () => {
  const perguntas = ['cooperativas', 'tier A', 'esquentando', 'com sinal', 'sem contato', 'score acima de 50', 'em sc', 'consórcios ativar'];
  for (const q of perguntas) {
    const { filtros } = interpretar(q);
    const nacompleta = aplicar(base.contas, filtros, porConta(base)).map(c => c.id);
    const noindice = aplicar(casca.contas, filtros, porConta(casca)).map(c => c.id);
    assert.deepEqual(noindice, nacompleta, q);
  }
  assert.deepEqual(
    aplicar(casca.contas, { ...SEM_FILTRO, qualificadas: true }, porConta(casca)).map(c => c.id),
    [base.contas[0].id],
  );
  assert.deepEqual(aplicar(casca.contas, { ...SEM_FILTRO, texto: base.contas[1].comite[0]?.nome ?? base.contas[1].nome }, porConta(casca)).map(c => c.id).includes(base.contas[1].id), true);
});
