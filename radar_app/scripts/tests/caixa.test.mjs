// Testes de lib/caixa.ts (tela de Sinais, fase 1). Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEM_FILTROS_CAIXA, elegivelCaixa, podeAbordar, tituloSinal, ORDEM_PADRAO, contarOpcoes, dentroDaJanela, janelaDe, filtrarCaixa, forcaDe, ordenarCaixa, porEstagio, pontosInteiros, textoVariacao, variacao,
} from '../../lib/caixa.ts';

const conta = (id, extra = {}) => ({ id, score: 50, tier: 'B', uf: 'SC', segmento: 'Fintech', vscsStatus: 'Monitoramento', serie: [], tendencia: 0, ...extra });
const sinal = (id, contaId, data, extra = {}) => ({ id, contaId, data, tipo: 'lancamento_produto', rotulo: 'Lançamento de produto', pontos: 10, nivel: 'B', ...extra });
const CARGA = '2026-11-26';

test('1.1: a ordem segue o critério exibido; empate pela data mais recente', () => {
  const contas = new Map([['a', conta('a')], ['b', conta('b')]]);
  const l = [sinal('bridge', 'a', '2026-11-20', { pontos: 8.34 }), sinal('contraktor', 'b', '2026-11-10', { pontos: 21.94 }), sinal('x', 'a', '2026-11-25', { pontos: 8.34 })];
  const f = ordenarCaixa(l, 'forca', contas);
  assert.deepEqual(f.map(s => s.id), ['contraktor', 'x', 'bridge']);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].pontos <= f[i - 1].pontos);
  assert.deepEqual(ordenarCaixa(l, 'recente', contas).map(s => s.id), ['x', 'bridge', 'contraktor']);
  assert.deepEqual(l.map(s => s.id), ['bridge', 'contraktor', 'x']); // não muda a lista recebida
});

test('ordenar por aceleração (7 dias), score e tier', () => {
  const serie = n => Array.from({ length: 31 }, (_, i) => (i >= 29 ? n : 10)); // 31 pontos em 90 dias: passo 3 d
  const contas = new Map([
    ['quente', conta('quente', { score: 40, serie: serie(40), tier: 'C' })],
    ['parada', conta('parada', { score: 80, serie: Array(31).fill(80), tier: 'A' })],
  ]);
  const l = [sinal('p', 'parada', '2026-11-20'), sinal('q', 'quente', '2026-11-20')];
  assert.equal(variacao(contas.get('quente')), 30);
  assert.deepEqual(ordenarCaixa(l, 'aceleracao', contas).map(s => s.id), ['q', 'p']);
  assert.deepEqual(ordenarCaixa(l, 'score', contas).map(s => s.id), ['p', 'q']);
  assert.deepEqual(ordenarCaixa(l, 'tier', contas).map(s => s.id), ['p', 'q']);
});

test('1.2: janela de validade por tipo; liderança amadurece e fica 135 dias', () => {
  assert.equal(dentroDaJanela(sinal('1', 'a', '2026-10-12', { tipo: 'lancamento_produto' }), CARGA), true); // 45 d
  assert.equal(dentroDaJanela(sinal('2', 'a', '2026-10-11', { tipo: 'lancamento_produto' }), CARGA), false); // 46 d
  assert.equal(dentroDaJanela(sinal('3', 'a', '2026-10-26', { tipo: 'vaga_area_alvo' }), CARGA), false); // 31 d > 30
  assert.equal(dentroDaJanela(sinal('4', 'a', '2026-08-01', { tipo: 'troca_lideranca' }), CARGA), true); // 117 d
  assert.equal(dentroDaJanela(sinal('5', 'a', '2026-06-10', { tipo: 'nova_filial' }), CARGA), false);
  assert.equal(dentroDaJanela(sinal('6', 'a', '2026-12-10', { tipo: 'presenca_evento' }), CARGA), true); // futuro
});

test('1.3 e 1.4: variação com período e base; contribuição inteira e força em 3 níveis', () => {
  assert.equal(textoVariacao({ score: 33, tendencia: 18 }).curto, '+18 em 30 dias (era 15)');
  assert.equal(textoVariacao({ score: 33.4, tendencia: -4.6 }).curto, '−5 em 30 dias (era 38)');
  assert.equal(textoVariacao({ score: 20, tendencia: 0.3 }).curto, 'estável em 30 dias');
  assert.equal(pontosInteiros(23.25), '+23');
  assert.equal(pontosInteiros(-19.61), '−20');
  assert.deepEqual(['A', 'B', 'C', null].map(n => forcaDe({ nivel: n })), ['forte', 'medio', 'contexto', 'contexto']);
});

