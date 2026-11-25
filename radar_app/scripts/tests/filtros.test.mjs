// Testes de lib/filtros.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEM_FILTRO, aplicar, daUrl, interpretar, mesmosFiltros, paraUrl, temFiltro } from '../../lib/filtros.ts';

const conta = (id, extra = {}) => ({
  id, nome: id, razaoSocial: '', cnpj: '', dominio: '', cidade: '', segmento: 'Cooperativa de crédito', braco: '', uf: 'SC',
  tier: 'A', statusComercial: 'ATIVAR', tendencia: 0, score: 50, comite: [], ...extra,
});
const contas = [
  conta('Aurora', { comite: [{ nome: 'Helena Duarte' }], score: 80, tendencia: 10, qualificada: { status: 'sim' } }),
  conta('Ponte', { segmento: 'Seguradora', uf: 'SP', tier: 'B', statusComercial: 'NUTRIR / VALIDAR', tendencia: -5, cnpj: '12.345.678/0001-95' }),
  conta('Litoral', { segmento: 'Banco', uf: 'PR', tier: 'C', statusComercial: 'INSUFICIENTE — NÃO ABORDAR', score: 20 }),
];
const sinais = new Map([['Aurora', [{ id: 's1' }]]]);
const ids = f => aplicar(contas, { ...SEM_FILTRO, ...f }, sinais).map(c => c.id);

test('sem filtro, todas; cada filtro corta pelo que diz', () => {
  assert.deepEqual(ids({}), ['Aurora', 'Ponte', 'Litoral']);
  assert.deepEqual(ids({ tiers: ['B'] }), ['Ponte']);
  assert.deepEqual(ids({ ufs: ['SC', 'PR'] }), ['Aurora', 'Litoral']);
  assert.deepEqual(ids({ familias: ['seguro'] }), ['Ponte']);
  assert.deepEqual(ids({ status: ['nao_abordar'] }), ['Litoral']);
  assert.deepEqual(ids({ tendencia: 'desce' }), ['Ponte']);
  assert.deepEqual(ids({ comSinal: true }), ['Aurora']);
  assert.deepEqual(ids({ semContato: true }), ['Ponte', 'Litoral']);
  assert.deepEqual(ids({ scoreMin: 50 }), ['Aurora', 'Ponte']);
  assert.deepEqual(ids({ qualificadas: true }), ['Aurora']);
});

test('busca por texto: sem acento, por pessoa do comitê e por CNPJ só com dígitos', () => {
  assert.deepEqual(ids({ texto: 'helena' }), ['Aurora']);
  assert.deepEqual(ids({ texto: 'AURÓRA' }), ['Aurora']);
  assert.deepEqual(ids({ texto: '12345678000195' }), ['Ponte']);
  assert.deepEqual(ids({ texto: 'aurora helena' }), ['Aurora']); // todas as palavras precisam bater
  assert.deepEqual(ids({ texto: 'aurora ponte' }), []);
});

test('filtro salvo antes do campo "qualificadas" existir continua igual a "sem filtro"', () => {
  const { qualificadas, ...antigo } = SEM_FILTRO;
  assert.equal(temFiltro(antigo), false);
  assert.equal(mesmosFiltros(antigo, { ...SEM_FILTRO, qualificadas: false }), true);
  assert.equal(temFiltro({ ...SEM_FILTRO, qualificadas: true }), true);
});

test('URL ida e volta; URL quebrada não derruba a tela', () => {
  const f = { ...SEM_FILTRO, tiers: ['A'], ufs: ['SC'], scoreMin: 60 };
  assert.deepEqual(daUrl(paraUrl(f).split('?')[1]), f);
  assert.equal(daUrl('f=%7Bquebrado'), null);
  assert.equal(daUrl(''), null);
});

test('pergunta em português vira filtros e diz o que entendeu', () => {
  const r = interpretar('cooperativas tier A em Santa Catarina esquentando com score acima de 60');
  assert.deepEqual(r.filtros.tiers, ['A']);
  assert.deepEqual(r.filtros.ufs, ['SC']);
  assert.deepEqual(r.filtros.familias, ['cooperativa']);
  assert.equal(r.filtros.tendencia, 'sobe');
  assert.equal(r.filtros.scoreMin, 60);
  assert.equal(r.resto, '');
  assert.ok(r.entendido.includes('tier A') && r.entendido.includes('em SC'));
});

test('sigla de estado só vale depois de em/no/na ou no fim (não pega "se" no meio da frase)', () => {
  assert.deepEqual(interpretar('contas no sp').filtros.ufs, ['SP']);
  assert.deepEqual(interpretar('bancos que se movimentaram').filtros.ufs, []);
  assert.equal(interpretar('bancos que se movimentaram').filtros.comSinal, true);
});
