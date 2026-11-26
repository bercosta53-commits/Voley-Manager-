import test from 'node:test';
import assert from 'node:assert/strict';
import { ALAVANCAS_ATUAIS, prepararContas, simular } from '../../lib/icp.ts';

const regras = { regiao: ['SP','PR','SC','RS'], ramosPrincipais: ['SV07'], ramosSecundarios: ['SW03'], ramosFora: [], especializacoesExcluidas: [], portesAbaixo: ['ME'], faturamentoAlvo: '20 a 100 milhões' };
const conta = (id,tier,extra={}) => ({
  id, nome:id, tier, icp:{tier,motivos:[]}, uf:'SP', modeloNegocio:'servico',
  ramoTI:{codigo:'SV07',nome:'Desenvolvimento de Software',familia:'Serviços'},
  comite:[], historico:[], score:60, anoFundacao:2000, decisor:{nome:'',cargo:''},
  ...extra,
});
const evid = (g, extra={}) => ({ requalificacao2G:{ status:'a_provisorio', sede:{uf:'SP',url:'https://example.invalid'}, ramoAvaliado:'SV07',modeloAvaliado:'servico',faturamento:{status:'pendente'},gatilhos:g, ...extra } });
const f = { status:'favoravel_inferencia_alta',contaParaTierA:true };
const base = {geradoEm:'2026-11-26',sinais:[],contas:[
  conta('a','A',{icpEvidencia:evid({g2:f,g3:f})}),
  conta('b','B',{icpEvidencia:evid({g2:f,g3:{status:'desconhecido',contaParaTierA:false}})}),
  conta('c','C',{uf:'MG'}),
  conta('d','A'),
]};
test('oficial preserva cada tier e restaurar elimina deltas sem depender de inferência',()=>{
  const cs=prepararContas(base,regras), al=ALAVANCAS_ATUAIS(regras);
  const atual=simular(cs,al);
  assert.deepEqual([atual.nA,atual.nB,atual.nC],[2,1,1]);
  assert.equal(atual.entram.length+atual.saem.length,0);
  assert.equal(al.minGatilhos,2);
  const sim=simular(cs,{...al,oficial:false,minGatilhos:3});
  assert.equal(sim.nA,0);
  assert.deepEqual(simular(cs,ALAVANCAS_ATUAIS(regras)).linhas.map(x=>x.tier),['A','B','C','A']);
});
test('gatilhos contam apenas evidência registrada; idade, falta de comitê e oferta não inventam dores',()=>{
  const cs=prepararContas(base,regras);
  assert.deepEqual([...cs[0].gatilhos],[2,3]);
  assert.deepEqual([...cs[1].gatilhos],[2]);
  assert.equal(cs[3].gatilhos.size,0);
  assert.equal(cs[3].incompletos.size,5);
  const sim=simular(cs,{...ALAVANCAS_ATUAIS(regras),oficial:false});
  assert.equal(sim.nA,1);
  assert.equal(sim.aSemFaturamento,1);
  assert.equal(simular(cs,{...ALAVANCAS_ATUAIS(regras),oficial:false,exigirFaturamento:true}).nA,0);
  assert.equal(sim.funil.at(-1).n,0);
});