test('1.6: contadores por estágio somam o total da caixa', () => {
  const contas = new Map([['a', conta('a', { vscsStatus: 'Atenção' })], ['b', conta('b')], ['c', conta('c', { vscsStatus: undefined })]]);
  const l = [sinal('1', 'a', CARGA), sinal('2', 'a', CARGA), sinal('3', 'b', CARGA), sinal('4', 'c', CARGA)];
  const p = porEstagio(l, contas, ['Atenção', 'Monitoramento']);
  assert.equal(p.reduce((n, x) => n + x.n, 0), l.length);
  assert.deepEqual(p, [{ estagio: 'Atenção', n: 2 }, { estagio: 'Monitoramento', n: 1 }, { estagio: 'Sem estágio', n: 1 }]);
});

test('2.2: OU dentro do filtro, E entre filtros; janela; contagem por opção', () => {
  const contas = new Map([['a', conta('a', { tier: 'A', uf: 'SP' })], ['b', conta('b', { tier: 'B' })]]);
  const l = [
    sinal('1', 'a', '2026-11-25'),
    sinal('2', 'b', '2026-11-25', { tipo: 'nova_parceria', rotulo: 'Nova parceria' }),
    sinal('3', 'b', '2026-10-01'),
  ];
  const ids = f => filtrarCaixa(l, { ...SEM_FILTROS_CAIXA, ...f }, contas, CARGA).map(s => s.id);
  assert.deepEqual(ids({ tipos: ['Lançamento de produto', 'Nova parceria'] }), ['1', '2', '3']);
  assert.deepEqual(ids({ tipos: ['Lançamento de produto'], tiers: ['B'] }), ['3']);
  assert.deepEqual(ids({ janela: 7 }), ['1', '2']);
  assert.deepEqual(ids({ ufs: ['SP'] }), ['1']);
  assert.deepEqual(contarOpcoes(l, { ...SEM_FILTROS_CAIXA, tiers: ['B'] }, contas, CARGA, 'tipos'), [['Lançamento de produto', 1], ['Nova parceria', 1]]);
  assert.deepEqual(contarOpcoes(l, { ...SEM_FILTROS_CAIXA, tiers: ['B'] }, contas, CARGA, 'tiers'), [['B', 2], ['A', 1]]); // o próprio grupo não se filtra
});

test('variantes dos coletores herdam a janela da raiz (liderança 135 dias, D7)', () => {
  assert.equal(janelaDe({ tipo: 'troca_lideranca_ceo' }), 135);
  assert.equal(janelaDe({ tipo: 'vaga_lideranca_growth' }), 135);
  assert.equal(janelaDe({ tipo: 'lancamento_ia' }), 45);
  assert.equal(janelaDe({ tipo: 'vaga_area_time' }), 30);
  assert.equal(janelaDe({ tipo: 'fusao_aquisicao' }), 60);
  assert.equal(janelaDe({ tipo: 'captacao_seed' }), 90);
  assert.equal(janelaDe({ tipo: 'intencao_site' }), 15);
  assert.equal(janelaDe({ tipo: 'tipo_desconhecido' }), 60);
});

test('filtro de playbook: nome exato ou "Qualquer playbook"; conta sem playbook sai', async () => {
  const { QUALQUER_PLAYBOOK } = await import('../../lib/caixa.ts');
  const contas = new Map([['a', conta('a', { playbook: 'Lançamento com tração' })], ['b', conta('b')], ['c', conta('c', { playbook: 'Reposicionamento' })]]);
  const l = [sinal('1', 'a', '2026-11-20'), sinal('2', 'b', '2026-11-20'), sinal('3', 'c', '2026-11-20')];
  assert.deepEqual(filtrarCaixa(l, { ...SEM_FILTROS_CAIXA, playbooks: ['Reposicionamento'] }, contas, CARGA).map(s => s.id), ['3']);
  assert.deepEqual(filtrarCaixa(l, { ...SEM_FILTROS_CAIXA, playbooks: [QUALQUER_PLAYBOOK] }, contas, CARGA).map(s => s.id), ['1', '3']);
  assert.deepEqual(contarOpcoes(l, SEM_FILTROS_CAIXA, contas, CARGA, 'playbooks'), [['Lançamento com tração', 1], ['Reposicionamento', 1]]);
  // link antigo, sem o campo, continua valendo
  const { playbooks: _, ...antigo } = SEM_FILTROS_CAIXA;
  assert.equal(filtrarCaixa(l, antigo, contas, CARGA).length, 3);
});

