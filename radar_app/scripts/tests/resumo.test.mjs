// Testes de lib/resumo.ts e lib/email.ts (resumo diário, P2-12). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumoDiario } from '../../lib/resumo.ts';
import { destinatarios, enviarEmail, faltando } from '../../lib/email.ts';

const conta = (id, score, extra = {}) => ({ id, nome: `Empresa ${id.toUpperCase()}`, score, vscsStatus: 'Atenção', acaoRecomendada: 'Monitorar', comite: [{ nome: 'Pessoa Secreta', email: 'secreta@x.com' }], ...extra });
const sinal = (id, contaId, data, extra = {}) => ({ id, contaId, data, alertaEm: data, tipo: 'captacao', rotulo: 'Captação', porQueAgora: `fato ${id}`, fonte: 'Valor', url: `https://valor.example/${id}`, pontos: 20, exemplo: false, abordar: { nome: 'Pessoa Secreta' }, ...extra });
const base = (extra = {}) => ({
  geradoEm: '2026-11-26',
  atualizadoEm: '2026-11-26T00:41:00-03:00',
  contas: [conta('a', 80), conta('b', 60), conta('c', 30, { qualificada: { status: 'sim', desde: '2026-11-26', motivo: 'regra CQ-1' } })],
  sinais: [
    sinal('s1', 'a', '2026-11-25', { pontos: 30 }),
    sinal('s2', 'a', '2026-11-26', { pontos: 10 }),
    sinal('s3', 'b', '2026-11-20'), // velho: não entra
    sinal('s4', 'c', '2026-11-26', { tipo: 'noticia_setorial' }), // setorial: não entra
    sinal('s5', 'b', '2026-11-26', { exemplo: true }), // exemplo: nunca entra
  ],
  ...extra,
});
const agora = new Date('2026-11-26T10:00:00Z');

test('o que mudou desde a véspera: o fato mais forte de cada conta, com fonte e próxima ação', () => {
  const r = resumoDiario(base(), { agora, appUrl: 'https://radar.example/' });
  assert.equal(r.atrasada, false);
  assert.deepEqual(r.mudaram.map(m => [m.contaId, m.fato, m.mais]), [['a', 'fato s1', 1]]);
  assert.equal(r.assunto, 'Radar Velora · 26/11: 1 conta mudou');
  assert.deepEqual(r.qualificadas.map(q => q.contaId), ['c']);
  assert.equal(r.semAcao, null); // sem registro compartilhado, não acusa falta de trabalho
  assert.match(r.html, /href="https:\/\/radar\.example\/contas\/a"/);
  assert.match(r.texto, /Abrir o Radar: https:\/\/radar\.example\//);
});

test('nenhum nome ou e-mail de pessoa sai no resumo', () => {
  const r = resumoDiario(base(), { agora });
  assert.doesNotMatch(r.html + r.texto, /Pessoa Secreta|secreta@/);
});

test('base atrasada: o assunto e o topo dizem isso antes de qualquer fato', () => {
  const r = resumoDiario(base(), { agora: new Date('2026-11-28T10:00:00Z') });
  assert.equal(r.atrasada, true);
  assert.match(r.assunto, /ainda não foi atualizada/);
  assert.match(r.texto.split('\n')[2], /^Atenção: a base é de 26\/11/);
});

test('HTML escapado e link de fonte só http(s)', () => {
  const b = base();
  b.contas[0].nome = '<script>x</script>';
  b.sinais[0].url = 'javascript:alert(1)';
  const r = resumoDiario(b, { agora });
  assert.doesNotMatch(r.html, /<script>|javascript:/);
  assert.match(r.html, /&lt;script&gt;/);
});

test('com o registro compartilhado, lista as quentes sem ação', () => {
  const r = resumoDiario(base(), { agora, compartilhado: true, estados: { s1: { acao: 'abordado', em: '2026-11-26' } } });
  assert.deepEqual(r.semAcao.map(s => s.contaId), ['b', 'c']);
});

test('destinatários: só endereços válidos, sem repetir', () => {
  assert.deepEqual(destinatarios('a@velora.com.br, b@velora.com.br; a@velora.com.br quebrado'), { validos: ['a@velora.com.br', 'b@velora.com.br'], descartados: 2 });
  assert.deepEqual(destinatarios(undefined), { validos: [], descartados: 0 });
});

test('o que falta configurar, só pelo nome', () => {
  assert.deepEqual(faltando({ ligado: false, para: [], de: '', chave: '' }), ['RESUMO_DIARIO=1', 'RESUMO_PARA', 'RESUMO_DE', 'RESEND_API_KEY']);
  assert.deepEqual(faltando({ ligado: true, para: ['a@b.co'], de: 'Radar <r@b.co>', chave: 'k' }), []);
});

test('envio: uma chamada à API com destinatários, assunto e as duas versões', async () => {
  let pedido;
  const fetchFalso = async (url, init) => ((pedido = { url, init }), new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
  const r = await enviarEmail({ ligado: true, para: ['a@b.co'], de: 'Radar <r@b.co>', chave: 'k' }, { assunto: 'A', html: '<p>h</p>', texto: 't' }, fetchFalso);
  assert.deepEqual(r, { ok: true, id: 'm1' });
  assert.equal(pedido.url, 'https://api.resend.com/emails');
  assert.equal(pedido.init.headers.Authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(pedido.init.body), { from: 'Radar <r@b.co>', to: ['a@b.co'], subject: 'A', html: '<p>h</p>', text: 't' });
  const falhou = await enviarEmail({ ligado: true, para: ['a@b.co'], de: 'x', chave: 'k' }, { assunto: 'A', html: '', texto: '' }, async () => new Response('', { status: 429 }));
  assert.deepEqual(falhou, { ok: false, status: 429 });
});
