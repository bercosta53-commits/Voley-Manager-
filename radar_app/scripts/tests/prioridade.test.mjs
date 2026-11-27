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

test('fronteiras da nota integrada (C 2,5 · B1 3,25 · A2 4,0 · A1 4,5), com Clima pesando 0,5', () => {
  // ICP fixo; Sinais, Clima e Digital iguais a x: média = (icp + 2,5x) / 3,5
  const comMedia = (icp, m) => { const x = (3.5 * m - icp) / 2.5; return N(icp, x, x, x); };
  assert.equal(classificar(comMedia(3, 2.4999)), 'C');
  assert.equal(classificar(comMedia(3, 2.5)), 'B2');
  assert.equal(classificar(comMedia(3, 3.2499)), 'B2');
  assert.equal(classificar(comMedia(3, 3.25)), 'B1');
  assert.equal(classificar(comMedia(4, 3.9999)), 'B1');
  assert.equal(classificar(comMedia(4, 4.0)), 'A2');
  assert.equal(classificar(comMedia(5, 4.4999)), 'A2');
  assert.equal(classificar(N(4.5, 4.5, 4.5, 4.5)), 'A1'); // 4,5
});

test('mínimos de A: ICP 3,99 cai para B1; Sinais 3,99 cai de A1 para A2; Digital 2,99 cai para B1; Clima não tem mínimo', () => {
  assert.equal(classificar(N(3.99, 5, 5, 5)), 'B1');
  assert.equal(classificar(N(5, 3.99, 5, 5)), 'A2');
  assert.equal(classificar(N(5, 5, 2.99, 5)), 'A1'); // Clima sem mínimo e com peso 0,5 (27/11): média 4,71
  assert.equal(classificar(N(5, 5, 1, 5)), 'A2'); // Clima no piso só baixa a média (4,43)
  assert.equal(classificar(N(5, 5, 5, 2.99)), 'B1');
});

test('trava: ICP abaixo de 3 com todo o resto em 5 é C', () => {
  assert.equal(classificar(N(2.99, 5, 5, 5)), 'C');
});

test('comparação segura de decimais: soma em float que fica 1e-16 abaixo do limite ainda atinge', () => {
  const m = notaIntegrada(N(4.1, 4.3, 4.7, 5)); // 4,5 em aritmética exata
  assert.notEqual(m, 4.5); // em float sai 4.499999999999999…
  assert.equal(atinge(m, 4.5), true);
  assert.equal(classificar(N(4.1, 4.3, 4.7, 5)), 'A1'); // sem a tolerância cairia para A2
  assert.equal(atinge(4.4999, 4.5), false); // tolerância não é arredondamento
});

test('ausência de uma dimensão (27/11): classifica com as três, cobertura 3 de 4 e a faltante a investigar', () => {
  for (const [i, d] of ['icp', 'sinais', 'clima', 'oportunidadeDigital'].entries()) {
    const notas = [5, 5, 5, 5];
    notas[i] = null;
    const v = visao(...notas);
    assert.equal(v.notaIntegrada, 5);
    assert.equal(v.classeIntegrada, 'A1');
    assert.equal(v.cobertura, 3);
    assert.deepEqual(v.dimensoesFaltantes, [d]);
    assert.equal(v.situacaoSweetSpot, 'sweet_spot');
    assert.equal(v.investigacao.dimensao, d);
    assert.match(v.motivosClassificacao.at(-1), /Classificada com 3 de 4/);
  }
});

test('regra de faltas: 0 ou 1 faltando classifica; 2 ou mais é fora por falta de dados', () => {
  assert.equal(visao(5, 5, 5, 5).situacaoSweetSpot, 'sweet_spot'); // A1 (topo)
  assert.equal(visao(4, 3.5, 4.5, 4.5).situacaoSweetSpot, 'sweet_spot'); // A2: (4 + 3,5 + 2,25 + 4,5) / 3,5 = 4,07
  assert.equal(visao(4, 3.5, 4.5, 4).situacaoSweetSpot, 'fora_por_classe'); // média 3,93: B1
  assert.equal(visao(5, 5, null, 5).classeIntegrada, 'A1');
  const criterio = visao(3.5, 5, null, 5); // média das três 4,5, mas ICP 3,5 < 4
  assert.equal(criterio.classeIntegrada, 'B1');
  assert.equal(criterio.situacaoSweetSpot, 'fora_por_classe');
  assert.match(criterio.motivosClassificacao[0], /^ICP 3,5, falta 0,5/);
  for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) {
    const notas = [5, 5, 5, 5];
    notas[a] = null;
    notas[b] = null;
    const v = visao(...notas);
    assert.equal(v.situacaoSweetSpot, 'fora_por_falta_de_dados');
    assert.equal(v.notaIntegrada, null);
  }
});

