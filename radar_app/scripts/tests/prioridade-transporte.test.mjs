// Testes de lib/prioridade-transporte.ts (S-1): compactar e expandir não muda classe, nota nem motivo. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimensaoClima, dimensaoDigital, dimensaoIcp, dimensaoSinais, visaoIntegrada } from '../../lib/prioridade.ts';
import { compactarDimensao, expandirDimensao, expandirLinhas } from '../../lib/prioridade-transporte.ts';

const agora = new Date('2026-11-26T12:00:00Z');
const variantes = {
  icp: [dimensaoIcp({ icp: { tier: 'A', motivos: ['SaaS', 'SP'] } }), dimensaoIcp({ tier: '' }), dimensaoIcp({ tier: 'Z' })],
  sinais: [
    dimensaoSinais({ score: 63, scorePendente: true }, [{ data: '2026-11-20', url: 'https://x.example/a', fonte: 'Valor' }]),
    dimensaoSinais({ score: 0 }),
    dimensaoSinais({ score: 140 }),
  ],
  clima: [dimensaoClima()],
  oportunidadeDigital: [
    dimensaoDigital({ nivel: 2, confianca: 'parcial', dataReferencia: '2026-11-08', fonte: 'https://e.example', resumo: 'L2' }, agora),
    dimensaoDigital({ nivel: 3, confianca: 'adequada', dataReferencia: '2026-06-01', fonte: null, resumo: 'L3' }, agora),
    dimensaoDigital(undefined, agora),
  ],
};
const semOrigem = ({ origem: _, ...x }) => x;

test('ida e volta de cada dimensão: igual, só sem a origem (e sem o texto fixo do Clima)', () => {
  for (const [d, xs] of Object.entries(variantes))
    for (const x of xs) {
      const volta = expandirDimensao(compactarDimensao(d, x));
      const esperado = semOrigem(x);
      if (d === 'clima') Object.assign(esperado, { resumo: null, motivoExclusao: null });
      if (esperado.motivoExclusao === esperado.resumo) esperado.motivoExclusao = null;
      assert.deepEqual(volta, esperado, `${d}: ${JSON.stringify(x).slice(0, 80)}`);
    }
});

test('a visão recalculada no navegador é a mesma do servidor, em todas as combinações', () => {
  for (const icp of variantes.icp)
    for (const sinais of variantes.sinais)
      for (const dig of variantes.oportunidadeDigital) {
        const dims = { icp, sinais, clima: variantes.clima[0], oportunidadeDigital: dig };
        const servidor = visaoIntegrada('c', dims);
        const transporte = { contaId: 'c', nome: 'c', outrosNomes: [], setor: null, uf: '', tier: '', evidencia: null, acaoOficial: null, acaoDaMatriz: false,
          dims: Object.fromEntries(Object.entries(dims).map(([d, x]) => [d, compactarDimensao(d, x)])) };
        const [navegador] = expandirLinhas([transporte]);
        for (const k of ['cobertura', 'notaIntegrada', 'classeIntegrada', 'situacaoSweetSpot', 'motivosClassificacao', 'criteriosA1Atendidos', 'dimensoesFaltantes'])
          assert.deepEqual(navegador.visao[k], servidor[k], k);
        assert.deepEqual(navegador.visao.investigacao?.notaMinimaParaA1, servidor.investigacao?.notaMinimaParaA1);
      }
});

test('compactar de fato encolhe', () => {
  const x = variantes.oportunidadeDigital[2];
  assert.ok(JSON.stringify(compactarDimensao('oportunidadeDigital', x)).length < JSON.stringify(x).length / 3);
});
