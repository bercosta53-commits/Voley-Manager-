/**
 * Clima em duas partes: CONTEXTO (o que já existe: macro, driver setorial e notícias, de data/clima.json) e
 * PULSO (o que as empresas da própria base estão fazendo: crescimento de equipe em 12 meses pelo OGI e
 * contratação/expansão registradas nos últimos 90 dias). Hard news puxa para o negativo; o pulso é fato observado.
 *
 * - Pulso de um grupo: 0,7 × saldo do OGI ((crescem − encolhem) / (crescem + encolhem)) + 0,3 × movimento
 *   relativo à base ((taxa do grupo / taxa da base) − 1, limitado a ±1). Grupo com menos de 8 contas com OGI usa o
 *   pulso da base (amostra pequena não vira sinal).
 * - Clima composto: 0,35 × contexto + 0,65 × pulso.
 * - Relativo: o composto de cada vertical menos a média ponderada da base. Um macro ruim para todo mundo não
 *   diferencia ninguém; o que diferencia é estar acima ou abaixo da média.
 * - Contra a maré: conta crescendo 10% ou mais (OGI) ou contratando/expandindo (90 dias) num setor de contexto negativo. O lado
 *   negativo do clima não rebaixa essa conta.
 * - Efeito na prioridade (só simulação): ancorado no neutro, ±0,25 ponto de nota no máximo.
 *
 * LEITURA PROPOSTA (decisão de 28/11 em andamento): não muda a nota do Clima, a nota integrada nem a classe.
 * Função pura; testes em scripts/tests/clima-pulso.test.mjs.
 */
import { estadoOgi, resultadosOgi, type EstadoOgi } from './ogi';

export const PESO_CONTEXTO = 0.35;
export const PESO_PULSO = 0.65;
export const PESO_SALDO_OGI = 0.7;
export const PESO_MOVIMENTO = 0.3;
export const MIN_CONTAS_PULSO = 8;
export const JANELA_MOVIMENTO_DIAS = 90;
export const TETO_EFEITO_NOTA = 0.25;
/** categorias de sinal que contam como "contratando ou expandindo" */
/** crescimento de equipe que basta para "contra a maré" (a faixa de +35 do OGI começa em 10%) */
export const CRESCIMENTO_CONTRA_MARE_PCT = 10;
export const CATEGORIAS_MOVIMENTO = new Set(['contratacao', 'expansao']);

export interface ContaPulso {
  id: string;
  nome: string;
  tier: string;
  vertical: string;
  ogi: EstadoOgi;
  /** crescimento de equipe em 12 meses, em %, quando comparável */
  crescimentoPct?: number | null;
  /** contratação ou expansão registrada nos últimos 90 dias */
  movimento: boolean;
}

export interface Pulso {
  /** contas no grupo */
  n: number;
  /** contas com crescimento de equipe comparável (crescimento, retração, ruído ou estagnação) */
  comOgi: number;
  cresce: number;
  encolhe: number;
  /** (cresce − encolhe) / (cresce + encolhe); null sem nenhum dos dois */
  saldo: number | null;
  comMovimento: number;
  /** comMovimento / n */
  taxaMovimento: number;
  /** −1 a +1; null quando não há OGI suficiente */
  S: number | null;
  /** o grupo é pequeno e herdou o pulso da base */
  usaBase: boolean;
}

const limitar = (v: number, a = -1, b = 1) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const COMPARAVEIS = new Set<EstadoOgi>(['crescimento', 'retracao', 'ruido', 'estagnado']);

function medir(contas: ContaPulso[]) {
  const cresce = contas.filter(c => c.ogi === 'crescimento').length;
  const encolhe = contas.filter(c => c.ogi === 'retracao').length;
  const comOgi = contas.filter(c => COMPARAVEIS.has(c.ogi)).length;
  const comMovimento = contas.filter(c => c.movimento).length;
  return { n: contas.length, comOgi, cresce, encolhe, saldo: cresce + encolhe ? (cresce - encolhe) / (cresce + encolhe) : null, comMovimento, taxaMovimento: contas.length ? comMovimento / contas.length : 0 };
}