test('nota mínima da faltante (Clima pesa 0,5): soma 12,5 pede 6,5 (cai); 14 pede 3,5; ICP faltando pede ≥ 4', () => {
  assert.equal(notaMinimaParaA1(N(4, 4, null, 4.5), 'clima'), null); // (15,75 − 12,5) / 0,5 = 6,5
  assert.equal(notaMinimaParaA1(N(5, 4.5, null, 4.5), 'clima'), 3.5); // (15,75 − 14) / 0,5
  assert.equal(notaMinimaParaA1(N(null, 5, 5, 5), 'icp'), 4); // 3,25 pela média, mas o mínimo de ICP é 4
  assert.equal(notaMinimaParaA1(N(5, 5, null, 5), 'clima'), 1.5);
  const v = visao(5, 4.5, null, 4.5); // classifica com as três: média 4,67 → A1
  assert.equal(v.classeIntegrada, 'A1');
  assert.equal(v.investigacao.notaMinimaParaA1, 3.5);
  assert.equal(v.investigacao.podeChegarA1, true);
  assert.equal(v.investigacao.notaMinimaParaSweet, null); // já está no sweet spot
});

test('a faltante nunca recebe nota inventada no estado', () => {
  const v = visao(4.2, 4.6, null, 4.4);
  assert.equal(v.dimensoes.clima.nota, null);
  assert.ok(Math.abs(v.notaIntegrada - 4.4) < 1e-9); // média das três avaliadas
  assert.doesNotMatch(JSON.stringify(v), /"nota":5[,}]/);
});

