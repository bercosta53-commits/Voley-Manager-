import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  toCsv,
  parseDate,
  weekStart,
  isValidCnpj,
  resolveProfile,
  importAccounts,
  importSignals,
  addSignal,
  evaluateAccount,
  buildQueue,
  metrics,
  calibrate,
  lintApproach,
  mapAccountColumns,
  staleCadence
} from './core.mjs';
import velora from './profiles/velora.mjs';
import modelo from './profiles/modelo.mjs';

const TODAY = '2026-09-24';
const profile = resolveProfile(velora);
const CNPJ_A = '11222333000181';
const CNPJ_A_FILIAL = '11222333000262';

function account(over = {}) {
  return { id: over.id || 'x', nome: 'Empresa X', abc: 'B', braco: 'prof', uf: 'SP', decisor: 'Ana Souza', ...over };
}
const sig = (accountId, type, date, extra = {}) => ({
  id: `${accountId}-${type}-${date}`,
  accountId,
  type,
  date,
  ...extra
});

test('catálogo tem 44 tipos em 7 famílias e 15 no MVP', () => {
  assert.equal(velora.signals.length, 44);
  assert.equal(new Set(velora.signals.map(s => s.family)).size, 7);
  assert.equal(velora.signals.filter(s => s.mvp).length, 15);
  assert.equal(new Set(velora.signals.map(s => s.id)).size, 44);
  for (const s of velora.signals) assert.ok(s.strength === 'N' || s.hook, `${s.id} sem gancho`);
});

test('perfil-modelo reaproveita o catálogo sem alterar a Velora', () => {
  assert.equal(modelo.signals.length, 44);
  assert.equal(velora.signals.find(s => s.id === 'ranking_setorial').strength, 'M');
  assert.equal(modelo.signals.find(s => s.id === 'ranking_setorial').strength, 'F');
});

test('parseCsv lida com ponto e vírgula, aspas, BOM e cabeçalho acentuado', () => {
  const rows = parseCsv('﻿Nome;Razão Social;Observações\r\n"Silva; Souza";X;"diz ""oi"""\r\n\r\n');
  assert.deepEqual(rows, [{ nome: 'Silva; Souza', razao_social: 'X', observacoes: 'diz "oi"' }]);
  const round = parseCsv(toCsv(rows, [{ key: 'nome', label: 'Nome' }]));
  assert.deepEqual(round, [{ nome: 'Silva; Souza' }]);
});

test('datas e semana', () => {
  assert.equal(parseDate('05/09/2026'), '2026-09-05');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(weekStart('2026-09-24'), '2026-09-21');
  assert.equal(weekStart('2026-09-21'), '2026-09-21');
  assert.equal(weekStart('2026-09-27'), '2026-09-21');
});

test('valida CNPJ', () => {
  assert.ok(isValidCnpj('11.222.333/0001-81'));
  assert.ok(!isValidCnpj('11.222.333/0001-82'));
  assert.ok(!isValidCnpj('11111111111111'));
});

test('importação deduplica por raiz de CNPJ, domínio e nome e aponta fora do ICP', () => {
  const rows = parseCsv(
    [
      'empresa;cnpj;site;uf;setor;braço;abc;decisor',
      `Alfa Advogados;${CNPJ_A};https://www.alfa.com.br/;SP;Advocacia;Serviços profissionais;A;`,
      `Alfa Filial;${CNPJ_A_FILIAL};;PR;;;;Carla Dias`,
      'Beta Ltda;;beta.com;RS;Tecnologia;tech;B;',
      'Beta;;;;;;;Bruno',
      'Clínica Gama;;;SP;Saúde;;C;',
      'Delta;;;BA;Tecnologia;tech;B;',
      ';;;SP;;;;'
    ].join('\n')
  );
  const { accounts, report } = importAccounts([], rows, profile, TODAY);
  assert.equal(accounts.length, 4);
  assert.equal(report.added, 4);
  assert.equal(report.merged, 2);
  const alfa = accounts.find(a => a.cnpjRoot === '11222333');
  assert.equal(alfa.decisor, 'Carla Dias');
  assert.equal(alfa.abc, 'A', 'campo vazio não apaga o existente');
  assert.equal(alfa.braco, 'prof');
  assert.equal(accounts.find(a => a.nomeNorm === 'beta').decisor, 'Bruno');
  const gama = accounts.find(a => a.nome === 'Clínica Gama');
  assert.equal(evaluateAccount(gama, [], profile, TODAY).action, 'fora_icp');
  const delta = accounts.find(a => a.nome === 'Delta');
  assert.match(evaluateAccount(delta, [], profile, TODAY).icpIssues[0], /geografia/);
  assert.equal(report.skipped.length, 1);
});

