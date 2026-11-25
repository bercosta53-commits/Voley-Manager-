// Testes de lib/tese.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teseDaConta } from '../../lib/tese.ts';

const pessoa = (nome, papelAbm, cargo = 'Diretor') => ({ nome, cargo, area: 'comercial', papel: 'decisor', fonte: 'teste', papelAbm });
const conta = extra => ({
  id: 'c1',
  nome: 'Alfa',
  tier: 'A',
  segmento: 'software',
  score: 72,
  tendencia: 18,
  vscsStatus: 'Alta prioridade',
  acaoRecomendada: 'ABM personalizado',
  icp: { tier: 'A', motivos: ['SaaS B2B', 'SP', 'R$ 40 mi'] },
  comite: [pessoa('Bia Souza', 'assina_cheque', 'CEO'), pessoa('Caio Lima', 'decisor', 'CRO')],
  comiteFaltando: ['dono_da_dor'],
  ...extra,
});
const sinal = (id, data, pontos, extra = {}) => ({
  id, contaId: 'c1', tipo: 'captacao', rotulo: 'Captação', porQueAgora: 'Captou R$ 50 mi', fonte: 'Valor', url: `https://valor.example/${id}`,
  data, alertaEm: data, exemplo: false, pontos, abordar: { nome: '', cargo: 'CRO', papel: 'decisor' }, peso: 1, ...extra,
});
const dep = (extra = {}) => ({
  hoje: '2026-11-25',
  aberto: () => true,
  ganchoDe: t => (t === 'captacao' ? 'Rodada nova costuma vir com meta de crescimento mais agressiva.' : undefined),
  papelDe: p => p.papelAbm ?? 'influenciador',
  acoesDeAbordagem: new Set(['Abordagem contextualizada', 'ABM personalizado', '1:1 executivo']),
  ...extra,
});

test('as seis respostas com uma conta completa', () => {
  const t = teseDaConta(conta(), [sinal('s1', '2026-11-20', 30), sinal('s2', '2026-11-10', 12)], dep());
  assert.deepEqual(t.empresa, { tier: 'A', motivos: ['SaaS B2B', 'SP', 'R$ 40 mi'], segmento: 'software' });
  assert.equal(t.agora.sinal.id, 's1'); // o mais forte
  assert.equal(t.agora.dias, 5);
  assert.equal(t.agora.abertos, 2);
  assert.equal(t.oportunidade, 'Rodada nova costuma vir com meta de crescimento mais agressiva.');
  assert.deepEqual(t.evidencias, [{ fonte: 'Valor', url: 'https://valor.example/s1', data: '2026-11-20' }]);
  assert.equal(t.quem.nome, 'Caio Lima'); // sinal sem nome: decisor do comitê vem primeiro
  assert.equal(t.quem.origem, 'comite');
  assert.deepEqual(t.comite, { pessoas: 2, faltando: ['dono_da_dor'] });
  assert.equal(t.acao.titulo, 'ABM personalizado');
  assert.equal(t.acao.abordar, true);
});

test('pessoa nomeada no sinal tem prioridade e ganha o papel do comitê', () => {
  const s = sinal('s1', '2026-11-20', 30, { abordar: { nome: 'bia souza', cargo: 'CEO', papel: 'decisor' } });
  const t = teseDaConta(conta(), [s], dep());
  assert.deepEqual(t.quem, { nome: 'bia souza', cargo: 'CEO', papel: 'assina_cheque', origem: 'sinal', statusValidacao: undefined, bloqueado: false, liberado: false });
});

test('evidência junta as fontes do mesmo fato sem repetir link e ignora fonte sem link', () => {
  const s = sinal('s1', '2026-11-20', 30, {
    fontes: [
      { fonte: 'Valor', url: 'https://a', data: '2026-11-20' },
      { fonte: 'Estadão', url: 'https://b', data: '2026-11-21' },
      { fonte: 'Valor', url: 'https://a', data: '2026-11-20' },
      { fonte: 'Rádio', url: '', data: '2026-11-21' },
    ],
  });
  assert.deepEqual(teseDaConta(conta(), [s], dep()).evidencias.map(e => e.fonte), ['Valor', 'Estadão']);
});

