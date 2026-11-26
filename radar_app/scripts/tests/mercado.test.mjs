// Testes de lib/mercado.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leituraMercado, grupoDaConta, rotuloSequencia, SEM_GRUPO } from '../../lib/mercado.ts';

const HOJE = '2026-11-26';
const conta = (id, familia, ramo, vertical) => ({ id, nome: `Conta ${id}`, ramoTI: familia && { familia, nome: ramo }, especializacao: vertical && { nome: vertical } });
const fato = (id, contaId, tipo, data, pontos = 0) => ({ id, contaId, tipo, data, pontos, sinal: id });

const contas = [
  conta('1', 'Dados', 'Engenharia de Dados', 'Fintech'),
  conta('2', 'Dados', 'BI', null),
  conta('3', 'Software', 'SaaS B2B', 'Logtech'),
  conta('4', null, null, null),
];
const fatos = [
  fato('a', '1', 'vaga_area_alvo', '2026-09-01', 5),
  fato('b', '1', 'executivo_chegou', '2026-10-15', 30),
  fato('c', '2', 'vaga_lideranca_alvo', '2026-10-01', 10),
  fato('d', '2', 'executivo_chegou', '2026-11-10', 20),
  fato('e', '2', 'vaga_area_alvo', '2026-11-12', 3),
  fato('f', '3', 'lancamento_produto', '2026-11-20', 8),
  fato('g', '3', 'evento', '2026-11-21'),
  fato('h', '4', 'parceria', '2026-11-01'),
  fato('velho', '3', 'parceria', '2026-01-01'),
];

test('grupo vem do eixo; sem dado vira "Sem classificação"', () => {
  assert.equal(grupoDaConta(contas[0], 'familia'), 'Dados');
  assert.equal(grupoDaConta(contas[0], 'vertical'), 'Fintech');
  assert.equal(grupoDaConta(contas[1], 'vertical'), SEM_GRUPO);
});

test('janela, contexto fora, contagens por tema e grupo', () => {
  const r = leituraMercado(contas, fatos, 'familia', HOJE);
  assert.equal(r.totalFatos, 7); // sem o evento (contexto) e sem o fato velho
  assert.equal(r.contasComMovimento, 4);
  assert.deepEqual(r.grupos.map(g => [g.nome, g.fatos.length, g.contasComMovimento]), [['Dados', 5, 2], ['Software', 1, 1], [SEM_GRUPO, 1, 1]]);
  assert.equal(r.porTema.time, 3);
  assert.equal(r.porTema.lideranca, 2);
  assert.deepEqual(r.porMes, [{ mes: '2026-09', n: 1 }, { mes: '2026-10', n: 2 }, { mes: '2026-11', n: 4 }]);
  // fatos do grupo do mais recente ao mais antigo, com a conta junto
  assert.deepEqual(r.grupos[0].fatos.map(x => x.fato.id), ['e', 'd', 'b', 'c', 'a']);
});

test('sequência: contratação antes da liderança, em duas contas', () => {
  const r = leituraMercado(contas, fatos, 'familia', HOJE);
  assert.equal(r.sequencias.length, 1);
  assert.equal(r.sequencias[0].chave, 'time→lideranca');
  assert.equal(rotuloSequencia(r.sequencias[0]), 'Contratação → Liderança');
  assert.deepEqual(r.sequencias[0].contas.map(c => c.id).sort(), ['1', '2']);
});

test('destaque só com índice alto e ao menos 3 fatos', () => {
  const muitos = [...fatos, fato('x1', '3', 'lancamento_ia', '2026-11-02'), fato('x2', '3', 'parceria', '2026-11-03')];
  const r = leituraMercado(contas, muitos, 'familia', HOJE);
  const soft = r.grupos.find(g => g.nome === 'Software');
  assert.equal(soft.destaque.tema, 'oferta');
  assert.ok(soft.destaque.indice >= 1.5);
  assert.equal(r.grupos.find(g => g.nome === 'Dados').destaque?.tema, 'time');
});