test('headcount da planilha vira sinal', () => {
  const rows = parseCsv('empresa;headcount;headcount_6m\nCresce;120;100\nEncolhe;80;100\nEstável;105;100');
  const { report } = importAccounts([], rows, profile, TODAY);
  assert.deepEqual(
    report.derivedSignals.map(s => s.type),
    ['headcount_crescendo', 'queda_headcount']
  );
});

test('importação de sinais casa conta, tipo por rótulo e ignora duplicado', () => {
  const accounts = [account({ id: 'a', nome: 'Alfa', cnpjRoot: '11222333', nomeNorm: 'alfa' })];
  const rows = parseCsv(
    [
      'cnpj;empresa;tipo;data;fonte',
      `${CNPJ_A_FILIAL};;Novo CMO, head de marketing ou growth;20/09/2026;Apollo`,
      ';Alfa;novo_cmo;2026-09-20;Apollo',
      ';Omega;novo_cmo;2026-09-20;',
      ';Alfa;sinal inventado;;'
    ].join('\n')
  );
  const { signals, report } = importSignals(accounts, [], rows, profile, TODAY);
  assert.equal(signals.length, 1);
  assert.equal(report.duplicates, 1);
  assert.equal(report.skipped.length, 2);
  assert.equal(addSignal(signals, { ...signals[0], id: undefined }).added, false);
});

test('matriz ABC × sinal', () => {
  const cases = [
    ['A', ['novo_cmo'], 'semana_personalizada'],
    ['A', ['site_novo'], 'duas_semanas'],
    ['A', [], 'aquecimento'],
    ['B', ['vaga_sdr'], 'semana'],
    ['B', ['site_novo'], 'fila_normal'],
    ['B', [], 'monitorar'],
    ['C', ['vaga_sdr'], 'fila_normal'],
    ['C', ['site_novo'], 'monitorar'],
    ['C', [], 'fora']
  ];
  for (const [abc, types, expected] of cases) {
    const a = account({ abc });
    const p = resolveProfile(velora, { signals: { site_novo: { enabled: true } } });
    const ev = evaluateAccount(
      a,
      types.map(t => sig('x', t, '2026-09-20')),
      p,
      TODAY
    );
    assert.equal(ev.action, expected, `${abc} + ${types}`);
  }
});

test('sinal forte promove C a B, nunca a A', () => {
  const ev = evaluateAccount(account({ abc: 'C' }), [sig('x', 'novo_cmo', '2026-09-20')], profile, TODAY);
  assert.equal(ev.effectiveAbc, 'B');
  assert.ok(ev.promoted);
  const b = evaluateAccount(account({ abc: 'B' }), [sig('x', 'novo_cmo', '2026-09-20')], profile, TODAY);
  assert.equal(b.effectiveAbc, 'B');
});

test('sinal vale 30 dias e depois a conta volta à célula de origem', () => {
  const signals = [sig('x', 'novo_cmo', '2026-08-25')];
  assert.equal(evaluateAccount(account(), signals, profile, '2026-09-24').tier, 'forte');
  assert.equal(evaluateAccount(account(), signals, profile, '2026-09-25').tier, 'nenhum');
  assert.equal(evaluateAccount(account(), [sig('x', 'novo_cmo', '2026-09-30')], profile, TODAY).tier, 'nenhum');
});

test('sinais combinados em 30 dias somam e ganham bônus', () => {
  const p = resolveProfile(velora, { signals: { site_novo: { enabled: true }, nova_landing: { enabled: true } } });
  const one = evaluateAccount(account(), [sig('x', 'site_novo', '2026-09-20')], p, TODAY);
  const two = evaluateAccount(
    account(),
    [sig('x', 'site_novo', '2026-09-20'), sig('x', 'nova_landing', '2026-09-10')],
    p,
    TODAY
  );
  assert.equal(one.tier, 'medio');
  assert.equal(two.tier, 'forte');
  assert.equal(two.score, 3.75);
  const cmoMaisVaga = evaluateAccount(
    account(),
    [sig('x', 'novo_cmo', '2026-09-01'), sig('x', 'vaga_marketing', '2026-09-15')],
    profile,
    TODAY
  );
  assert.ok(cmoMaisVaga.score > 6);
  const repetido = evaluateAccount(
    account(),
    [sig('x', 'vaga_sdr', '2026-09-01'), sig('x', 'vaga_sdr', '2026-09-15')],
    profile,
    TODAY
  );
  assert.equal(repetido.score, 3, 'mesmo tipo repetido conta uma vez');
});