test('nada inventado: sem ICP, sem comitê e sem gancho conhecido', () => {
  const c = conta({ icp: undefined, tier: '', segmento: '', comite: [], comiteFaltando: undefined, v2: undefined });
  const t = teseDaConta(c, [sinal('s1', '2026-11-20', 10, { tipo: 'tipo_novo' })], dep());
  assert.equal(t.empresa, null);
  assert.equal(t.oportunidade, null);
  assert.equal(t.quem, null);
  assert.deepEqual(t.comite, { pessoas: 0, faltando: [] });
});

test('sem fato aberto: esperar um motivo, ou acompanhar quem já foi abordado', () => {
  const fechado = dep({ aberto: () => false });
  assert.equal(teseDaConta(conta(), [sinal('s1', '2026-11-20', 30)], fechado).acao.titulo, 'Esperar um motivo');
  assert.equal(teseDaConta(conta(), [sinal('s1', '2026-11-20', 30)], { ...fechado, abordadoEm: '2026-11-21' }).acao.titulo, 'Acompanhar a abordagem');
  assert.equal(teseDaConta(conta(), [], dep()).agora, null);
});

test('ação que não pede contato não empurra a abordagem', () => {
  const t = teseDaConta(conta({ acaoRecomendada: 'Monitorar' }), [sinal('s1', '2026-11-20', 30)], dep());
  assert.equal(t.acao.abordar, false);
  assert.match(t.acao.texto, /VSCS ainda é baixo/);
});

test('notícia setorial não vira o "por que agora", e a janela de 90 dias conta só fatos', () => {
  const setorial = sinal('n1', '2026-11-24', 99, { tipo: 'noticia_setorial' });
  const antigo = sinal('s0', '2026-06-01', 5);
  const t = teseDaConta(conta(), [setorial, sinal('s1', '2026-11-20', 30), antigo], dep());
  assert.equal(t.agora.sinal.id, 's1');
  assert.equal(t.fatos90d, 1);
});

// Formato real da base em 25/11 (devolutiva da inteligência): comitê com statusValidacao, sem papelAbm,
// sem acaoRecomendada e com scorePendente. Nomes fictícios.
const contaReal = () => ({
  id: 'rec-1', nome: 'Conta Real', tier: 'B', segmento: 'SaaS', score: 46, tendencia: 0, scorePendente: true, comite: [
    { nome: 'Ana CEO', cargo: 'Founder & CEO', area: 'executivo', papel: 'decisor', fonte: 'x', statusValidacao: 'VALIDAR_EMAIL_EXISTENTE' },
    { nome: 'Beto Vendas', cargo: 'Sales Director', area: 'comercial', papel: 'decisor', fonte: 'x', statusValidacao: 'BLOQUEADO_AGUARDA_AUDITORIA' },
    { nome: 'Caio CRO', cargo: 'CRO', area: 'comercial', papel: 'decisor', fonte: 'x', statusValidacao: 'BLOQUEADO_AGUARDA_AUDITORIA' },
  ],
  icp: { tier: 'B', motivos: ['Receita pendente'] },
});
const papelPorArea = p => (p.area === 'executivo' ? 'assina_cheque' : p.area === 'comercial' && p.papel === 'decisor' ? 'decisor' : 'influenciador');
const MATRIZ = { A: ['Monitorar', 'Ampliar pesquisa', 'Abordagem contextualizada', 'ABM personalizado', '1:1 executivo'], B: ['Monitorar', 'Monitorar', 'Ampliar pesquisa', 'Abordagem contextualizada', 'ABM personalizado'], C: ['Ignorar', 'Monitorar', 'Monitorar', 'Revisar ICP da conta', 'Revisar ICP da conta'] };
const faixa = v => (v >= 85 ? 4 : v >= 70 ? 3 : v >= 55 ? 2 : v >= 40 ? 1 : 0);
const depReal = extra => dep({ papelDe: papelPorArea, acaoDaMatriz: c => MATRIZ[c.icp?.tier ?? c.tier]?.[faixa(c.score)], ...extra });