test('conta com 3 de 4 que completa a dimensão é reclassificada com as quatro, sem herdar estado', () => {
  const antes = visao(5, 4.5, null, 4.5);
  const depois = visao(5, 4.5, 4, 4.5);
  assert.equal(antes.cobertura, 3);
  assert.equal(antes.investigacao.dimensao, 'clima');
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

test('mapeamentos: VSCS vira 1 + 4v/100; sem achados não é lido como nota da rubrica; Clima sem edição fica sem nota', () => {
  assert.equal(dimensaoSinais({ score: 50 }).nota, 3);
  const zero = dimensaoSinais({ score: 0 });
  assert.equal(zero.nota, 1);
  assert.equal(zero.semAchados, true);
  assert.equal(zero.resumo, 'Nenhum sinal relevante encontrado');
  assert.deepEqual(dimensaoSinais({ score: 40, scorePendente: true }).pendenciasQualidade, ['VSCS pendente de certificação pelo motor']);
  assert.equal(dimensaoIcp({ icp: { tier: 'A', motivos: [] } }).nota, 5); // D5
  assert.equal(dimensaoIcp({ tier: '' }).nota, null);
  assert.equal(dimensaoClima().nota, null);
  assert.equal(dimensaoClima().origem.mapeamento, 'documentado');
  assert.equal(dimensaoDigital(undefined, new Date()).motivoSemNota, 'nao_coletado');
  assert.equal(dimensaoDigital({ nivel: 0, confianca: 'insuficiente', dataReferencia: null, fonte: null, resumo: '' }, new Date()).nota, null);
  // confiança insuficiente com nível do Atlas: entra com o nível provisório e a pendência de qualidade
  const prov = dimensaoDigital({ nivel: 1, confianca: 'insuficiente', dataReferencia: null, fonte: null, resumo: 'L1 · Presença inicial' }, new Date());
  assert.equal(prov.nota, 2);
  assert.equal(prov.entraNoCalculo, true);
  assert.deepEqual(prov.pendenciasQualidade, ['nível provisório: sem página válida auditada']);
  assert.match(prov.resumo, /provisório/);
});

test('modo apresentação: dimensão oculta conta como faltante e não vaza pela classe', () => {
  const v = visao(5, 5, 5, 5, { ocultas: ['clima'] });
  assert.equal(v.dimensoes.clima.nota, null);
  assert.equal(v.dimensoes.clima.motivoSemNota, 'oculto_modo_apresentacao');
  // a classe sai só das três visíveis: qualquer Clima escondido dá a mesma classe e a mesma média
  const w = visao(5, 5, 1, 5, { ocultas: ['clima'] });
  assert.equal(v.classeIntegrada, w.classeIntegrada);
  assert.equal(v.notaIntegrada, w.notaIntegrada);
});

test('Clima: nota = 3 + 2·S, de 1 a 5, com estado, fontes, confiança e validade da edição', () => {
  const agora = new Date('2026-11-26T12:00:00Z');
  const base = { nome: 'Regtech', estado: 'Bom', confianca: 'Alta', dataReferencia: '2026-11-25', fontes: [{ nome: 'Receita Federal', url: 'https://www.gov.br/x' }, { url: 'javascript:alert(1)' }] };
  const d = dimensaoClima({ ...base, S: 0.5 }, agora);
  assert.equal(d.nota, 4);
  assert.equal(d.resumo, 'Bom · Regtech');
  assert.equal(d.entraNoCalculo, true);
  assert.deepEqual(d.fontes, [{ url: 'https://www.gov.br/x', titulo: 'Receita Federal' }]); // link inseguro fica de fora
  assert.equal(dimensaoClima({ ...base, S: 0 }, agora).nota, 3);
  assert.equal(dimensaoClima({ ...base, S: -1 }, agora).nota, 1);
  assert.equal(dimensaoClima({ ...base, S: 1.4 }, agora).nota, 5);
  assert.deepEqual(dimensaoClima({ ...base, S: 0, confianca: 'Média' }, agora).pendenciasQualidade, ['confiança média na leitura do setor']);
  const velha = dimensaoClima({ ...base, S: 0.5, dataReferencia: '2026-10-01' }, agora);
  assert.equal(velha.status, 'desatualizada');
  assert.equal(velha.entraNoCalculo, false);
});

test('Clima: a vertical vem do código de especialização; sem código, a Generalista', async () => {
  const { climaPorCodigo } = await import('../../lib/prioridade-linhas.ts');
  const dados = {
    atualizadoEm: '2026-11-25T00:00:00-03:00', z: [1, -1], pesos: { macro: 0.4, setorial: 0.45, noticias: 0.15 },
    verticais: [
      { id: 'ESP01', nome: 'Fintech', codigos: ['ESP01'], sens: [1, 0], setorial: 1, noticias: 1, estado: 'Bom', confianca: 'Alta', fontes: [] },
      { id: 'GEN', nome: 'Generalista', codigos: ['GEN'], sens: [0, 1], setorial: 0, noticias: 0, estado: 'Ruim', confianca: 'Alta', fontes: [] },
    ],
  };
  const de = climaPorCodigo(dados);
  assert.equal(de('ESP01').nome, 'Fintech');
  assert.equal(Math.round(de('ESP01').S * 100) / 100, 1); // 0,4·1 + 0,45·1 + 0,15·1
  assert.equal(de(undefined).nome, 'Generalista');
  assert.equal(de(undefined).S, -1); // GEN segue o macro
  assert.equal(de('ESP99').nome, 'Generalista');
  assert.equal(climaPorCodigo(null)('ESP01'), null);
});

test('Clima como contexto (decisão de 27/11): sem mínimo e peso 0,5; setor ruim só baixa a média', () => {
  assert.equal(visao(5, 5, 1, 5).situacaoSweetSpot, 'sweet_spot'); // média 4,43: A2
  assert.equal(visao(5, 4, 1, 5).classeIntegrada, 'A2'); // média 4,14
  assert.equal(visao(5, 5, 5, 5).classeIntegrada, 'A1');
  assert.equal(visao(4, 3, 1, 3).classeIntegrada, 'B2'); // média 3,0: o que segura é o resto, não o Clima
});

test('Oportunidade digital vem do Atlas do snapshot, casado pelo id da conta', async () => {
  const { auditoriasPorDominio, fonteAquisicao } = await import('../../lib/prioridade-linhas.ts');
  const conta = (id, extra = {}) => ({ id, name: id, domain: '', tier: 'A', validPages: 0, forms: 0, whatsappLinks: 0, tags: {}, priority: 0, ...extra });
  const atlas = { schema: 't', lastUpdated: '2026-11-27', source: 't', caveat: '', accounts: [conta('rec1'), conta('rec2', { validPages: 2, forms: 1, tags: { ga4: 'network', gtm: 'network', googleAds: 'network' } })] };
  const arquivo = { schema: 't', lastUpdated: '2026-11-08', source: 't', caveat: '', accounts: [] };
  assert.equal(fonteAquisicao({ aquisicaoAtlas: atlas }, arquivo), atlas);
  assert.equal(fonteAquisicao({}, arquivo), arquivo);
  const m = auditoriasPorDominio(atlas);
  assert.equal(m.get('id:rec1').nivel, 1); // sem página válida: L1 provisório
  assert.equal(m.get('id:rec1').confianca, 'insuficiente');
  assert.ok(m.get('id:rec2').nivel >= 2);
});