/** Pulso de um grupo de contas; `base` é a base inteira (referência do movimento e reserva da amostra pequena). */
export function pulsoDoGrupo(contas: ContaPulso[], base: ContaPulso[] = contas): Pulso {
  const m = medir(contas);
  const b = medir(base);
  const S = (x: ReturnType<typeof medir>) => {
    if (x.comOgi < MIN_CONTAS_PULSO || x.saldo === null) return null;
    const mov = b.taxaMovimento > 0 ? limitar(x.taxaMovimento / b.taxaMovimento - 1) : 0;
    return r2(limitar(PESO_SALDO_OGI * x.saldo + PESO_MOVIMENTO * mov));
  };
  const proprio = S(m);
  const usaBase = proprio === null;
  return { ...m, saldo: m.saldo === null ? null : r2(m.saldo), taxaMovimento: r2(m.taxaMovimento), S: usaBase ? S(b) : proprio, usaBase };
}

export const climaComposto = (contexto: number, pulso: number | null) => r2(pulso === null ? contexto : PESO_CONTEXTO * contexto + PESO_PULSO * pulso);

/** a conta cresce de verdade: crescimento de equipe de 10% ou mais */
export const cresceDeVerdade = (c: Pick<ContaPulso, 'ogi' | 'crescimentoPct'>) => c.ogi === 'crescimento' && (c.crescimentoPct ?? 0) >= CRESCIMENTO_CONTRA_MARE_PCT;
/** Contra a maré: num setor de contexto negativo, a conta cresce 10% ou mais ou contrata/expande (90 dias). */
export const contraAMare = (c: Pick<ContaPulso, 'ogi' | 'crescimentoPct' | 'movimento'>, contextoDoSetor: number) => contextoDoSetor < 0 && (cresceDeVerdade(c) || c.movimento);

/**
 * Efeito do clima na nota integrada (simulação): ancorado no neutro, proporcional ao clima relativo, limitado a
 * ±0,25. Conta contra a maré não perde nota pelo clima.
 */
export function efeitoNaNota(relativo: number, contraMare: boolean): number {
  const e = limitar(relativo * TETO_EFEITO_NOTA * 2, -TETO_EFEITO_NOTA, TETO_EFEITO_NOTA);
  return r2(contraMare ? Math.max(0, e) : e);
}

// ---------------------------------------------------------------- leitura para a aba Clima

export interface VerticalPulso {
  id: string;
  nome: string;
  contexto: number;
  pulso: Pulso;
  composto: number;
  /** composto menos a média da base */
  relativo: number;
  contraMare: number;
}

export interface LeituraPulso {
  /** há crescimento de equipe na base para medir o pulso */
  disponivel: boolean;
  referencia: string;
  base: Pulso;
  /** contexto médio da base (ponderado pelas contas) */
  contextoBase: number;
  compostoBase: number;
  verticais: VerticalPulso[];
  /** contas contra a maré, Tier A primeiro, as que crescem e contratam antes */
  contraMare: { id: string; nome: string; tier: string; vertical: string; cresce: boolean; crescimentoPct: number | null; movimento: boolean }[];
  totalContraMare: number;
  /** por conta: clima composto da vertical, relativo à base e contra a maré (para a nota do Clima na prioridade) */
  porConta: Record<string, { composto: number; relativo: number; contraMare: boolean }>;
}

interface ContaMin {
  id: string;
  nome: string;
  tier?: string;
  icp?: { tier?: string } | null;
  especializacao?: { codigo?: string } | null;
}
interface SinalMin {
  contaId: string;
  categoria?: string | null;
  data?: string;
  exemplo?: boolean;
}

/**
 * Monta a leitura a partir do snapshot: `verticais` é a lista do Clima já com o contexto S de cada uma
 * (nivelVertical) e os códigos de especialização; conta sem código cai na Generalista, como no Clima.
 */