test('contato bloqueado pela auditoria não é sugerido antes de um liberado', () => {
  const s = sinal('s1', '2026-11-23', 32, { tipo: 'vaga_area_alvo', abordar: { nome: '', cargo: 'Liderança de Receita', papel: 'decisor' } });
  const t = teseDaConta(contaReal(), [s], depReal());
  assert.equal(t.quem.nome, 'Ana CEO'); // os decisores comerciais estão bloqueados
  assert.equal(t.quem.bloqueado, false);
  assert.equal(t.quem.statusValidacao, 'VALIDAR_EMAIL_EXISTENTE');
});

test('se todos estão bloqueados, mostra o melhor papel sinalizado como bloqueado', () => {
  const c = contaReal();
  c.comite = c.comite.slice(1);
  const t = teseDaConta(c, [sinal('s1', '2026-11-23', 32)], depReal());
  assert.equal(t.quem.bloqueado, true);
});

test('nome mascarado no fato conta como fato sem nome', () => {
  const s = sinal('s1', '2026-11-23', 32, { abordar: { nome: '•••', cargo: 'Liderança', papel: 'decisor' } });
  assert.equal(teseDaConta(contaReal(), [s], depReal()).quem.origem, 'comite');
});

test('sem acaoRecomendada, a ação vem da matriz ICP × VSCS e diz isso', () => {
  const t = teseDaConta(contaReal(), [sinal('s1', '2026-11-23', 32)], depReal());
  assert.equal(t.acao.titulo, 'Monitorar'); // tier B com VSCS 46
  assert.equal(t.acao.origem, 'matriz');
  assert.equal(t.acao.abordar, false);
  assert.equal(t.scorePendente, true);
});

test('acaoRecomendada gravada pelo motor tem prioridade sobre a matriz', () => {
  const t = teseDaConta({ ...contaReal(), acaoRecomendada: 'Ampliar pesquisa' }, [sinal('s1', '2026-11-23', 32)], depReal());
  assert.deepEqual([t.acao.titulo, t.acao.origem], ['Ampliar pesquisa', 'base']);
});

test('andamento do time decide a próxima ação depois do contato', () => {
  const s = [sinal('s1', '2026-11-20', 30)];
  const reuniao = teseDaConta(conta(), s, dep({ andamento: { status: 'reuniao', em: '2026-11-24', por: 'ana@velora.com.br' } }));
  assert.deepEqual([reuniao.acao.titulo, reuniao.acao.origem, reuniao.acao.abordar], ['Preparar a reunião', 'andamento', false]);
  assert.equal(teseDaConta(conta(), s, dep({ andamento: { status: 'descartada', em: '2026-11-24', por: 'x' } })).acao.titulo, 'Conta descartada');
  // "abordado" sem fato aberto: acompanhar; com fato aberto, a matriz continua valendo
  assert.equal(teseDaConta(conta(), s, dep({ aberto: () => false, andamento: { status: 'abordado', em: '2026-11-24', por: 'x' } })).acao.titulo, 'Acompanhar a abordagem');
  assert.equal(teseDaConta(conta(), s, dep({ andamento: { status: 'abordado', em: '2026-11-24', por: 'x' } })).acao.titulo, 'ABM personalizado');
});

test('lista de liberados (adendo v2): APTO_HISTORICO vem antes de um papel melhor ainda pendente', async () => {
  const { rotuloValidacao } = await import('../../lib/tese.ts');
  const c = contaReal();
  c.comite.push({ nome: 'Eva Mkt', cargo: 'Gerente de Marketing', area: 'marketing', papel: 'influenciador', fonte: 'x', statusValidacao: 'APTO_HISTORICO' });
  const t = teseDaConta(c, [sinal('s1', '2026-11-23', 32)], depReal());
  assert.deepEqual([t.quem.nome, t.quem.liberado, t.quem.bloqueado], ['Eva Mkt', true, false]);
  assert.equal(rotuloValidacao('VALIDAR_EMAIL_EXISTENTE'), 'validar o e-mail antes');
  assert.equal(rotuloValidacao('STATUS_NOVO_QUALQUER'), 'status novo qualquer');
});
