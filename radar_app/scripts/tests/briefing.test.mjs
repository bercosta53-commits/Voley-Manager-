// Testes de lib/briefing.ts (P3-6). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefingEmTexto, montarBriefing } from '../../lib/briefing.ts';
import { detectarPlaybook } from '../../lib/playbooks.ts';

const CARGA = '2026-11-26';
const conta = (extra = {}) => ({
  id: 'c', nome: 'Exemplo SA', razaoSocial: '', cnpj: '', dominio: 'exemplo.com.br', cidade: 'Joinville', uf: 'SC', segmento: 'Software',
  tier: 'B', score: 62, tendencia: 18, serie: [], composicao: [], historico: [], vscsStatus: 'Alta prioridade', acaoRecomendada: 'ABM personalizado',
  comite: [
    { nome: 'Ana Lima', cargo: 'Head de Growth', area: 'marketing', papel: 'decisor', fonte: 'Apollo', email: 'ana@exemplo.com.br', linkedin: 'https://linkedin.com/in/ana' },
    { nome: 'Rui Paz', cargo: 'CEO', area: 'executivo', papel: 'decisor', fonte: 'Site da empresa', statusValidacao: 'BLOQUEADO_AGUARDA_AUDITORIA' },
  ],
  ...extra,
});
const sinal = (id, tipo, data, extra = {}) => ({
  id, contaId: 'c', tipo, data, rotulo: tipo, pontos: 10, nivel: 'B', porQueAgora: `Fato ${id}.`, fonte: 'Valor Econômico', url: `https://exemplo.org/${id}`, alertaEm: data, peso: 1, abordar: { nome: '', cargo: '' }, ...extra,
});

test('cada fato tem fonte; fato sem fonte não entra; fato antigo não entra', () => {
  const s = [sinal('a', 'lancamento_produto', '2026-11-20'), sinal('b', 'vaga_area_alvo', '2026-11-10', { fonte: '', url: '' }), sinal('c', 'captacao', '2026-05-01')];
  const b = montarBriefing(conta(), s, { dataCarga: CARGA, hoje: CARGA });
  assert.deepEqual(b.fatos.map(f => f.texto), ['Fato a.']);
  for (const secao of [b.empresa, b.fatos, b.momento, b.pessoas]) for (const l of secao) assert.ok(l.fontes.length > 0, l.texto);
  const nums = new Set(b.fontes.map(f => f.n));
  for (const secao of [b.empresa, b.fatos, b.momento, b.pessoas]) for (const l of secao) for (const n of l.fontes) assert.ok(nums.has(n));
  assert.equal(b.fontes.find(f => f.url === 'https://exemplo.org/a').rotulo, 'Valor Econômico');
});

test('a mesma URL vira uma fonte só; veículos que confirmam o fato entram todos', () => {
  const s = [
    sinal('a', 'lancamento_produto', '2026-11-20', { fontes: [{ fonte: 'Valor', url: 'https://v/1', data: '2026-11-20' }, { fonte: 'Exame', url: 'https://e/1', data: '2026-11-21' }] }),
    sinal('b', 'nova_parceria', '2026-11-18', { url: 'https://v/1', fonte: 'Valor' }),
  ];
  const b = montarBriefing(conta(), s, { dataCarga: CARGA, hoje: CARGA });
  assert.deepEqual(b.fatos[0].fontes.length, 2);
  assert.equal(b.fontes.filter(f => f.url === 'https://v/1').length, 1);
});

test('sem contato pessoal; bloqueado vai para o fim com o motivo; papéis faltando listados', () => {
  const b = montarBriefing(conta(), [], { dataCarga: CARGA, hoje: CARGA });
  const texto = briefingEmTexto(b);
  assert.ok(!texto.includes('@') && !texto.includes('linkedin.com'));
  assert.equal(b.pessoas.at(-1).texto, 'Rui Paz, CEO');
  assert.match(b.pessoas.at(-1).detalhe, /bloqueado/);
  assert.ok(Array.isArray(b.faltando));
});

test('nada inventado: campo ausente não gera linha; ação da matriz não é atribuída ao motor', () => {
  const b = montarBriefing(conta({ cidade: '', uf: '', segmento: '', tier: '', acaoRecomendada: 'Monitorar', acaoDaMatriz: true }), [], { dataCarga: CARGA, hoje: CARGA });
  assert.equal(b.empresa.length, 0);
  assert.ok(b.momento.some(l => l.texto.startsWith('Ação pela matriz')));
  assert.ok(!b.momento.some(l => l.texto.includes('pelo motor')));
  assert.equal(b.roteiro.base, null);
});

test('roteiro vem do playbook quando ativo e é marcado como recomendação', () => {
  const s = [sinal('l', 'lancamento_produto', '2026-11-10'), sinal('v', 'vaga_area_alvo', '2026-11-20')];
  const pb = detectarPlaybook(s, CARGA);
  const b = montarBriefing(conta(), s, { dataCarga: CARGA, hoje: CARGA, playbook: pb });
  assert.equal(b.roteiro.base, 'playbook');
  assert.equal(b.roteiro.playbook, 'Lançamento com tração');
  assert.ok(b.roteiro.ofertas.includes('GTM'));
  assert.match(briefingEmTexto(b), /ROTEIRO \(recomendação do Radar, não é fato\)/);
  // sem playbook, a oportunidade do sinal mais forte
  const so = montarBriefing(conta(), [sinal('x', 'executivo_chegou', '2026-11-20')], { dataCarga: CARGA, hoje: CARGA });
  assert.equal(so.roteiro.base, 'sinal');
});

test('sem link, dois fatos do mesmo veículo no mesmo dia têm fontes distintas', () => {
  const s = [sinal('a', 'lancamento_produto', '2026-11-20', { url: '' }), sinal('b', 'nova_parceria', '2026-11-20', { url: '' })];
  const b = montarBriefing(conta(), s, { dataCarga: CARGA, hoje: CARGA });
  assert.equal(b.fatos.length, 2);
  assert.notDeepEqual(b.fatos[0].fontes, b.fatos[1].fontes);
});
