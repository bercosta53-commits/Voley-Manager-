// Clima ancorado na prioridade integrada (decisão de 28/11). Casos ilustrativos, não empresas reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar, dimensaoClima, notaIntegrada, notaMinimaParaSweet, visaoIntegrada } from '../../lib/prioridade.ts';
import { ajusteClima, modoClimaDoAmbiente } from '../../lib/prioridade-config.ts';
import { compactarDimensao, expandirLinhas } from '../../lib/prioridade-transporte.ts';
import { pontosQueFaltam } from '../../lib/ambiente.ts';
import { climaNaPrioridade } from '../../lib/prioridade-linhas.ts';

const N = (icp, sinais, clima, oportunidadeDigital) => ({ icp, sinais, clima, oportunidadeDigital });
const dim = (nota, extra = {}) => ({
  nota, resumo: null, status: 'avaliada', motivoSemNota: null, semAchados: false, entraNoCalculo: nota !== null, motivoExclusao: null,
  dataReferencia: null, fontes: [], pendenciasQualidade: [], ...extra,
});

test('interruptor: padrão ancorado; RADAR_CLIMA_NA_NOTA=media volta ao cálculo anterior', () => {
  assert.equal(modoClimaDoAmbiente(undefined), 'ancorado');
  assert.equal(modoClimaDoAmbiente('media'), 'media');
  assert.equal(modoClimaDoAmbiente('qualquer'), 'ancorado');
});

test('ajuste do Clima: (nota − 3) / 4, limitado a ±0,25; neutro não muda nada', () => {
  assert.equal(ajusteClima(3), 0);
  assert.ok(Math.abs(ajusteClima(3.4) - 0.1) < 1e-9);
  assert.equal(ajusteClima(5), 0.25);
  assert.equal(ajusteClima(1), -0.25);
});

test('nota ancorada = média de ICP, Sinais e Digital + ajuste do Clima; sem Clima, só a média das três', () => {
  assert.equal(notaIntegrada(N(5, 3.5, 3, 4), 'ancorado'), 12.5 / 3);
  assert.equal(notaIntegrada(N(5, 3.5, 2, 4), 'ancorado'), 12.5 / 3 - 0.25);
  assert.equal(notaIntegrada({ icp: 5, sinais: 3.5, oportunidadeDigital: 4 }, 'ancorado'), 12.5 / 3);
  // no cálculo anterior, Clima 2 com peso 0,5 derruba a mesma conta para 3,86 (B1)
  assert.equal(classificar(N(5, 3.5, 2, 4)), 'B1');
  assert.equal(classificar(N(5, 3.5, 2, 4), 'ancorado'), 'B1'); // 4,17 − 0,25 = 3,92
  assert.equal(classificar(N(5, 3.5, 3, 4), 'ancorado'), 'A2'); // Clima neutro: 4,17
});

test('nota mínima do Clima faltante no modo ancorado: o ajuste que falta; acima de 0,25 não há Clima que resolva', () => {
  assert.equal(notaMinimaParaSweet({ icp: 5, sinais: 3.5, oportunidadeDigital: 3.3 }, 'clima', 'ancorado'), 3 + 4 * (4 - 11.8 / 3));
  assert.equal(notaMinimaParaSweet({ icp: 4, sinais: 3, oportunidadeDigital: 3 }, 'clima', 'ancorado'), null);
  // Sinais faltante com Clima neutro: (4 − 0) × 3 − (5 + 4) = 3
  assert.equal(notaMinimaParaSweet({ icp: 5, clima: 3, oportunidadeDigital: 4 }, 'sinais', 'ancorado'), 3);
});

