// Testes de lib/prioridade-visoes.ts (agrupar, Setor × Prioridade, cruzar, resumo, ordenação múltipla). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visaoIntegrada } from '../../lib/prioridade.ts';
import { agrupar, cruzar, mudarOrdem, ordemEmTexto, ordenarMulti, quadrante, resumoSetor, setorPorPrioridade } from '../../lib/prioridade-visoes.ts';

const dim = nota => ({ nota, resumo: null, status: 'avaliada', motivoSemNota: nota === null ? 'nao_coletado' : null, semAchados: false, entraNoCalculo: nota !== null, motivoExclusao: null, dataReferencia: null, fontes: [], origem: { campoOrigem: null, escalaOriginal: null, transformacao: null, mapeamento: 'documentado' }, pendenciasQualidade: [] });
const linha = (id, setor, notas) => ({
  contaId: id, nome: id, outrosNomes: [], setor, uf: 'SC', tier: 'A', evidencia: null, acaoOficial: null, acaoDaMatriz: false,
  visao: visaoIntegrada(id, { icp: dim(notas[0]), sinais: dim(notas[1]), clima: dim(notas[2]), oportunidadeDigital: dim(notas[3]) }),
});
const L = [
  linha('a', 'Fintech', [5, 5, 5, 5]), // A1
  linha('b', 'Fintech', [4, 3.5, 4, 4]), // B1
  linha('c', 'Logtech', [2, 5, 5, 5]), // C
  linha('d', null, [5, 5, null, 5]), // candidata
  linha('e', 'Fintech', [4, null, null, 4]), // sem métrica
];
const ids = ls => ls.map(l => l.contaId);

test('agrupar por setor: "Sem setor" existe e ninguém some', () => {
  const g = agrupar(L, 'setor');
  assert.deepEqual(g.map(x => [x.rotulo, x.linhas.length]), [['Fintech', 3], ['Logtech', 1], ['Sem setor', 1]]);
  assert.equal(g.reduce((n, x) => n + x.linhas.length, 0), L.length);
  assert.deepEqual(g[0].distribuicao.a1 + g[0].distribuicao.B1 + g[0].distribuicao.sem_metrica, 3);
});

test('agrupar por dimensão faltante: a conta entra em cada grupo do que falta', () => {
  const g = agrupar(L, 'faltante');
  assert.deepEqual(g.map(x => [x.chave, ids(x.linhas)]), [['nenhuma', ['a', 'b', 'c']], ['sinais', ['e']], ['clima', ['d', 'e']]]);
});

test('Setor × Prioridade: soma das células = total do recorte, por linha e por coluna', () => {
  const m = setorPorPrioridade(L);
  const somaCelulas = m.linhas.reduce((n, r) => n + Object.values(r.celulas).reduce((a, b) => a + b, 0), 0);
  assert.equal(somaCelulas, L.length);
  assert.equal(Object.values(m.totaisColuna).reduce((a, b) => a + b, 0), L.length);
  assert.equal(m.linhas[0].setor, 'Fintech'); // mais A1 primeiro
  assert.deepEqual(setorPorPrioridade(L, 'candidata').linhas[0].setor, 'Sem setor');
});

test('cruzar duas dimensões: faixas de 1 ponto, sem avaliação fora da grade, soma = total', () => {
  const c = cruzar(L, 'icp', 'sinais');
  const soma = Object.values(c.celulas).reduce((n, r) => n + Object.values(r).reduce((a, b) => a + b, 0), 0);
  assert.equal(soma + c.semAvaliacao, L.length);
  assert.equal(c.semAvaliacao, 1); // e não tem Sinais
  assert.equal(c.celulas[4][4], 2); // a (5,5) e d (5,5)
  assert.equal(c.celulas[3][4], 1); // b: Sinais 3,5, ICP 4
  assert.equal(c.celulas[4][2], 1); // c: Sinais 5, ICP 2
  assert.equal(quadrante('icp', 'sinais', 2, 4), 'Sinais alto, ICP baixo');
});

test('resumo do setor: média só das avaliadas, sempre com o n', () => {
  const r = resumoSetor(L, 'Fintech');
  assert.equal(r.contas, 3);
  assert.deepEqual(r.medias.sinais, { media: 4.25, n: 2 });
  assert.deepEqual(r.medias.clima, { media: 4.5, n: 2 });
  assert.deepEqual(resumoSetor(L, 'Sem setor').medias.clima, { media: null, n: 0 });
});

test('ordenação múltipla: clique troca, Shift+clique soma; sem valor no fim; ordem em texto', () => {
  let o = mudarOrdem([{ col: 'inicial', desc: true }], 'icp', false);
  o = mudarOrdem(o, 'sinais', true);
  assert.equal(ordemEmTexto(o), '1º ICP ↓, 2º Sinais ↓');
  assert.deepEqual(ids(ordenarMulti(L, o)), ['a', 'd', 'b', 'e', 'c']); // ICP 5,5 (Sinais 5,5) · 4 (3,5 · sem) · 2
  assert.deepEqual(mudarOrdem(o, 'icp', true), [{ col: 'icp', desc: false }, { col: 'sinais', desc: true }]);
  assert.deepEqual(mudarOrdem(o, 'nome', false), [{ col: 'nome', desc: false }]);
});

test('clicar numa célula do cruzamento filtra exatamente as contas dela', async () => {
  const { SEM_FILTROS, filtrar, filtrosEmTexto } = await import('../../lib/prioridade-filtros.ts');
  const celula = { x: 'icp', y: 'sinais', fx: 4, fy: 3 };
  assert.deepEqual(ids(filtrar(L, { ...SEM_FILTROS, celula }).linhas), ['b']);
  assert.equal(filtrosEmTexto({ ...SEM_FILTROS, celula }), 'ICP 4 a 5 e Sinais 3 a 4');
});
