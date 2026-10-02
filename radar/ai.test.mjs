import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfile, evaluateAccount, importAccounts } from './core.mjs';
import {
  icpFromProfile,
  buildIcpPrompt,
  sanitizeIcp,
  applyIcpDraft,
  buildClassifyPrompt,
  sanitizeClassification,
  buildSignalExtractPrompt,
  sanitizeExtractedSignals,
  buildHooksPrompt,
  sanitizeHooks
} from './ai.mjs';
import velora from './profiles/velora.mjs';

const TODAY = '2026-09-24';
const profile = resolveProfile(velora);

const rawIcp = {
  resumo: 'Escritórios e cooperativas do Sul.',
  bracos: [
    {
      id: 'Escritórios de Advocacia',
      nome: 'Escritórios de advocacia',
      setores: ['Advocacia', 'Jurídico'],
      porte: '50 a 500 advogados',
      decisores: ['Sócio-diretor'],
      sinaisChave: ['novos_socios', 'ranking_setorial', 'inventado', 'novo_cmo']
    },
    { id: 'coop', nome: 'Cooperativas de crédito', sinaisChave: ['incorporacao_cooperativas', 'novo_cmo'] },
    { nome: '' },
    { id: 'x' },
    { id: 'y' }
  ],
  regioes: ['sp', 'RS', 'XX', 'RS'],
  exclusoes: ['Saúde'],
  abc: { A: 'Mais de 100 advogados', B: 'De 30 a 100' },
  tom: 'Consultivo e sóbrio',
  termosEvitar: [{ termo: 'garantimos', motivo: 'OAB' }, { termo: 'desconto' }]
};

test('ICP atual vira desenho no formato da IA', () => {
  const d = icpFromProfile(profile);
  assert.deepEqual(
    d.bracos.map(b => b.id),
    ['prof', 'fin', 'tech']
  );
  assert.ok(d.bracos[0].sinaisChave.includes('novos_socios'));
  assert.deepEqual(d.regioes, ['SP', 'PR', 'SC', 'RS']);
});

test('pedido de ICP traz descrição, catálogo e, no ajuste, o ICP atual', () => {
  const first = buildIcpPrompt({ description: 'Vendemos consultoria', profile });
  assert.match(first, /Vendemos consultoria/);
  assert.match(first, /novo_cmo: Novo CMO/);
  assert.doesNotMatch(first, /demissoes_congelamento/, 'sinal negativo fora do catálogo do ICP');
  const adjust = buildIcpPrompt({
    description: 'x',
    current: { bracos: [] },
    instruction: 'tire o braço tech',
    profile
  });
  assert.match(adjust, /Pedido de ajuste/);
  assert.match(adjust, /tire o braço tech/);
});

test('ICP da IA é limpo: ids, sinais do catálogo, UFs e limites', () => {
  const d = sanitizeIcp(rawIcp, profile);
  assert.deepEqual(
    d.bracos.map(b => b.id),
    ['escritorios-de-advocacia', 'coop', 'x', 'y']
  );
  assert.deepEqual(d.bracos[0].sinaisChave, ['novos_socios', 'ranking_setorial', 'novo_cmo']);
  assert.deepEqual(d.regioes, ['SP', 'RS']);
  assert.equal(d.abc.C, profile.abcCriteria.C, 'critério ausente mantém o do perfil');
  assert.throws(() => sanitizeIcp({ bracos: [] }, profile), /nenhum braço/);
  assert.throws(() => sanitizeIcp('texto', profile), /formato/);
});

