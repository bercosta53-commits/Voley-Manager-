import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intensidadeComercial, referenciaComercial, quadranteComercial, verticalDaConta } from '../../lib/clima.ts';

test('intensidade usa VSCS puro A/B, preserva zero e exclui score ausente ou inválido', () => {
  const contas = [
    { tier:'A', score:99, v2:{vscs:40} },
    { tier:'B', score:99, v2:{vscs:0} },
    { tier:'B', v2:{} },
    { tier:'C', v2:{vscs:100} },
    { tier:'A', v2:{vscs:Infinity} },
    { tier:'C', icp:{tier:'B'}, v2:{vscs:20} },
    { tier:'A', icp:{tier:'C'}, v2:{vscs:100} },
  ];
  assert.deepEqual(intensidadeComercial(contas), { contasICP:5, comScore:3, soma:60, media:20, comSinal:2 });
  assert.equal(intensidadeComercial([{tier:'C',v2:{vscs:80}}]).media,null);
  assert.equal(intensidadeComercial([{tier:'A',v2:{vscs:0}}]).media,0);
});

test('referência é ponderada por contas avaliadas e não pelo número de verticais', () => {
  const a = intensidadeComercial([{tier:'A',v2:{vscs:60}}]);
  const b = intensidadeComercial(Array.from({length:3},()=>({tier:'B',v2:{vscs:0}})));
  assert.equal(referenciaComercial([{intensidade:a},{intensidade:b}]),15);
  assert.equal(referenciaComercial([]),null);
});

test('quadrantes usam clima favorável e referência comercial, não o mesmo eixo', () => {
  assert.equal(quadranteComercial(.30,30,15,.25),'Sweet spot');
  assert.equal(quadranteComercial(-.30,30,15,.25),'Contramão');
  assert.equal(quadranteComercial(.30,5,15,.25),'Mercado latente');
  assert.equal(quadranteComercial(-.30,5,15,.25),'Baixa prioridade');
  assert.equal(quadranteComercial(.30,null,15,.25),'Sem avaliação comercial');
  assert.equal(quadranteComercial(.30,0,0,.25),'Mercado latente');
  assert.equal(quadranteComercial(.10,30,15,.25),'Contramão');
});

test('classificação de vertical não deixa conta sem código ou código desconhecido fora do denominador', () => {
  const vs = [{id:'GEN',codigos:['GEN']},{id:'MKT',codigos:['ESP16','ESP17']}];
  assert.equal(verticalDaConta(vs,'ESP17').id,'MKT');
  assert.equal(verticalDaConta(vs,'desconhecido').id,'GEN');
  assert.equal(verticalDaConta(vs,null).id,'GEN');
});
