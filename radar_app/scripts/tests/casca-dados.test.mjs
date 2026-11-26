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

test('aliviar a base: esvazia só o que a tela não usa, sem inventar nada', async () => {
  const { aliviarBase } = await import('../../lib/casca-dados.ts');
  const b = structuredClone(base);
  b.contas[0].historico = [{ data: '2026-09-01', tipo: 'x' }, { data: '2026-11-01', tipo: 'y' }];
  b.contas[0].v2 = { anel: 1, frase: '', timing: 0, proximity: 0, contribuicoes: [{ id: 'q' }] };
  const semSinal = b.contas.find(c => !b.sinais.some(s => s.contaId === c.id));
  if (semSinal) semSinal.v2 = { anel: 1, frase: '', timing: 0, proximity: 0, contribuicoes: [{ id: 'k' }] };
  const a = aliviarBase(b, { decomposicao: 'com_sinal', historico: 'mais_recente', serie: false });
  assert.equal(a.contas.length, b.contas.length);
  assert.deepEqual(a.contas[0].historico.map(h => h.data), ['2026-11-01']);
  assert.deepEqual(a.contas[0].serie, []);
  const comSinal = a.contas.find(c => b.sinais.some(s => s.contaId === c.id) && b.contas.find(x => x.id === c.id).composicao.length);
  if (comSinal) assert.ok(comSinal.composicao.length > 0);
  if (semSinal) assert.deepEqual(a.contas.find(c => c.id === semSinal.id).v2.contribuicoes, []);
  assert.equal(a.contas[0].score, b.contas[0].score); // score, nome, comitê etc. intactos
  assert.deepEqual(aliviarBase(b, {}).contas, b.contas); // padrão: nada muda
});
