// Testes do OGI como 5ª dimensão em modo simulação (lib/ogi.ts, lib/simulacao-ogi.ts). Rodar: npm test.
// Todos os casos são ilustrativos (números montados para testar a regra), não empresas reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { causaComum, estadoOgi, forcaOgi, notaOgi, resultadosOgi, LIMIAR_RUIDO } from '../../lib/ogi.ts';
import { classeAtual, classificarComOgi, movimento, notaComOgi, resumir } from '../../lib/simulacao-ogi.ts';

// resultado como o pipeline grava: peso após persistência × materialidade × confiabilidade = ajuste
const R = (total, delta365, peso, mat, conf = 0.5, extra = {}) => ({
  total, delta365, pesoAposPersistencia: peso, fatorMaterialidade: mat, fatorConfiabilidade: conf, ajusteSimulado: Math.round(peso * mat * conf * 10) / 10, status: 'ok', ...extra,
});

test('ausência e base não comparável dão null, nunca zero nem penalidade', () => {
  assert.equal(estadoOgi(undefined), 'sem_dado');
  assert.equal(estadoOgi({ total: 40 }), 'sem_dado');
  assert.equal(estadoOgi({ total: null, delta365: 5 }), 'sem_dado');
  assert.equal(estadoOgi(R(10, 10, 90, 0.3)), 'nao_comparavel'); // base 0: a empresa não existia há 12 meses
  assert.equal(estadoOgi(R(80, 20, 60, 0.4, 0.5, { status: 'Bloqueado pela fonte' })), 'nao_comparavel');
  assert.equal(estadoOgi(R(80, 20, 60, 0.4, 0.5, { status: 'não comparável' })), 'nao_comparavel');
  assert.equal(estadoOgi(R(80, 20, 60, 0.4, 0.5, { status: 'escopo_local_nao_validado' })), 'nao_comparavel');
  assert.equal(estadoOgi(R(80, 20, 60, 0.4, 0.5, { status: 'simulacao_nao_publicada' })), 'crescimento');
  for (const r of [undefined, R(10, 10, 90, 0.3)]) assert.equal(notaOgi(r).nota, null);
});

test('ruído (menos de 3 pessoas), estagnação confirmada, crescimento e retração', () => {
  assert.equal(LIMIAR_RUIDO, 3);
  assert.equal(estadoOgi(R(11, 1, -5, 0.21)), 'ruido');
  assert.equal(estadoOgi(R(9, -2, -50, 0.22)), 'ruido');
  assert.equal(estadoOgi(R(12, 3, 60, 0.23)), 'crescimento');
  assert.equal(estadoOgi(R(97, -3, -20, 0.23)), 'retracao');
  assert.equal(estadoOgi(R(400, 0, -10, 1)), 'estagnado');
  // ruído é neutro (3), mesmo quando o peso gravado seria negativo
  assert.equal(notaOgi(R(9, -2, -50, 0.22)).nota, 3);
  // estagnação confirmada mantém a leve penalidade do OGI: −10 × 1 × 0,5 = −5 → 3 − 5/45
  assert.equal(notaOgi(R(400, 0, -10, 1)).nota, 2.89);
});

test('normalização: neutro 3, mesma inclinação nos dois lados (assimetria preservada), limitada a 1–5', () => {
  const alta = notaOgi(R(220, 20, 60, 0.4, 1)); // +24 pontos
  const queda = notaOgi(R(180, -20, -85, 0.4, 1)); // −34 pontos (−10% pesa mais que +10%)
  assert.equal(alta.nota, 3.53);
  assert.equal(queda.nota, 2.24);
  assert.ok(3 - queda.nota > alta.nota - 3, 'a queda do mesmo tamanho afasta mais do neutro');
  assert.equal(notaOgi(R(200, 100, 90, 1, 1)).nota, 5);
  assert.equal(notaOgi(R(40, -60, -125, 0.8, 1)).nota, 1);
  // com confiabilidade 0,5 a força cai à metade e a nota fica provisória
  const c = notaOgi(R(200, 100, 90, 1, 0.5));
  assert.equal(c.nota, 4);
  assert.equal(c.provisoria, true);
  assert.equal(notaOgi(R(200, 100, 90, 1, 0.5), { usarConfiabilidade: false }).nota, 5);
  // escala configurável, para testar a normalização
  assert.equal(notaOgi(R(200, 100, 90, 1, 1), { escala: 90 }).nota, 4);
});

test('força: usa os fatores gravados; sem eles, deriva do ajuste', () => {
  assert.equal(forcaOgi(R(200, 100, 90, 1, 0.5), true), 45);
  assert.equal(forcaOgi({ ajusteSimulado: 18, fatorConfiabilidade: 0.5 }, false), 36);
  assert.equal(forcaOgi({ ajusteSimulado: 18 }, false), null); // sem saber a confiabilidade, não inventa
});