test('sinal fora do braço do ICP perde força', () => {
  const tech = evaluateAccount(account({ braco: 'tech' }), [sig('x', 'novos_socios', '2026-09-20')], profile, TODAY);
  const prof = evaluateAccount(account({ braco: 'prof' }), [sig('x', 'novos_socios', '2026-09-20')], profile, TODAY);
  assert.equal(prof.tier, 'forte');
  assert.equal(tech.tier, 'medio');
});

test('sinal negativo tira a conta da fila pelo seu próprio prazo', () => {
  const signals = [sig('x', 'novo_cmo', '2026-09-20'), sig('x', 'recuperacao_judicial', '2026-01-10')];
  assert.equal(evaluateAccount(account({ abc: 'A' }), signals, profile, TODAY).action, 'bloqueada');
  assert.equal(evaluateAccount(account({ abc: 'A' }), signals, profile, '2027-01-15').action, 'aquecimento');
});

test('tipos desligados no perfil não contam', () => {
  const ev = evaluateAccount(account(), [sig('x', 'site_novo', '2026-09-20')], profile, TODAY);
  assert.equal(ev.tier, 'nenhum');
});

test('fila semanal respeita capacidade, ordem da matriz e cadência aberta', () => {
  const accounts = [
    account({ id: 'c1', nome: 'C forte', abc: 'C' }),
    account({ id: 'a1', nome: 'A forte', abc: 'A' }),
    account({ id: 'b1', nome: 'B forte', abc: 'B' }),
    account({ id: 'b2', nome: 'B forte em cadência', abc: 'B' }),
    account({ id: 'a2', nome: 'A sem sinal', abc: 'A' }),
    account({ id: 'b3', nome: 'B sem resposta recente', abc: 'B' })
  ];
  const signals = ['c1', 'a1', 'b1', 'b2', 'b3'].map(id =>
    sig(id, 'vaga_sdr', '2026-09-20', { detail: 'Vaga de SDR em Curitiba' })
  );
  const cadence = [
    { accountId: 'b2', status: 'aceito', iniciadaEm: '2026-09-01', atualizadaEm: '2026-09-05' },
    { accountId: 'b3', status: 'sem_resposta', iniciadaEm: '2026-08-01', atualizadaEm: '2026-09-01' }
  ];
  const p = resolveProfile(velora, { capacity: { weeklyContacts: 2 } });
  const q = buildQueue({ accounts, signals, cadence, profile: p, today: TODAY });
  assert.equal(q.weekStart, '2026-09-21');
  assert.deepEqual(
    q.items.map(e => e.account.id),
    ['a1', 'b1']
  );
  assert.deepEqual(
    q.overflow.map(e => e.account.id),
    ['c1']
  );
  assert.deepEqual(q.held.map(e => e.account.id).sort(), ['b2', 'b3']);
  assert.deepEqual(
    q.warming.map(e => e.account.id),
    ['a2']
  );
  const hook = q.items[0].hook;
  assert.match(hook.text, /^Olá, Ana, vi que a A forte está montando time de pré-vendas\. Vaga de SDR em Curitiba\./);
  assert.equal(hook.decisor.nome, 'Ana Souza');
  assert.deepEqual(hook.warnings, []);
});

test('gancho sem decisor começa com maiúscula e sugere cargo', () => {
  const q = buildQueue({
    accounts: [account({ decisor: '' })],
    signals: [sig('x', 'rodada_investimento', '2026-09-20')],
    profile,
    today: TODAY
  });
  assert.match(q.items[0].hook.text, /^Parabéns pela rodada/);
  assert.equal(q.items[0].hook.decisor.cargo, 'CEO / CRO');
});

