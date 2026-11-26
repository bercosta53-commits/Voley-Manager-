// Testes de lib/proximidade-layout.ts. Rodar: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDA_ANEL, anguloDaConta, faixaProximityPorAnel, posicaoNoAnel, raioDaConta } from '../../lib/proximidade-layout.ts';
import { BRACOS } from '../../lib/proximidade.ts';

test('posição dentro do anel: relativa ao min/max do anel, presa entre 0 e 1', () => {
  const faixa = faixaProximityPorAnel([{ anel: 1, proximity: 0.6 }, { anel: 1, proximity: 0.8 }, { anel: 3, proximity: 0.2 }]);
  assert.deepEqual(faixa[1], [0.6, 0.8]);
  assert.ok(Math.abs(posicaoNoAnel(0.7, 1, faixa) - 0.5) < 1e-9);
  assert.equal(posicaoNoAnel(0.9, 1, faixa), 1);
  assert.equal(posicaoNoAnel(0.2, 3, faixa), 0.5); // anel com uma conta só: meio da banda
  assert.equal(posicaoNoAnel(0.2, 2, faixa), 0.5); // anel vazio
});

test('raio: mais perto do motor = mais perto do centro, sempre dentro da banda do anel', () => {
  for (const anel of [1, 2, 3, 4]) {
    const [min, max] = BANDA_ANEL[anel];
    assert.equal(raioDaConta(anel, 1), min);
    assert.equal(raioDaConta(anel, 0), max);
  }
  assert.ok(raioDaConta(1, 0) < raioDaConta(2, 1)); // anéis não se sobrepõem
});

test('ângulo determinístico e dentro da fatia do braço', () => {
  const fatia = 360 / BRACOS.length;
  BRACOS.forEach((b, i) => {
    for (const id of ['conta-1', 'conta-2', 'outra']) {
      const c = { id, braco: b.id, subsegmento: b.subsegmentos[0] };
      const a = anguloDaConta(c);
      assert.equal(a, anguloDaConta(c));
      const graus = (((a * 180) / Math.PI + 90) % 360 + 360) % 360;
      assert.ok(graus >= i * fatia && graus <= (i + 1) * fatia, `${b.id}: ${graus}`);
    }
  });
});