test('causa comum: expansão deduplica alta; vaga genérica não é causa; reorganização explica os dois lados', () => {
  const sinais = [
    { id: 's1', tipo: 'vaga_area_alvo', data: '2026-10-01' },
    { id: 's2', tipo: 'expansao_mercado', data: '2026-03-01' },
    { id: 's3', tipo: 'fusao_aquisicao', data: '2025-09-01' }, // fora da janela de 12 meses
  ];
  assert.equal(causaComum('crescimento', sinais, '2026-11-27')?.sinal.id, 's2');
  assert.equal(causaComum('crescimento', [sinais[0]], '2026-11-27'), null);
  assert.equal(causaComum('retracao', sinais, '2026-11-27'), null);
  assert.equal(causaComum('retracao', [{ id: 'm', tipo: 'fusao_aquisicao', data: '2026-06-01' }], '2026-11-27')?.causa, 'reorganizacao');
  assert.equal(causaComum('estagnado', sinais, '2026-11-27'), null);
  assert.equal(causaComum('crescimento', [{ tipo: 'captacao', data: '2026-05-01', exemplo: true }], '2026-11-27'), null);

  const r = R(200, 100, 90, 1, 1, { consultadoEm: '2026-11-20' });
  const sem = notaOgi(r, { sinais, descontoCausaComum: 0 });
  const com = notaOgi(r, { sinais });
  const total = notaOgi(r, { sinais, descontoCausaComum: 1 });
  assert.equal(sem.nota, 5);
  assert.equal(com.nota, 4); // metade do afastamento: 3 + 2 × 0,5
  assert.deepEqual(com.deduplicacao, { causa: 'expansao', sinalId: 's2', desconto: 0.5 });
  assert.equal(total.nota, 3);
});

test('resultadosOgi lê o caminho do pipeline e devolve vazio sem bloco OGI', () => {
  assert.deepEqual(resultadosOgi({}), {});
  assert.deepEqual(resultadosOgi(null), {});
  assert.equal(resultadosOgi({ ogi: { simulacaoAssimetria: { resultados: { a: { total: 1 } } } } }).a.total, 1);
});

const N = (icp, sinais, clima, oportunidadeDigital) => ({ icp, sinais, clima, oportunidadeDigital });

test('modo média (só comparação): o neutro (3) dilui quem está acima de 4', () => {
  const M = { modo: 'media' };
  assert.equal(notaComOgi(N(5, 5, 5, 5), null), 5);
  assert.equal(notaComOgi(N(4, 4, 4, 4), 3, 1, 'media'), (4 * 3.5 + 3) / 4.5);
  // achado da simulação: OGI neutro puxa a média para baixo; A2 com média 4,14 cai para 3,89 (B1)
  assert.equal(classeAtual(N(5, 4, 3, 4)), 'A2');
  assert.equal(classificarComOgi(N(5, 4, 3, 4), 3, M), 'B1');
  assert.equal(classificarComOgi(N(5, 4, 3, 4), 4, M), 'A2');
  // A1 (média 4,71) com OGI neutro cai para A2 (4,33); abaixo do mínimo 3, sai do sweet spot
  assert.equal(classeAtual(N(5, 5, 3, 5)), 'A1');
  assert.equal(classificarComOgi(N(5, 5, 3, 5), 3, M), 'A2');
  assert.equal(classificarComOgi(N(5, 5, 3, 5), 2.9, M), 'B1');
});

test('modo ancorado: OGI neutro não muda nota nem classe; só o afastamento do neutro mexe', () => {
  const A = { modo: 'ancorado' };
  assert.equal(notaComOgi(N(5, 4, 3, 4), 3, 1, 'ancorado'), notaComOgi(N(5, 4, 3, 4), null));
  assert.equal(classificarComOgi(N(5, 4, 3, 4), 3), 'A2'); // ancorado é o padrão (decisão de 27/11)
  assert.equal(classificarComOgi(N(5, 4, 3, 4), 3, A), 'A2'); // no modo média, o neutro derrubava para B1
  // conta fraca (média 2,4) não sobe de C para B2 com OGI neutro ou em retração leve
  const fraca = N(3, 2, 2.4, 2.2); // média 2,4
  assert.equal(classificarComOgi(fraca, 3, A), 'C');
  assert.equal(classificarComOgi(fraca, 2.9, A), 'C');
  assert.equal(classificarComOgi(fraca, 3, { modo: 'media' }), 'B2'); // o efeito de diluição que o modo ancorado evita
  // crescimento forte ainda soma: +2 de OGI × 1/4,5 ≈ +0,44 na nota
  assert.ok(notaComOgi(fraca, 5, 1, 'ancorado') - notaComOgi(fraca, null) > 0.44);
});

test('travas preservadas: ICP < 3 é C mesmo com OGI máximo; OGI não substitui o mínimo de Sinais', () => {
  assert.equal(classificarComOgi(N(2, 5, 5, 5), 5), 'C');
  assert.equal(classificarComOgi(N(5, 2.5, 5, 5), 5), 'B1'); // Sinais abaixo de 3 continua fora do sweet spot
});

test('ausência do OGI conta como faltante: com Digital também ausente, sai da classificação', () => {
  assert.equal(classificarComOgi(N(5, 4, 3, 4), null), 'A2');
  assert.equal(classificarComOgi({ icp: 5, sinais: 4, clima: 3 }, null), null);
  assert.equal(classificarComOgi({ icp: 5, sinais: 4, clima: 3 }, null, { maxFaltantes: 2 }), 'A2');
});

test('movimento e resumo da simulação', () => {
  assert.equal(movimento('B1', 'A2'), 'sobe');
  assert.equal(movimento('A2', 'B1'), 'desce');
  assert.equal(movimento(null, 'B2'), 'entra');
  assert.equal(movimento('B2', null), 'sai');
  const r = resumir([
    { contaId: 'a', antes: 'A2', depois: 'B1', notaAntes: 4, notaDepois: 3.8, movimento: 'desce' },
    { contaId: 'b', antes: 'B1', depois: 'B1', notaAntes: 3.4, notaDepois: 3.5, movimento: 'igual' },
  ]);
  assert.equal(r.matriz.A2.B1, 1);
  assert.equal(r.sweetAntes, 1);
  assert.equal(r.sweetDepois, 0);
  assert.equal(r.porMovimento.desce, 1);
});
