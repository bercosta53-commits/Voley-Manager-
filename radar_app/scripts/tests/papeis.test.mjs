// Testes de lib/papeis.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltandoNoComite } from '../../lib/papeis.ts';

const p = (area, papel, extra = {}) => ({ nome: 'x', cargo: 'x', area, papel, fonte: 'x', ...extra });

test('sem comiteFaltando na carga, o comitê não conta como completo: lê os cargos', () => {
  assert.deepEqual(faltandoNoComite({ comite: [] }), ['Assina o cheque', 'Decisor', 'Dono da dor']);
  assert.deepEqual(faltandoNoComite({ comite: [p('comercial', 'decisor')] }), ['Assina o cheque', 'Dono da dor']);
  assert.deepEqual(faltandoNoComite({ comite: [p('executivo', 'decisor'), p('comercial', 'decisor'), p('marketing', 'influenciador')] }), []);
});

test('papel ABM e papéis extras valem como lugar ocupado', () => {
  assert.deepEqual(faltandoNoComite({ comite: [p('ti', 'x', { papelAbm: 'decisor', papeisExtras: ['dono_da_dor'] })] }), ['Assina o cheque']);
});

test('o que o motor gravou tem prioridade, inclusive a lista vazia', () => {
  assert.deepEqual(faltandoNoComite({ comite: [], comiteFaltando: [] }), []);
  assert.deepEqual(faltandoNoComite({ comite: [p('executivo', 'decisor')], comiteFaltando: ['Decisor'] }), ['Decisor']);
});
