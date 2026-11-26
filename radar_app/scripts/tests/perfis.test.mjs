// Testes de lib/perfil-contas.ts, lib/perfil-decisores.ts, lib/regioes.ts e lib/contas.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfilContas } from '../../lib/perfil-contas.ts';
import { perfilDecisores } from '../../lib/perfil-decisores.ts';
import { faixaCapital, faixaFuncionarios, porteDe, regiaoDe } from '../../lib/regioes.ts';
import { familia, sentido, status } from '../../lib/contas.ts';

const pessoa = (area, papel, cargo) => ({ nome: cargo, cargo, area, papel, fonte: 'x' });
const conta = (id, extra = {}) => ({
  id, nome: id, razaoSocial: '', cnpj: '1', porte: 'DEMAIS', dominio: '', cidade: '', segmento: 'Cooperativa de crédito', braco: '', uf: 'SC',
  tier: 'A', statusComercial: 'ATIVAR', tendencia: 0, score: 50, serie: [], comite: [], ...extra,
});
const base = {
  geradoEm: '2026-11-25', atualizadoEm: '2026-11-25T00:41:00-03:00',
  contas: [
    conta('a', { score: 80, vscsStatus: 'Alta prioridade', acaoRecomendada: 'ABM personalizado', comite: [pessoa('executivo', 'decisor', 'CEO'), pessoa('comercial', 'decisor', 'CRO'), pessoa('marketing', 'influenciador', 'Gerente de Marketing')] }),
    conta('b', { score: 45, vscsStatus: 'Atenção', acaoRecomendada: 'Ampliar pesquisa', uf: 'SP', tier: 'B', comite: [pessoa('comercial', 'decisor', 'Diretor Comercial')] }),
    conta('c', { score: 10, vscsStatus: 'Monitoramento', uf: '', tier: 'C', cnpj: '' }),
  ],
  sinais: [{ id: 's1', contaId: 'a', data: '2026-11-20', tipo: 'captacao' }],
};

test('perfil de contas: números do topo saem da base, sem estimativa', () => {
  const p = perfilContas(base);
  assert.equal(p.contas, 3);
  assert.equal(p.tierA, 1);
  assert.equal(p.comSinal30, 1);
  assert.equal(p.atencaoOuMais, 2);
  assert.equal(p.paraAbordar, 1); // só "ABM personalizado" pede abordagem
  assert.equal(p.semUf, 1);
});

test('perfil de decisores: comitê completo só quando os três lugares têm alguém', () => {
  const p = perfilDecisores(base);
  assert.equal(p.comiteCompleto, 1); // a: CEO, CRO e gerente de marketing
  const papeis = Object.fromEntries(p.papeis.map(b => [b.id, b.valor]));
  assert.deepEqual(papeis, { assina_cheque: 1, decisor: 2, dono_da_dor: 1 });
});

test('regiões, porte e faixas', () => {
  assert.equal(regiaoDe('sc'), 'Sul');
  assert.equal(regiaoDe(''), 'Sem UF');
  assert.equal(regiaoDe('XX'), 'Sem UF');
  assert.equal(porteDe({ porte: 'MICRO EMPRESA', cnpj: '1' }), 'Micro');
  assert.equal(porteDe({ porte: 'EMPRESA DE PEQUENO PORTE', cnpj: '1' }), 'Pequena');
  assert.equal(porteDe({ porte: 'DEMAIS', cnpj: '' }), 'Sem CNPJ');
  assert.equal(faixaCapital(100_000), 'Até R$ 100 mil');
  assert.equal(faixaCapital(100_001), 'R$ 100 mil–1 mi');
  assert.equal(faixaCapital(0), null);
  assert.equal(faixaFuncionarios(1000), '501–1.000');
  assert.equal(faixaFuncionarios(1001), '1.000+');
  assert.equal(faixaFuncionarios(undefined), null);
});

test('família, status comercial e tendência', () => {
  assert.equal(familia({ segmento: 'Central de cooperativas', braco: '' }), 'cooperativa');
  assert.equal(familia({ segmento: 'Fintech de crédito', braco: '' }), 'tecnologia'); // tecnologia vem antes de banco
  assert.equal(familia({ segmento: 'Varejo', braco: '' }), 'outro');
  assert.equal(status({ statusComercial: 'NUTRIR / VALIDAR BLOQUEIO' }), 'nutrir');
  assert.equal(status({ statusComercial: '' }), 'nao_abordar');
  assert.deepEqual([sentido(3), sentido(2), sentido(-3)], ['sobe', 'estavel', 'desce']);
});
