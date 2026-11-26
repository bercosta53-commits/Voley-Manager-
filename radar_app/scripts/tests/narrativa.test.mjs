// Testes de lib/narrativa.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movimentos, resumoNarrativa, temaDoFato } from '../../lib/narrativa.ts';

const f = (id, tipo, data, pontos = 0, extra = {}) => ({ id, tipo, data, pontos, alertaEm: data, sinal: id, ...extra });

test('tema vem do tipo, com a categoria como reserva', () => {
  assert.equal(temaDoFato({ tipo: 'vaga_area_alvo' }), 'time');
  assert.equal(temaDoFato({ tipo: 'vaga_expansao_comercial' }), 'expansao');
  assert.equal(temaDoFato({ tipo: 'executivo_chegou' }), 'lideranca');
  assert.equal(temaDoFato({ tipo: 'fusao_aquisicao', categoria: 'negativo' }), 'negativo');
  assert.equal(temaDoFato({ tipo: 'fusao_aquisicao' }), 'societario');
  assert.equal(temaDoFato({ tipo: 'lancamento_ia' }), 'oferta');
  assert.equal(temaDoFato({ tipo: 'noticia_setorial' }), 'contexto');
  assert.equal(temaDoFato({ tipo: 'desconhecido', categoria: 'expansao' }), 'expansao');
});

test('mesmo tema próximo no tempo forma um movimento; longe, dois', () => {
  const m = movimentos([f('v1', 'vaga_area_alvo', '2026-09-10', 5), f('v2', 'vaga_area_alvo', '2026-11-01', 7), f('v0', 'vaga_area_alvo', '2026-01-05', 3)]);
  const time = m.filter(x => x.tema === 'time');
  assert.equal(time.length, 2);
  assert.deepEqual(time[0].fatos.map(x => x.id), ['v2', 'v1']);
  assert.equal(time[0].forca, 12);
  assert.equal(time[0].de, '2026-09-10');
  assert.equal(time[0].ate, '2026-11-01');
});

test('contexto vai por último mesmo sendo o mais recente', () => {
  const m = movimentos([f('e', 'evento', '2026-11-20'), f('l', 'executivo_chegou', '2026-10-01', 40)]);
  assert.deepEqual(m.map(x => x.tema), ['lideranca', 'contexto']);
});

test('novos desde a última leitura usam a data do aviso', () => {
  const m = movimentos([f('a', 'parceria', '2026-11-01', 0, { alertaEm: '2026-11-22' }), f('b', 'parceria', '2026-10-30', 0, { alertaEm: '2026-11-10' })], { ultimaLeitura: '2026-11-15' });
  assert.equal(m[0].novos, 1);
  assert.equal(movimentos([f('a', 'parceria', '2026-11-01')])[0].novos, 0);
});

test('resumo fala só de contagens e datas dos fatos', () => {
  const m = movimentos([f('v1', 'vaga_area_alvo', '2026-09-10', 5), f('v2', 'vaga_area_alvo', '2026-11-01', 7), f('l', 'executivo_chegou', '2026-10-01', 30), f('e', 'evento', '2026-11-20')]);
  const r = resumoNarrativa(m);
  assert.equal(r.principal.tema, 'lideranca');
  assert.equal(r.frase, '2 movimentos. O que mais pesa: liderança mudando (1 fato, 1 out).');
  assert.equal(resumoNarrativa([]).frase, 'Nenhum fato registrado nesta conta ainda.');
  assert.equal(resumoNarrativa(movimentos([f('e', 'evento', '2026-11-20')])).frase, 'Só fatos de contexto.');
  assert.equal(resumoNarrativa(movimentos([f('p', 'parceria', '2026-11-20', 0)])).frase, '1 movimento, nenhum somando ao score hoje.');
});

test('data inválida fica de fora', () => {
  assert.equal(movimentos([f('x', 'parceria', 'sem data')]).length, 0);
});
