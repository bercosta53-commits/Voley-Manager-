// Resumo do motor de score gravado no snapshot (lib/modelo-score.ts). Valores ilustrativos do formato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumoModelo } from '../../lib/modelo-score.ts';

test('sem blocos do motor, não há resumo (a tela fica só com a explicação geral)', () => {
  assert.equal(resumoModelo({ scoreVersao: 'vscs-3.0' }), null);
});

test('lê senioridade, vagas, corroboração, teto, fases e janelas do snapshot, sem número fixo no app', () => {
  const r = resumoModelo({
    scoreModelo: { versao: 'vscs-x', aprovadoEm: '2026-01-02', senioridade: { head: 80, operacional: 20 }, vagasOperacionais: { 2: 30, 1: 20 }, janelaAgrupamentoDias: 30, criterio: 'Agrupar.' },
    scoreModeloDC: {
      estado: 'publicado', dc: { max_corroboradores: 2, mesma_categoria: 0.7, nao_corrobora: ['contexto'] },
      faixa_90: { teto_sem_requisitos: 89.9, materialidade_minima: 70, fonte_minima_dominante: 0.95, fonte_minima_corroborador: 0.9, categorias_gtm: ['lideranca'] },
      lideranca_nomeada: { diagnostico: { ate_dia: 90 }, subida: { ate_dia: 180 }, transicao: { ate_dia: 150 }, implementacao: { ate_dia: 450 }, expira_dia: 720 },
      janela_acao_dias: { captacao: 90, intencao: 15 },
    },
  });
  assert.equal(r.versao, 'vscs-x');
  assert.equal(r.aprovadoEm, '2026-01-02');
  const t = Object.fromEntries(r.itens.map(i => [i.rotulo, i.texto]));
  assert.equal(t['Base por senioridade do cargo'], 'head 80 · operacional 20');
  assert.match(t['Vagas agrupadas em 30 dias'], /1 → 20 · 2 → 30\. Agrupar\./);
  assert.equal(t['Corroboração'], 'Até 2 fatos corroboram o principal; da mesma categoria valem 0,7; contexto não corrobora.');
  assert.match(t['Teto de 89,9 sem requisitos'], /materialidade de 70 ou mais.*0,95.*0,9.*liderança/);
  assert.match(t['Liderança nomeada tem fases'], /dia 720/);
  assert.equal(t['Janela para agir, por tipo de fato'], 'intenção 15 d · captação 90 d');
});