test('regras de tom apontam termos vetados e excesso de caracteres', () => {
  const p = resolveProfile(modelo);
  const warnings = lintApproach('Garantimos resultado, sem desconto. ' + 'x'.repeat(300), p);
  assert.equal(warnings.length, 3);
});

test('métricas comparam com e sem sinal e ignoram convites pendentes', () => {
  const accounts = [account({ id: 'a' }), account({ id: 'b', decisor: '' })];
  const cadence = [
    {
      accountId: 'a',
      tiposSinal: ['novo_cmo'],
      status: 'reuniao',
      iniciadaEm: '2026-09-01',
      atualizadaEm: '2026-09-10'
    },
    {
      accountId: 'a',
      tiposSinal: ['vaga_sdr'],
      status: 'sem_resposta',
      iniciadaEm: '2026-09-01',
      atualizadaEm: '2026-09-10'
    },
    { accountId: 'b', tiposSinal: [], status: 'aceito', iniciadaEm: '2026-09-01', atualizadaEm: '2026-09-10' },
    { accountId: 'b', tiposSinal: [], status: 'convite_enviado', iniciadaEm: '2026-09-01', atualizadaEm: '2026-09-10' }
  ];
  const m = metrics({ accounts, signals: [], cadence, profile, today: TODAY });
  assert.equal(m.ready, 1);
  assert.equal(m.comSinal.taxaResposta, 0.5);
  assert.equal(m.semSinal.enviados, 2);
  assert.equal(m.semSinal.taxaAceite, 1);
  assert.deepEqual(m.meetingsByMonth, { '2026-09': 1 });
});

test('calibragem só sugere com amostra mínima e limita a mudança', () => {
  const cadence = [];
  for (let i = 0; i < 6; i++) cadence.push({ tiposSinal: ['novo_cmo'], status: 'respondeu' });
  for (let i = 0; i < 6; i++) cadence.push({ tiposSinal: [], status: 'sem_resposta' });
  cadence.push({ tiposSinal: ['vaga_sdr'], status: 'respondeu' });
  const byId = Object.fromEntries(calibrate({ cadence, profile }).map(r => [r.def.id, r]));
  assert.equal(byId.novo_cmo.enough, true);
  assert.equal(byId.novo_cmo.suggestedWeight, 4.5);
  assert.equal(byId.vaga_sdr.enough, false);
  const p = resolveProfile(velora, { signals: { novo_cmo: { weight: 4.5 } } });
  assert.equal(evaluateAccount(account(), [sig('x', 'novo_cmo', '2026-09-20')], p, TODAY).score, 4.5);
});

test('colagem do Excel (tabulação) e mapa de colunas', () => {
  const rows = parseCsv('Empresa\tCNPJ\tCor favorita\nAlfa; Filial\t11222333000181\tazul');
  assert.deepEqual(rows, [{ empresa: 'Alfa; Filial', cnpj: '11222333000181', cor_favorita: 'azul' }]);
  assert.deepEqual(
    mapAccountColumns(Object.keys(rows[0])).map(c => c.field),
    ['nome', 'cnpj', null]
  );
});

test('conta adiada sai da fila até a data e depois volta', () => {
  const accounts = [account({ id: 'a1', abc: 'A' })];
  const signals = [sig('a1', 'novo_cmo', '2026-09-20')];
  const snoozed = { a1: '2026-09-28' };
  const q = buildQueue({ accounts, signals, snoozed, profile, today: TODAY });
  assert.equal(q.items.length, 0);
  assert.equal(q.held[0].block, 'Adiada até 28/09/2026');
  assert.equal(q.held[0].snoozedUntil, '2026-09-28');
  assert.equal(buildQueue({ accounts, signals, snoozed, profile, today: '2026-09-28' }).items.length, 1);
});

test('convites parados são apontados', () => {
  const cadence = [
    { accountId: 'a', status: 'convite_enviado', iniciadaEm: '2026-09-01', atualizadaEm: '2026-09-01' },
    { accountId: 'b', status: 'convite_enviado', iniciadaEm: '2026-09-20', atualizadaEm: '2026-09-20' },
    { accountId: 'c', status: 'reuniao', iniciadaEm: '2026-08-01', atualizadaEm: '2026-08-01' }
  ];
  assert.deepEqual(
    staleCadence(cadence, TODAY, 14).map(c => c.accountId),
    ['a']
  );
});
