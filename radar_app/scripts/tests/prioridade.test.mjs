// Testes da prioridade integrada experimental (lib/prioridade.ts): seção 12 do briefing v2. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atinge, classificar, dimensaoClima, dimensaoDigital, dimensaoIcp, dimensaoSinais, notaIntegrada, notaMinimaParaA1, visaoIntegrada,
} from '../../lib/prioridade.ts';

const N = (icp, sinais, clima, oportunidadeDigital) => ({ icp, sinais, clima, oportunidadeDigital });
const dim = (nota, extra = {}) => ({
  nota, resumo: null, status: 'avaliada', motivoSemNota: nota === null ? 'nao_coletado' : null, semAchados: false, entraNoCalculo: nota !== null,
  motivoExclusao: null, dataReferencia: null, fontes: [], origem: { campoOrigem: null, escalaOriginal: null, transformacao: null, mapeamento: 'documentado' },
  pendenciasQualidade: [], ...extra,
});
const visao = (icp, sinais, clima, digital, opts) => visaoIntegrada('c1', { icp: dim(icp), sinais: dim(sinais), clima: dim(clima), oportunidadeDigital: dim(digital) }, opts);

test('fronteiras da nota integrada (C 2,5 · B1 3,25 · A2 4,0 · A1 4,5)', () => {
  // ICP 4 e Sinais 4 garantem os mínimos de A; a média vem das outras duas
  const comMedia = m => { const resto = (4 * m - 8) / 2; return N(4, 4, resto, resto); };
  assert.equal(classificar(N(3, 3, 2, 1.9996)), 'C'); // 2,4999
  assert.equal(classificar(N(3, 3, 2, 2)), 'B2'); // 2,5
  assert.equal(classificar(N(3, 3, 3.5, 3.4996)), 'B2'); // 3,2499
  assert.equal(classificar(N(3, 3, 3.5, 3.5)), 'B1'); // 3,25
  assert.equal(classificar(comMedia(3.9999)), 'B1');
  assert.equal(classificar(comMedia(4.0)), 'A2');
  assert.equal(classificar(comMedia(4.4999)), 'A2');
  assert.equal(classificar(N(4.5, 4.5, 4.5, 4.5)), 'A1'); // 4,5
});

test('mínimos de A: ICP 3,99 cai para B1; Sinais 3,99 cai de A1 para A2; Clima ou Digital 2,99 cai para B1', () => {
  assert.equal(classificar(N(3.99, 5, 5, 5)), 'B1');
  assert.equal(classificar(N(5, 3.99, 5, 5)), 'A2');
  assert.equal(classificar(N(5, 5, 2.99, 5)), 'B1');
  assert.equal(classificar(N(5, 5, 5, 2.99)), 'B1');
});

test('trava: ICP abaixo de 3 com todo o resto em 5 é C', () => {
  assert.equal(classificar(N(2.99, 5, 5, 5)), 'C');
});

test('comparação segura de decimais: soma em float que fica 1e-16 abaixo do limite ainda atinge', () => {
  const m = notaIntegrada(N(4.6, 4.8, 4.7, 3.9)); // 4,5 em aritmética exata
  assert.notEqual(m, 4.5); // em float sai 4.499999999999999…
  assert.equal(atinge(m, 4.5), true);
  assert.equal(classificar(N(4.6, 4.8, 4.7, 3.9)), "A1"); // sem a tolerância cairia para A2
  assert.equal(atinge(4.4999, 4.5), false); // tolerância não é arredondamento
});

test('ausência de cada dimensão: nota e classe nulas, cobertura 3 de 4, candidata quando A1 é viável', () => {
  for (const [i, d] of ['icp', 'sinais', 'clima', 'oportunidadeDigital'].entries()) {
    const notas = [5, 5, 5, 5];
    notas[i] = null;
    const v = visao(...notas);
    assert.equal(v.notaIntegrada, null);
    assert.equal(v.classeIntegrada, null);
    assert.equal(v.cobertura, 3);
    assert.deepEqual(v.dimensoesFaltantes, [d]);
    assert.equal(v.situacaoSweetSpot, 'candidata');
  }
});

test('regra de faltas: 0 classifica, 1 viável é candidata, 1 que já falha é fora por critério, 2 é fora por falta de dados', () => {
  assert.equal(visao(5, 5, 5, 5).situacaoSweetSpot, 'sweet_spot'); // A1 (topo)
  assert.equal(visao(4, 3.5, 4.5, 4).situacaoSweetSpot, 'sweet_spot'); // A2 também está no sweet spot (D2)
  assert.equal(visao(4, 3.5, 4, 4).situacaoSweetSpot, 'fora_por_classe');
  assert.equal(visao(5, 5, null, 5).situacaoSweetSpot, 'candidata');
  const criterio = visao(3.5, 5, null, 5);
  assert.equal(criterio.situacaoSweetSpot, 'fora_por_criterio');
  assert.deepEqual(criterio.motivosClassificacao, ['ICP 3,5 < 4']);
  for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) {
    const notas = [5, 5, 5, 5];
    notas[a] = null;
    notas[b] = null;
    const v = visao(...notas);
    assert.equal(v.situacaoSweetSpot, 'fora_por_falta_de_dados');
    assert.equal(v.notaIntegrada, null);
  }
});