test('sinal sem pontuação ainda: "a pontuar" e fim da ordem por força, nunca NaN', async () => {
  const { pontosInteiros, ordenarCaixa } = await import('../../lib/caixa.ts');
  assert.equal(pontosInteiros(undefined), 'a pontuar');
  assert.equal(pontosInteiros(NaN), 'a pontuar');
  assert.equal(pontosInteiros(12.4), '+12');
  const s = (id, pontos) => ({ id, contaId: 'c', data: '2026-11-20', pontos });
  const ordem = ordenarCaixa([s('x', undefined), s('a', 10), s('b', 30)], 'forca', new Map()).map(x => x.id);
  assert.deepEqual(ordem, ['b', 'a', 'x']);
});


test('fila comercial exclui zero, contexto, negativo e pendente sem destruir o registro', () => {
  const l = [sinal('zero','a',CARGA,{pontos:0}), sinal('pendente','a',CARGA,{pontos:undefined}), sinal('negativo','a',CARGA,{pontos:-9,categoria:'negativo'}), sinal('contexto','a',CARGA,{pontos:5,categoria:'contexto'}), sinal('valido','a',CARGA,{pontos:7})];
  assert.deepEqual(l.filter(elegivelCaixa).map(s=>s.id),['valido']);
  assert.equal(l.length,5);
  assert.equal(pontosInteiros(0),'contexto');
  assert.equal(pontosInteiros(.2),'+0,2');
  assert.equal(podeAbordar(l[0],conta('a',{score:80})),false);
  assert.equal(podeAbordar(l[4],conta('a',{score:80})),true);
  assert.equal(podeAbordar(l[4],conta('a',{score:60,tier:'B'})),false);
});

test('prioridade comercial destaca um sinal principal por conta antes dos secundários', () => {
  const contas = new Map([['a',conta('a',{tier:'B',score:74})],['b',conta('b',{tier:'A',score:60})],['c',conta('c',{tier:'C',score:99})]]);
  const l=[sinal('a-menor','a',CARGA,{pontos:7}),sinal('a-maior','a','2026-11-01',{pontos:30}),sinal('b','b',CARGA,{pontos:12}),sinal('c','c',CARGA,{pontos:70})];
  assert.equal(ORDEM_PADRAO,'prioridade');
  assert.deepEqual(ordenarCaixa(l,ORDEM_PADRAO,contas).map(s=>s.id),['a-maior','b','a-menor','c']);
});

test('aceleração não trata 2 amostras como série de 90 dias e utiliza série diária ancorada', () => {
  assert.equal(variacao(conta('a',{score:74,serie:[34,74]})),null);
  const valores=Array(181).fill(30); valores[180]=74;
  const c=conta('a',{score:74,v2:{versao:'3.3',calculadoEm:CARGA},serie180:{versao:'3.3',ate:CARGA,valores}});
  assert.equal(variacao(c),44);
});

test('nomeação efetiva confirmada em implementação continua válida, vaga antiga não', () => {
  const s=sinal('cro','a','2026-02-10',{tipo:'executivo_chegou',pontos:64});
  const c=conta('a',{v2:{contribuicoes:[{id:'cro',categoria:'lideranca',pontos:64,janela_lideranca:'implementacao',maturacao:'aplicada: confirmado'}]}});
  assert.equal(dentroDaJanela(s,CARGA,c),true);
  assert.equal(dentroDaJanela(s,CARGA),false);
  assert.equal(tituloSinal(s,conta('a',{v2:{contribuicoes:[{id:'cro',chave:'vaga_bloco',texto:'Bloco de 2 vagas operacionais'}]}})),'Bloco de 2 vagas operacionais');
});
