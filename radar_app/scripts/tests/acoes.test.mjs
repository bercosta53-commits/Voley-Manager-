// Testes de lib/acoes.ts (registro de ações radar_acoes). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dobrar, emailDoAccess, linhasDaMudanca, validarEstado } from '../../lib/acoes.ts';

let seq = 0;
const linha = (tipo, extra = {}) => ({
  id: ++seq, conta_id: 'c1', sinal_id: 's1', tipo, ate: null, relevancia: null, status: null, nota: null, desfaz_id: null,
  autor_email: 'ana@velora.com.br', criado_em: `2026-11-2${Math.min(9, seq)}T12:00:00Z`, ...extra,
});

test('lido em ordem: a última ação vale, e "reaberto" devolve o sinal à caixa', () => {
  seq = 0;
  const a = [linha('adiado', { ate: '2026-11-28' }), linha('abordado', { autor_email: 'bia@velora.com.br' })];
  assert.deepEqual(dobrar(a).estados.s1, { acao: 'abordado', em: '2026-11-22', por: 'bia@velora.com.br' });
  assert.equal(dobrar([...a, linha('reaberto')]).estados.s1, undefined);
});

test('grupos independentes: avaliação e relevância não apagam a ação', () => {
  seq = 0;
  const e = dobrar([linha('abordado'), linha('util'), linha('relevancia', { relevancia: 3 })]).estados.s1;
  assert.deepEqual([e.acao, e.avaliacao, e.relevancia], ['abordado', 'util', 3]);
});

test('desfazer limpa o grupo da linha vigente, sem ressuscitar a anterior', () => {
  seq = 0;
  const u = linha('util');
  const r = linha('ruido');
  const d = linha('ruido', { desfaz_id: r.id });
  assert.equal(dobrar([u, r, d]).estados.s1, undefined);
});

test('desfazer de uma linha que já não é a vigente não muda nada', () => {
  seq = 0;
  const u = linha('util');
  const r = linha('ruido');
  assert.equal(dobrar([u, r, linha('util', { desfaz_id: u.id })]).estados.s1.avaliacao, 'ruido');
});

test('status é por conta e guarda autor e data', () => {
  seq = 0;
  const st = dobrar([linha('status', { sinal_id: null, status: 'abordado' }), linha('status', { sinal_id: null, status: 'reuniao', autor_email: 'bia@velora.com.br' })]).status;
  assert.deepEqual(st.c1, { status: 'reuniao', por: 'bia@velora.com.br', em: '2026-11-22' });
});

test('mudança vira só as linhas necessárias, a partir do estado do banco', () => {
  seq = 0;
  const { vigentes } = dobrar([linha('abordado'), linha('util')]);
  const v = vigentes.s1;
  assert.deepEqual(linhasDaMudanca('s1', 'c1', v, { acao: 'abordado', avaliacao: 'util' }), []); // nada mudou
  const reabrir = linhasDaMudanca('s1', 'c1', v, { avaliacao: 'util' });
  assert.deepEqual(reabrir.map(l => l.tipo), ['reaberto']);
  const tirarUtil = linhasDaMudanca('s1', 'c1', v, { acao: 'abordado' });
  assert.deepEqual(tirarUtil.map(l => [l.tipo, l.desfaz_id]), [['util', 2]]);
  const adiar = linhasDaMudanca('s1', 'c1', v, { acao: 'adiado', ate: '2026-11-30', avaliacao: 'util' });
  assert.deepEqual(adiar.map(l => [l.tipo, l.ate]), [['adiado', '2026-11-30']]);
  assert.deepEqual(linhasDaMudanca('s1', 'c1', {}, { relevancia: 2 }).map(l => [l.tipo, l.relevancia]), [['relevancia', 2]]);
});

test('aplicar as linhas geradas leva ao estado pedido (ida e volta)', () => {
  seq = 0;
  const historico = [linha('arquivado'), linha('ruido'), linha('relevancia', { relevancia: 2 })];
  for (const para of [{}, { acao: 'abordado' }, { acao: 'adiado', ate: '2026-12-01', avaliacao: 'util', relevancia: 3 }, { avaliacao: 'ruido' }]) {
    const { vigentes } = dobrar(historico);
    const novas = linhasDaMudanca('s1', 'c1', vigentes.s1 ?? {}, para).map(l => linha(l.tipo, l));
    const { estados } = dobrar([...historico, ...novas]);
    const { em, por, ...sem } = estados.s1 ?? {};
    assert.deepEqual(sem, para);
  }
});

test('validação do que chega da tela', () => {
  assert.equal(validarEstado(null), null);
  assert.deepEqual(validarEstado({ acao: 'adiado', ate: '2026-11-30' }), { acao: 'adiado', ate: '2026-11-30' });
  assert.equal(validarEstado({ acao: 'apagar' }), 'invalido');
  assert.equal(validarEstado({ acao: 'adiado' }), 'invalido'); // adiado sem data
  assert.equal(validarEstado({ relevancia: 4 }), 'invalido');
  assert.equal(validarEstado({ ate: '30/11/2026' }), 'invalido');
  assert.equal(validarEstado('abordado'), 'invalido');
});

test('e-mail vem do JWT do Access (já verificado pelo Worker)', () => {
  const payload = Buffer.from(JSON.stringify({ email: 'ana@velora.com.br', sub: 'x' })).toString('base64url');
  assert.equal(emailDoAccess(`cabecalho.${payload}.assinatura`), 'ana@velora.com.br');
  assert.equal(emailDoAccess(null), null);
  assert.equal(emailDoAccess('lixo'), null);
});
