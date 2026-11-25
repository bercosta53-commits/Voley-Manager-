// Testes de lib/cobertura.ts e do filtro "quentes sem ação" (lib/filtros.ts). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobertura, ehQuente } from '../../lib/cobertura.ts';
import { SEM_FILTRO, aplicar } from '../../lib/filtros.ts';

const pessoa = (area, papel) => ({ nome: area, cargo: area, area, papel, fonte: 'x' });
const conta = (id, score, extra = {}) => ({
  id, nome: id, razaoSocial: '', cnpj: '', dominio: '', cidade: '', segmento: '', braco: '', uf: 'SC', tier: 'A',
  statusComercial: 'ATIVAR', tendencia: 0, score, comite: [], ...extra,
});

test('quente = VSCS 55 ou mais, ou qualificada pelo motor', () => {
  assert.equal(ehQuente({ score: 55 }), true);
  assert.equal(ehQuente({ score: 54 }), false);
  assert.equal(ehQuente({ score: 10, qualificada: { status: 'sim' } }), true);
  assert.equal(ehQuente({ score: 10, qualificada: { status: 'desconhecido' } }), false);
});

test('qualquer clique do fluxo ou andamento conta como trabalho; quente sem nada é o alerta', () => {
  const c = conta('a', 70, { comite: [pessoa('executivo', 'decisor')] });
  const s = [{ id: 's1' }, { id: 's2' }];
  assert.deepEqual(cobertura(c, s, {}), { quente: true, trabalhada: false, subTrabalhada: true, comite: 1 });
  assert.equal(cobertura(c, s, { s2: { avaliacao: 'ruido' } }).subTrabalhada, false);
  assert.equal(cobertura(c, s, { s1: { acao: 'adiado', ate: '2026-12-01' } }).subTrabalhada, false);
  assert.equal(cobertura(c, [], {}, { status: 'reuniao' }).subTrabalhada, false);
  assert.equal(cobertura(conta('b', 30), s, {}).subTrabalhada, false); // fria nunca é alerta
  assert.equal(cobertura(c, s, { s1: { relevancia: 3 } }).trabalhada, false); // nota sozinha não é ação comercial
});

test('filtro "quentes sem ação": só quentes, e fora as que o time já trabalhou', () => {
  const contas = [conta('a', 80), conta('b', 60), conta('c', 20)];
  const ids = trabalhadas => aplicar(contas, { ...SEM_FILTRO, subTrabalhadas: true }, new Map(), trabalhadas).map(c => c.id);
  assert.deepEqual(ids(new Set()), ['a', 'b']);
  assert.deepEqual(ids(new Set(['a'])), ['b']);
});
