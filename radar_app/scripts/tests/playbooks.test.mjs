// Testes de lib/playbooks.ts (tela de Sinais, fase 3). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFERTAS, PLAYBOOKS, detectarPlaybook, familiaDe, mensagemPlaybook, oportunidadeDe, pessoasParaPlaybook, playbooksPorConta } from '../../lib/playbooks.ts';

const CARGA = '2026-11-26';
const sinal = (id, tipo, data, extra = {}) => ({ id, contaId: 'c', tipo, data, rotulo: tipo, pontos: 10, nivel: 'B', ...extra });

test('famílias cobrem os tipos dos coletores reais', () => {
  const casos = {
    lancamento_produto: 'lancamento', lancamento_ia: 'lancamento', vaga_area_alvo: 'contratacao', vaga_lideranca_alvo: 'contratacao',
    vaga_expansao_comercial: 'contratacao', expansao_comercial: 'contratacao', nova_parceria: 'parceria', parceria: 'parceria',
    nova_filial: 'unidade', expansao_mercado: 'unidade', troca_lideranca_ceo: 'lideranca', executivo_chegou: 'lideranca',
    fusao_aquisicao: 'societario', aquisicao_feita: 'societario', foi_adquirida: 'societario', captacao_seed: 'captacao',
    pedido_diagnostico: 'intencao', presenca_evento: 'evento', declaracao_expansao: 'crescimento',
  };
  for (const [tipo, f] of Object.entries(casos)) assert.equal(familiaDe(tipo), f, tipo);
  assert.equal(familiaDe('noticia_setorial'), null);
});

test('oportunidade do sinal isolado usa só entregáveis da Velora; negativo não tem', () => {
  const o = oportunidadeDe({ tipo: 'executivo_chegou' });
  assert.ok(o.texto.length > 20 && o.ofertas.length > 0);
  for (const pb of PLAYBOOKS) for (const of of pb.ofertas) assert.ok(OFERTAS[of], `${pb.id}: ${of}`);
  assert.equal(oportunidadeDe({ tipo: 'executivo_chegou', categoria: 'negativo' }), null);
});

test('A. Lançamento com tração: lançamento + vaga até 30 dias (exemplo Aurum: 17 dias)', () => {
  const at = detectarPlaybook([sinal('l', 'lancamento_ia', '2026-10-27'), sinal('v', 'vaga_area_alvo', '2026-11-13')], CARGA);
  assert.equal(at.playbook.id, 'lancamento_tracao');
  assert.deepEqual(at.evidencia.map(s => s.id), ['l', 'v']);
  assert.equal(at.ativadoEm, '2026-11-13');
  // janela de ação de 30 dias a partir de 13/11, mas o lançamento vence antes (45 dias de 27/10 = 11/12)
  assert.equal(at.expiraEm, '2026-12-11');
  assert.equal(at.diasRestantes, 15);
});

test('fora da janela de co-ocorrência não ativa; sinal vencido e negativo não contam', () => {
  assert.equal(detectarPlaybook([sinal('l', 'lancamento_produto', '2026-10-01'), sinal('v', 'vaga_area_alvo', '2026-11-20')], CARGA), null);
  assert.equal(detectarPlaybook([sinal('l', 'lancamento_produto', '2026-09-01'), sinal('v', 'vaga_area_alvo', '2026-09-10')], CARGA), null);
  assert.equal(
    detectarPlaybook([sinal('l', 'lancamento_produto', '2026-11-10'), sinal('v', 'vaga_area_alvo', '2026-11-20', { categoria: 'negativo' })], CARGA),
    null,
  );
  // um sinal só, mesmo de duas famílias possíveis, nunca combina consigo mesmo
  assert.equal(detectarPlaybook([sinal('l', 'lancamento_produto', '2026-11-20')], CARGA), null);
});

test('prioridade do catálogo: com lançamento + vaga + parceria vale A, não D', () => {
  const at = detectarPlaybook(
    [sinal('l', 'lancamento_produto', '2026-11-10'), sinal('p', 'nova_parceria', '2026-11-12'), sinal('v', 'vaga_area_alvo', '2026-11-20')],
    CARGA,
  );
  assert.equal(at.playbook.id, 'lancamento_tracao');
});

test('liderança nova montando time usa a janela longa de liderança (D7)', () => {
  const at = detectarPlaybook([sinal('e', 'executivo_chegou', '2026-09-01'), sinal('v', 'vaga_area_alvo', '2026-11-15')], CARGA);
  assert.equal(at.playbook.id, 'lideranca_montando_time');
});

test('F. Momento de mudança: 3 famílias em 60 dias sem par de A a E', () => {
  const at = detectarPlaybook(
    [sinal('c', 'captacao_a', '2026-11-01'), sinal('e', 'presenca_evento', '2026-11-10'), sinal('d', 'declaracao_expansao', '2026-11-20')],
    CARGA,
  );
  assert.equal(at.playbook.id, 'momento_mudanca');
  assert.equal(at.evidencia.length, 3);
  assert.equal(detectarPlaybook([sinal('c', 'captacao_a', '2026-11-01'), sinal('e', 'presenca_evento', '2026-11-10')], CARGA), null);
});

test('por conta, persona no comitê e mensagem sem vigilância', () => {
  const m = playbooksPorConta(
    [sinal('l', 'lancamento_produto', '2026-11-10'), sinal('v', 'vaga_area_alvo', '2026-11-20'), { ...sinal('x', 'lancamento_produto', '2026-11-10'), contaId: 'outra' }],
    CARGA,
  );
  assert.deepEqual([...m.keys()], ['c']);
  const pb = PLAYBOOKS[0];
  const grupos = pessoasParaPlaybook(pb, [{ nome: 'Ana', cargo: 'Head de Growth' }, { nome: 'Bia', cargo: 'Diretora Comercial' }, { nome: 'Caio', cargo: 'CTO' }]);
  assert.deepEqual(grupos.map(g => g.pessoas.map(p => p.nome)), [['Ana'], ['Bia']]);
  const txt = mensagemPlaybook(pb, { segmento: 'Lawtech' }, 'Helena Duarte');
  assert.ok(txt.startsWith('Oi, Helena.') && txt.includes('lawtech'));
  for (const p of PLAYBOOKS) assert.ok(!/vagas? que vocês abriram|vi que vocês abriram/i.test(p.mensagem), p.id);
});
