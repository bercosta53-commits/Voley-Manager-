import type { Base, Conta } from './tipos';
import { diasEntre } from './utils';

/**
 * Aba Clima: o mercado abrindo ou fechando janelas por vertical (especialização do ICP).
 *
 * Nível S de cada vertical = 0,40 × macro + 0,45 × driver setorial + 0,15 × notícias; o macro é a média dos
 * z-scores dos blocos (juros, inflação, câmbio…) ponderada pela sensibilidade da vertical a cada um. A
 * Generalista segue só o macro (é o "Clima Brasil"). Estados: Bom ≥ +0,25, Ruim ≤ −0,25, Neutro entre os
 * dois; Instável é marcado pelo motor quando a direção é incerta. Os parâmetros por vertical vêm de
 * data/clima.json (simulados até o motor rodar); contas, tier e VSCS vêm da base.
 */

export type EstadoClima = 'Bom' | 'Neutro' | 'Ruim' | 'Instável';
export const ESTADOS_CLIMA: EstadoClima[] = ['Bom', 'Neutro', 'Instável', 'Ruim'];
export const ICONE_CLIMA: Record<EstadoClima, string> = { Bom: '↗', Neutro: '→', Ruim: '↘', Instável: '≈' };
/** cores pelos tokens do Radar: bom = verde, neutro = cinza, ruim = vermelho fosco, instável = âmbar */
export const COR_CLIMA: Record<EstadoClima, string> = {
  Bom: 'var(--vr-ok)',
  Neutro: 'var(--vr-text-3)',
  Ruim: 'var(--vr-risk)',
  Instável: 'var(--vr-warm)',
};
export const FUNDO_CLIMA: Record<EstadoClima, string> = {
  Bom: 'var(--vr-ok-bg)',
  Neutro: 'var(--vr-surface-3)',
  Ruim: 'var(--vr-risk-bg)',
  Instável: 'var(--vr-warm-bg)',
};

export interface DadosClima {
  atualizadoEm: string;
  indicadoresEmDia: [number, number];
  simulado: boolean;
  brasil: { nota: string; delta30: number; estado: EstadoClima; fatorClima: number; contasEmMercadoTri: string; baseEmMercado: string };
  blocos: string[];
  z: number[];
  pesos: { macro: number; setorial: number; noticias: number };
  limiares: { bom: number; ruim: number };
  indicadores: { rotulo: string; valor: string; delta: string; tom: 'bom' | 'ruim' | 'atencao'; cor: 'bom' | 'ruim' | 'atencao' | 'neutro'; serie: number[]; faixa: [number, number]; nota: string; fonte: string }[];
  agenda: { d: string; t: string }[];
  marcos: { semanasAtras: number; rotulo: string }[];
  jogadas: Record<string, string>;
  verticais: {
    id: string;
    nome: string;
    codigos: string[];
    sens: number[];
    setorial: number;
    noticias: number;
    delta30: number;
    estado: EstadoClima;
    confianca: string;
    desde: string;
    jogada: string;
    porque: string;
  }[];
}

export interface Vertical {
  id: string;
  nome: string;
  codigos: string[];
  estado: EstadoClima;
  /** nível do clima, −1 a +1 */
  S: number;
  delta30: number;
  macro: number;
  setorial: number;
  noticias: number;
  sens: number[];
  /** contribuição de cada bloco macro para o macro da vertical */
  contrib: number[];
  confianca: string;
  desde: string;
  jogada: string;
  jogadaTexto: string;
  porque: string;
  /** da base */
  contas: number;
  tierA: number;
  quentes: Pick<Conta, 'id' | 'nome' | 'tier' | 'score' | 'dominio'>[];
  /** contas com fato de crescimento (30 dias) numa vertical Ruim ou Instável */
  contraMare: number;
  /** semanas, a mais antiga primeiro; a última é hoje */
  serie(semanas: number): number[];
}

export interface Clima {
  dados: DadosClima;
  brasilS: number;
  verticais: Vertical[];
}

const CATEGORIAS_CRESCIMENTO = new Set(['expansao', 'contratacao', 'lideranca', 'estrategia']);

/** Pseudoaleatório estável por vertical (a mesma vertical desenha sempre a mesma história). */
function semente(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return h / 997;
}

export function estadoNaSemana(s: number, v: Pick<Vertical, 'estado' | 'S'>, semanasAtras: number, lim: DadosClima['limiares']): EstadoClima {
  if (v.estado === 'Instável' && semanasAtras < 2) return 'Instável';
  if (v.estado === 'Instável' && Math.abs(s - v.S) > 0.08 && semanasAtras < 6) return 'Instável';
  if (s >= lim.bom) return 'Bom';
  if (s <= lim.ruim) return 'Ruim';
  return 'Neutro';
}

export function calcularClima(dados: DadosClima, base: Base): Clima {
  const hoje = base.geradoEm;
  const crescendo = new Set(
    base.sinais.filter(s => s.categoria && CATEGORIAS_CRESCIMENTO.has(s.categoria) && diasEntre(s.data, hoje) <= 30).map(s => s.contaId),
  );
  const contasDe = (codigos: string[]) => base.contas.filter(c => codigos.includes(c.especializacao?.codigo ?? 'GEN'));

  const verticais: Vertical[] = dados.verticais.map(r => {
    const den = r.sens.reduce((a, b) => a + Math.abs(b), 0) || 1;
    const contrib = r.sens.map((s, i) => (s * (dados.z[i] ?? 0)) / den);
    const macro = contrib.reduce((a, b) => a + b, 0);
    const S = r.id === 'GEN' ? macro : dados.pesos.macro * macro + dados.pesos.setorial * r.setorial + dados.pesos.noticias * r.noticias;
    const cs = contasDe(r.codigos);
    const ruimOuInstavel = r.estado === 'Ruim' || r.estado === 'Instável';
    const k = semente(r.id) * 6.28;
    const v: Vertical = {
      id: r.id,
      nome: r.nome,
      codigos: r.codigos,
      estado: r.estado,
      S,
      delta30: r.delta30,
      macro,
      setorial: r.setorial,
      noticias: r.noticias,
      sens: r.sens,
      contrib,
      confianca: r.confianca,
      desde: r.desde,
      jogada: r.jogada,
      jogadaTexto: dados.jogadas[r.jogada] ?? '',
      porque: r.porque,
      contas: cs.length,
      tierA: cs.filter(c => c.tier === 'A').length,
      quentes: [...cs]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => ({ id: c.id, nome: c.nome, tier: c.tier, score: c.score, dominio: c.dominio })),
      contraMare: ruimOuInstavel ? cs.filter(c => crescendo.has(c.id)).length : 0,
      // história semanal reconstruída do nível e da direção (simulada até o motor gravar o histórico)
      serie(semanas: number) {
        const out: number[] = [];
        for (let t = 0; t < semanas; t++) {
          const atras = semanas - 1 - t;
          const oscila = Math.sin(t * 0.8 + k) * (r.estado === 'Instável' ? 0.09 : 0.04);
          out.push(Math.max(-1, Math.min(1, S - r.delta30 * (atras / 4.3) * 0.55 + oscila * Math.min(1, atras / 3))));
        }
        out[semanas - 1] = S;
        return out;
      },
    };
    return v;
  });
  const brasilS = verticais.find(v => v.id === 'GEN')?.S ?? 0;
  return { dados, brasilS, verticais };
}

/** −0,28 / +0,25: duas casas, vírgula e sinal sempre visível. */
export function fmtClima(x: number, casas = 2) {
  return `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(casas).replace('.', ',')}`;
}
