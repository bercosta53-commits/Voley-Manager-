import type { LinhaPrioridade } from '@/lib/prioridade-filtros';
import { DIMENSOES, REGRAS, type Dimensao } from '@/lib/prioridade-config';
import { formatarIntegrada, formatarNota } from '@/lib/prioridade';
import type { ResumoConta } from '@/components/ui/dica-conta';
import { LosangoMini, vscsDaDimensao } from './losango';

const CURTO: Record<Dimensao, string> = { icp: 'ICP', sinais: 'Sinais', clima: 'Clima', oportunidadeDigital: 'Digital' };
const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

/** Resumo de uma linha da prioridade para o cartão do mouse: classe, as quatro notas, o radar e a evidência. */
export function resumoDaLinha(l: LinhaPrioridade): ResumoConta {
  const v = l.visao;
  return {
    nome: l.nome,
    contexto: [l.setor, l.uf, l.tier && `Tier ${l.tier}`].filter(Boolean).join(' · '),
    grafico: <LosangoMini dims={v.dimensoes} tamanho={72} />,
    numeros: [
      { rotulo: 'Classe', valor: v.classeIntegrada ? `${v.classeIntegrada} · ${formatarIntegrada(v.notaIntegrada!)}` : 'sem métrica' },
      ...DIMENSOES.map(d => {
        const x = v.dimensoes[d];
        const n = x.nota !== null && x.entraNoCalculo ? x.nota : null;
        const vscs = d === 'sinais' ? vscsDaDimensao(x) : null;
        return {
          rotulo: vscs !== null ? `${CURTO[d]} · VSCS ${vscs}` : CURTO[d],
          valor: n === null ? '—' : formatarNota(Math.round(n * 10) / 10),
          tom: n === null ? ('neutro' as const) : n >= REGRAS.A2.minimos[d] ? ('ok' as const) : ('warm' as const),
        };
      }),
    ],
    fato: l.evidencia ? { texto: l.evidencia.texto, data: dataBr(l.evidencia.data) } : null,
    leitura: v.situacaoSweetSpot === 'sweet_spot' ? 'No sweet spot' : (v.motivosClassificacao[0] ?? null),
  };
}