test('Clima da conta com o pulso: 3 + 2 × relativo; contra a maré não fica abaixo de 3; a nota anterior vai junto', () => {
  const clima = { nome: 'Generalista', estado: 'Ruim', S: -0.5, dataReferencia: '2026-11-25' };
  const agora = new Date('2026-11-28T12:00:00Z');
  assert.equal(dimensaoClima(clima, agora).nota, 2); // anterior
  const comPulso = dimensaoClima(clima, agora, { composto: -0.01, relativo: -0.06, contraMare: false });
  assert.equal(comPulso.nota, 2.9);
  assert.equal(comPulso.notaClassica, 2);
  assert.match(comPulso.resumo, /composto −?-?0,01, abaixo da média/);
  const contra = dimensaoClima(clima, agora, { composto: -0.3, relativo: -0.35, contraMare: true });
  assert.equal(contra.nota, 3);
  assert.match(contra.resumo, /cresce contra a maré/);
});

test('visão no modo ancorado traz a classe do cálculo anterior para comparar; no modo média, usa a nota anterior do Clima', () => {
  const dims = { icp: dim(5), sinais: dim(3.5), clima: dim(3, { notaClassica: 2 }), oportunidadeDigital: dim(4) };
  const a = visaoIntegrada('c1', dims, { modoClima: 'ancorado' });
  assert.equal(a.classeIntegrada, 'A2');
  assert.equal(a.classeAnterior, 'B1');
  assert.equal(a.modoClima, 'ancorado');
  const m = visaoIntegrada('c1', dims, { modoClima: 'media' });
  assert.equal(m.classeIntegrada, 'B1');
  assert.equal(m.dimensoes.clima.nota, 2);
  assert.equal(m.classeAnterior, undefined);
});

test('transporte: a nota anterior do Clima e o modo chegam ao navegador', () => {
  const dims = { icp: dim(5), sinais: dim(3.5), clima: dim(3, { notaClassica: 2 }), oportunidadeDigital: dim(4) };
  const compactas = Object.fromEntries(Object.entries(dims).map(([d, x]) => [d, compactarDimensao(d, x)]));
  assert.equal(compactas.clima.notaClassica, 2);
  assert.equal(compactas.icp.notaClassica, undefined);
  const [l] = expandirLinhas([{ contaId: 'c1', nome: 'C1', outrosNomes: [], setor: null, uf: '', tier: 'A', evidencia: null, acaoOficial: null, acaoDaMatriz: false, dims: compactas, modoClima: 'ancorado' }]);
  assert.equal(l.visao.classeIntegrada, 'A2');
  assert.equal(l.visao.classeAnterior, 'B1');
  const [sem] = expandirLinhas([{ contaId: 'c1', nome: 'C1', outrosNomes: [], setor: null, uf: '', tier: 'A', evidencia: null, acaoOficial: null, acaoDaMatriz: false, dims: compactas }]);
  assert.equal(sem.visao.classeIntegrada, 'B1'); // linha sem modo = cálculo anterior
});

test('alvo do Radar no modo ancorado: pontos que faltam pela média das três mais o ajuste', () => {
  assert.equal(pontosQueFaltam(N(5, 3.5, 3, 4), 'ancorado'), 0);
  assert.equal(pontosQueFaltam(N(5, 3.5, 2, 4), 'ancorado'), Math.round((4 - (12.5 / 3 - 0.25)) * 3 * 100) / 100);
  assert.ok(pontosQueFaltam(N(5, 3.5, 2, 4), 'media') > pontosQueFaltam(N(5, 3.5, 2, 4), 'ancorado'));
});

test('sem pulso medido (base sem crescimento de equipe), o servidor volta ao cálculo anterior', () => {
  const dados = { verticais: [{ id: 'GEN', nome: 'Generalista', codigos: ['GEN'], sens: [], setorial: 0, noticias: 0 }], z: [], pesos: { macro: 0.4, setorial: 0.45, noticias: 0.15 } };
  assert.equal(climaNaPrioridade({ contas: [], sinais: [] }, dados, undefined).modoClima, 'media');
  assert.equal(climaNaPrioridade({ contas: [], sinais: [] }, dados, 'media').modoClima, 'media');
});