test('aplicar o ICP muda braços, pesos por braço, critérios e tom sem alterar o perfil-base', () => {
  const draft = sanitizeIcp(rawIcp, profile);
  const overrides = applyIcpDraft({}, draft, profile);
  const p = resolveProfile(velora, overrides);
  assert.deepEqual(Object.keys(p.icp.arms), ['escritorios-de-advocacia', 'coop', 'x', 'y']);
  assert.equal(p.signalById.novos_socios.arm, 'escritorios-de-advocacia');
  assert.equal(p.signalById.novo_cmo.arm, null, 'sinal-chave de dois braços vale para todos');
  assert.equal(p.signalById.ranking_setorial.enabled, true, 'sinal-chave é ligado');
  assert.equal(p.signalById.site_novo.enabled, false, 'os demais ficam como estavam');
  assert.equal(p.abcCriteria.A, 'Mais de 100 advogados');
  assert.equal(p.approach.tone, 'Consultivo e sóbrio');
  assert.equal(p.approach.forbidden.filter(f => f.term === 'garantimos').length, 1);
  assert.deepEqual(p.icpDesign, draft);
  assert.equal(velora.icp.arms.prof.label, 'Serviços profissionais B2B');
  // Planilha que usa o nome do braço novo é reconhecida.
  const { accounts } = importAccounts([], [{ nome: 'Alfa', braco: 'Escritórios de advocacia', uf: 'RS' }], p, TODAY);
  assert.equal(accounts[0].braco, 'escritorios-de-advocacia');
  assert.equal(evaluateAccount({ ...accounts[0], uf: 'PR' }, [], p, TODAY).action, 'fora_icp');
});

test('classificação: pedido com ICP e resposta filtrada', () => {
  const accounts = [
    { id: 'a1', nome: 'Alfa', setor: 'Advocacia' },
    { id: 'a2', nome: 'Beta' }
  ];
  const prompt = buildClassifyPrompt(accounts, profile);
  assert.match(prompt, /prof: Serviços profissionais/);
  assert.match(prompt, /"id":"a1"/);
  const out = sanitizeClassification(
    [
      { id: 'a1', abc: 'a', braco: 'prof', cargo: 'Sócio', confianca: 'Média', motivo: 'ok' },
      { id: 'a1', abc: 'B' },
      { id: 'zz', abc: 'A' },
      { id: 'a2', abc: 'D', braco: 'saude' }
    ],
    accounts,
    profile
  );
  assert.deepEqual(out, [
    { id: 'a1', abc: 'A', braco: 'prof', cargo: 'Sócio', decisor: '', confianca: 'media', motivo: 'ok' },
    { id: 'a2', abc: '', braco: '', cargo: '', decisor: '', confianca: 'baixa', motivo: '' }
  ]);
});

test('sinais extraídos de texto só valem para contas e tipos conhecidos', () => {
  const accounts = [{ id: 'a1', nome: 'Alfa Advogados' }];
  const prompt = buildSignalExtractPrompt({ source: 'Alfa contratou CMO', accounts, profile, today: TODAY });
  assert.match(prompt, /Alfa Advogados/);
  assert.match(prompt, /Alfa contratou CMO/);
  const out = sanitizeExtractedSignals(
    [
      { conta: 'alfa advogados', tipo: 'novo_cmo', data: '2026-09-20', detalhe: 'Maria assume', trecho: 'x' },
      { conta: 'Alfa Advogados', tipo: 'novo_cmo', data: '2027-01-01' },
      { conta: 'Alfa Advogados', tipo: 'site_novo' },
      { conta: 'Omega', tipo: 'novo_cmo' },
      { conta: 'Alfa Advogados', tipo: 'vaga_sdr', data: 'ontem' }
    ],
    accounts,
    profile,
    TODAY
  );
  assert.deepEqual(
    out.map(s => [s.type, s.date, s.source]),
    [
      ['novo_cmo', '2026-09-20', 'Pesquisa com IA'],
      ['vaga_sdr', TODAY, 'Pesquisa com IA']
    ]
  );
});

test('abordagens: regras de tom no pedido e ids conferidos na resposta', () => {
  const p = resolveProfile(velora, { approach: { tone: 'Sóbrio' } });
  const prompt = buildHooksPrompt([{ id: 'a1', empresa: 'Alfa' }], p);
  assert.match(prompt, /No máximo 300 caracteres/);
  assert.match(prompt, /Tom: Sóbrio/);
  assert.match(prompt, /garantimos/);
  assert.deepEqual(sanitizeHooks([{ id: 'a1', texto: ' Olá ' }, { id: 'b', texto: 'x' }, { id: 'a1' }], ['a1']), [
    { id: 'a1', texto: 'Olá' }
  ]);
});