test('nota mínima para A1: soma 12,5 pede 5,5 (cai); soma 14 pede 4,0; ICP faltando pede ≥ 4; Clima faltando pede ≥ 3', () => {
  assert.equal(notaMinimaParaA1(N(4, 4, null, 4.5), 'clima'), null); // 12,5 → 5,5
  // com A2 no sweet spot (D2), a mesma conta é candidata: entrar pede média 4,0, ou seja Clima ≥ 3,5
  const c = visao(4, 4, null, 4.5);
  assert.equal(c.situacaoSweetSpot, 'candidata');
  assert.equal(c.investigacao.notaMinimaParaSweet, 3.5);
  assert.equal(c.investigacao.notaMinimaParaA1, null);
  assert.equal(c.investigacao.podeChegarA1, false);
  assert.equal(visao(3, 5, null, 5).situacaoSweetSpot, 'fora_por_criterio'); // ICP 3 < 4: nem A2
  assert.equal(notaMinimaParaA1(N(5, 4.5, null, 4.5), 'clima'), 4); // 14 → 4,0
  assert.equal(notaMinimaParaA1(N(null, 5, 5, 5), 'icp'), 4); // 18 − 15 = 3, mas o mínimo de ICP é 4
  assert.equal(notaMinimaParaA1(N(5, 5, null, 5), 'clima'), 3);
  const v = visao(5, 4.5, null, 4.5);
  assert.equal(v.investigacao.notaMinimaParaA1, 4);
  assert.equal(v.investigacao.podeChegarA1, true);
  assert.equal(v.investigacao.notaMinimaParaSweet, 3); // entrar (A2) pede média 4,0 e Clima ≥ 3
  assert.match(v.motivosClassificacao[0], /Clima do setor: precisa de nota ≥ 3 para o sweet spot/);
});

test('o 5,0 do teste de viabilidade nunca aparece no estado', () => {
  const v = visao(4.2, 4.6, null, 4.4);
  assert.equal(v.dimensoes.clima.nota, null);
  assert.equal(v.notaIntegrada, null);
  assert.equal(v.criteriosSweet, null);
  assert.doesNotMatch(JSON.stringify(v), /"nota":5[,}]/);
});

test('candidata que completa a dimensão é classificada normalmente, sem herdar estado', () => {
  const antes = visao(5, 4.5, null, 4.5);
  const depois = visao(5, 4.5, 4, 4.5);
  assert.equal(antes.situacaoSweetSpot, 'candidata');
  assert.equal(depois.situacaoSweetSpot, 'sweet_spot');
  assert.equal(depois.investigacao, null);
  assert.equal(depois.cobertura, 4);
});

test('dimensão desatualizada aparece mas não conta na cobertura', () => {
  const agora = new Date('2026-11-25T12:00:00Z');
  // validade de 135 dias (D7): agosto ainda vale; junho já está fora
  assert.equal(dimensaoDigital({ nivel: 2, confianca: 'adequada', dataReferencia: '2026-08-01', fonte: null, resumo: 'L2' }, agora).entraNoCalculo, true);
  const velha = dimensaoDigital({ nivel: 2, confianca: 'adequada', dataReferencia: '2026-06-01', fonte: null, resumo: 'L2' }, agora);
  assert.equal(velha.nota, 4);
  assert.equal(velha.status, 'desatualizada');
  assert.equal(velha.entraNoCalculo, false);
  const v = visaoIntegrada('c1', { icp: dim(4), sinais: dim(4), clima: dim(4), oportunidadeDigital: velha });
  assert.equal(v.cobertura, 3);
  assert.deepEqual(v.dimensoesFaltantes, ['oportunidadeDigital']);
});

test('dado fora do intervalo vira pendência e dimensão indisponível, sem correção silenciosa', () => {
  const s = dimensaoSinais({ score: 112 });
  assert.equal(s.nota, null);
  assert.equal(s.motivoSemNota, 'fora_do_intervalo');
  assert.deepEqual(s.pendenciasQualidade, ['VSCS 112 fora do intervalo 0–100']);
  assert.equal(dimensaoIcp({ tier: 'Z' }).motivoSemNota, 'fora_do_intervalo');
});

test('mapeamentos: VSCS vira 1 + 4v/100; sem achados não é lido como nota da rubrica; Clima indisponível', () => {
  assert.equal(dimensaoSinais({ score: 50 }).nota, 3);
  const zero = dimensaoSinais({ score: 0 });
  assert.equal(zero.nota, 1);
  assert.equal(zero.semAchados, true);
  assert.equal(zero.resumo, 'Nenhum sinal relevante encontrado');
  assert.deepEqual(dimensaoSinais({ score: 40, scorePendente: true }).pendenciasQualidade, ['VSCS pendente de certificação pelo motor']);
  assert.equal(dimensaoIcp({ icp: { tier: 'A', motivos: [] } }).nota, 5); // D5
  assert.equal(dimensaoIcp({ tier: '' }).nota, null);
  assert.equal(dimensaoClima().nota, null);
  assert.equal(dimensaoClima().origem.mapeamento, 'indisponivel');
  assert.equal(dimensaoDigital(undefined, new Date()).motivoSemNota, 'nao_coletado');
  assert.equal(dimensaoDigital({ nivel: 0, confianca: 'insuficiente', dataReferencia: null, fonte: null, resumo: '' }, new Date()).nota, null);
});

test('modo apresentação: dimensão oculta conta como faltante e não vaza pela classe', () => {
  const v = visao(5, 5, 5, 5, { ocultas: ['clima'] });
  assert.equal(v.classeIntegrada, null);
  assert.equal(v.dimensoes.clima.nota, null);
  assert.equal(v.dimensoes.clima.motivoSemNota, 'oculto_modo_apresentacao');
  assert.equal(v.situacaoSweetSpot, 'candidata');
});
