// Testes de lib/prioridade-filtros.ts (busca, filtros OU/E, faixa, ordenação). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visaoIntegrada } from '../../lib/prioridade.ts';
import { SEM_FILTROS, aplicarTudo, faixa, filtrar, filtrosEmTexto, ordenar, sugestoes } from '../../lib/prioridade-filtros.ts';

const dim = nota => ({ nota, resumo: null, status: 'avaliada', motivoSemNota: nota === null ? 'nao_coletado' : null, semAchados: false, entraNoCalculo: nota !== null, motivoExclusao: null, dataReferencia: null, fontes: [], origem: { campoOrigem: null, escalaOriginal: null, transformacao: null, mapeamento: 'documentado' }, pendenciasQualidade: [] });
const linha = (id, notas, extra = {}) => ({
  contaId: id, nome: id, outrosNomes: [], setor: 'Fintech', uf: 'SC', tier: 'A', evidencia: null, acaoOficial: null, acaoDaMatriz: false,
  visao: visaoIntegrada(id, { icp: dim(notas[0]), sinais: dim(notas[1]), clima: dim(notas[2]), oportunidadeDigital: dim(notas[3]) }),
  ...extra,
});
const L = [
  linha('Áurea Crédito', [5, 5, 5, 5], { outrosNomes: ['Aurea Instituição de Pagamento S.A.'] }), // A1
  linha('Bravo', [4, 3.5, 4, 4]), // B1 (3,86 com Clima pesando 0,5)
  linha('Cobalto', [2, 5, 5, 5], { setor: 'Logtech' }), // C
  linha('Delta', [5, 5, null, 5], { setor: null }), // A1 com 3 de 4 (falta Clima)
  linha('Eco', [3.5, 5, null, 5]), // B1 com 3 de 4: ICP trava o sweet spot
  linha('Faro', [4, null, null, 4], { setor: 'Logtech' }), // sem métrica
];
const f = extra => ({ ...SEM_FILTROS, ...extra });
const ids = r => r.map(l => l.contaId);

test('busca sem acento, caixa ou pontuação; por trecho, por outro nome e por setor; inclusive sem métrica', () => {
  assert.deepEqual(ids(aplicarTudo(L, f({ busca: 'aurea' })).visiveis), ['Áurea Crédito']);
  assert.deepEqual(ids(aplicarTudo(L, f({ busca: 'INSTITUICAO pagamento' })).visiveis), ['Áurea Crédito']);
  assert.deepEqual(ids(aplicarTudo(L, f({ busca: 'log' })).visiveis), ['Cobalto', 'Faro']);
  assert.deepEqual(ids(aplicarTudo(L, f({ busca: 'faro.' })).visiveis), ['Faro']);
});

test('termo que só existe fora dos filtros é contado à parte', () => {
  const r = aplicarTudo(L, f({ busca: 'faro', classes: ['A1'] }));
  assert.equal(r.visiveis.length, 0);
  assert.equal(r.naBuscaFora, 1);
});

test('OU dentro do grupo, E entre grupos', () => {
  assert.deepEqual(ids(filtrar(L, f({ classes: ['A1', 'C'] })).linhas), ['Áurea Crédito', 'Cobalto', 'Delta']);
  assert.deepEqual(ids(filtrar(L, f({ classes: ['A1', 'C'], setores: ['Logtech'] })).linhas), ['Cobalto']);
  assert.equal(filtrosEmTexto(f({ classes: ['A1', 'A2'], setores: ['TI'] })), 'A1 ou A2, E setor TI');
});

test('conta sem setor fica em "Sem setor"; sem nota não passa no filtro de nota mínima e é contada', () => {
  assert.deepEqual(ids(filtrar(L, f({ setores: ['Sem setor'] })).linhas), ['Delta']);
  const r = filtrar(L, f({ notaMin: { clima: 3 } }));
  assert.deepEqual(ids(r.linhas), ['Áurea Crédito', 'Bravo', 'Cobalto']);
  assert.equal(r.semNotaNoFiltro, 3);
});

test('situação do sweet spot, cobertura e dimensão faltante', () => {
  assert.deepEqual(ids(filtrar(L, f({ situacoes: ['sweet_spot'] })).linhas), ['Áurea Crédito', 'Delta']);
  assert.deepEqual(ids(filtrar(L, f({ coberturas: ['3'] })).linhas), ['Delta', 'Eco']);
  assert.deepEqual(ids(filtrar(L, f({ coberturas: ['2-'] })).linhas), ['Faro']);
  assert.deepEqual(ids(filtrar(L, f({ faltando: ['sinais'] })).linhas), ['Faro']);
  assert.deepEqual(ids(filtrar(L, f({ atalho: 'investigar' })).linhas), ['Delta']); // 3 de 4 no sweet spot; Eco fica fora (ICP trava)
});

test('faixa: cada conta em um segmento, e a soma é o total', () => {
  const r = faixa(L);
  assert.deepEqual(r, { a1: 2, A2: 0, B1: 2, B2: 0, C: 1, sem_metrica: 1 });
  assert.equal(Object.values(r).reduce((a, b) => a + b, 0), L.length);
});

test('ordem inicial: classificadas (4 ou 3 dimensões) pela nota, depois sem métrica; nada some', () => {
  assert.deepEqual(ids(ordenar([...L].reverse(), 'inicial')), ['Áurea Crédito', 'Delta', 'Eco', 'Cobalto', 'Bravo', 'Faro']);
  const porClima = ordenar(L, 'clima');
  assert.equal(porClima.length, L.length);
  assert.deepEqual(ids(porClima.slice(-3)), ['Delta', 'Eco', 'Faro']); // sem nota vai para o fim
});

test('sugestões em dois grupos: contas e setores', () => {
  const s = sugestoes(L, 'log');
  assert.deepEqual(s.setores, [{ setor: 'Logtech', n: 2 }]);
  assert.deepEqual(ids(s.contas), []);
});