export function leituraPulso(
  base: { contas: ContaMin[]; sinais: SinalMin[]; atualizadoEm?: string; geradoEm?: string } & Record<string, unknown>,
  verticais: { id: string; nome: string; codigos: string[]; S: number }[],
  limiteContraMare = 12,
): LeituraPulso {
  const referencia = (base.atualizadoEm || base.geradoEm || '').slice(0, 10);
  const ref = Date.parse(`${referencia}T00:00:00Z`);
  const comMovimento = new Set(
    base.sinais
      .filter(s => !s.exemplo && s.categoria && CATEGORIAS_MOVIMENTO.has(s.categoria) && /^\d{4}-\d{2}-\d{2}/.test(s.data ?? ''))
      .filter(s => {
        const dias = (ref - Date.parse(`${s.data!.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
        return dias >= 0 && dias <= JANELA_MOVIMENTO_DIAS;
      })
      .map(s => s.contaId),
  );
  const res = resultadosOgi(base);
  const gen = verticais.find(v => v.id === 'GEN');
  const verticalDe = (c: ContaMin) => verticais.find(v => v.codigos.includes(c.especializacao?.codigo || 'GEN')) ?? gen;
  const contas: ContaPulso[] = base.contas.map(c => ({
    id: c.id,
    nome: c.nome,
    tier: c.icp?.tier || c.tier || '',
    vertical: verticalDe(c)?.id ?? 'GEN',
    ogi: estadoOgi(res[c.id]),
    crescimentoPct: typeof res[c.id]?.crescimento365Pct === 'number' ? res[c.id]!.crescimento365Pct : null,
    movimento: comMovimento.has(c.id),
  }));
  const pBase = pulsoDoGrupo(contas);
  const porVertical = verticais
    .map(v => {
      const cs = contas.filter(c => c.vertical === v.id);
      const pulso = pulsoDoGrupo(cs, contas);
      return { v, cs, pulso, composto: climaComposto(v.S, pulso.S) };
    })
    .filter(x => x.cs.length > 0);
  const total = porVertical.reduce((s, x) => s + x.cs.length, 0) || 1;
  const compostoBase = r2(porVertical.reduce((s, x) => s + x.composto * x.cs.length, 0) / total);
  const contextoBase = r2(porVertical.reduce((s, x) => s + x.v.S * x.cs.length, 0) / total);
  const contra = porVertical.flatMap(x => x.cs.filter(c => contraAMare(c, x.v.S)).map(c => ({ c, vertical: x.v.nome })));
  const ordemTier = (t: string) => ({ A: 0, B: 1, C: 2 })[t] ?? 3;
  contra.sort((a, b) => ordemTier(a.c.tier) - ordemTier(b.c.tier) || Number(cresceDeVerdade(b.c) && b.c.movimento) - Number(cresceDeVerdade(a.c) && a.c.movimento) || a.c.nome.localeCompare(b.c.nome, 'pt-BR'));
  return {
    disponivel: pBase.S !== null,
    referencia,
    base: pBase,
    contextoBase,
    compostoBase,
    verticais: porVertical
      .map(x => ({ id: x.v.id, nome: x.v.nome, contexto: r2(x.v.S), pulso: x.pulso, composto: x.composto, relativo: r2(x.composto - compostoBase), contraMare: x.cs.filter(c => contraAMare(c, x.v.S)).length }))
      .sort((a, b) => b.pulso.n - a.pulso.n),
    contraMare: contra.slice(0, limiteContraMare).map(({ c, vertical }) => ({ id: c.id, nome: c.nome, tier: c.tier, vertical, cresce: cresceDeVerdade(c), crescimentoPct: c.crescimentoPct ?? null, movimento: c.movimento })),
    totalContraMare: contra.length,
    porConta: Object.fromEntries(
      porVertical.flatMap(x => x.cs.map(c => [c.id, { composto: x.composto, relativo: r2(x.composto - compostoBase), contraMare: contraAMare(c, x.v.S) }])),
    ),
  };
}
