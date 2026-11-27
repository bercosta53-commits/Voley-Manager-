/**
 * OGI (crescimento de equipe em 12 meses) como 5ª dimensão: SÓ LEITURA E SIMULAÇÃO.
 *
 * - Lê o resultado já calculado pelo pipeline em `payload.ogi.simulacaoAssimetria.resultados[contaId]`; não
 *   recalcula o OGI (motor único) e não escreve nada.
 * - Não entra no VSCS, na nota integrada oficial, na classe nem no Tier: quem usa isto é a simulação
 *   (lib/simulacao-ogi.ts e scripts/simular-ogi.mjs).
 * - Distingue ausência de dado (null), base não comparável (null), ruído (variação de menos de 3 pessoas:
 *   neutro), estagnação confirmada, crescimento e retração. Ausência nunca vira zero nem penalidade.
 * - Normalização para a escala 1–5 das outras dimensões com a mesma inclinação dos dois lados (neutro = 3):
 *   a assimetria do OGI (quedas pesam mais que altas do mesmo tamanho) chega intacta à nota.
 * - Deduplicação por causa empresarial comum: quando um sinal do VSCS registra a mesma causa (expansão,
 *   retração, reorganização) na janela de 12 meses, o afastamento do neutro é descontado; vaga genérica não
 *   é causa.
 * Decisões de 27/11 (direcionamento de Bernardo); documentadas em docs/ogi-quinta-dimensao.md.
 * Testes: scripts/tests/ogi.test.mjs.
 */

export interface ResultadoOgi {
  nome?: string | null;
  fonte?: string | null;
  total?: number | null;
  delta365?: number | null;
  delta90?: number | null;
  crescimento365Pct?: number | null;
  crescimento90Pct?: number | null;
  pesoBase?: number | null;
  fatorMaterialidade?: number | null;
  fatorPersistencia?: number | null;
  fatorConfiabilidade?: number | null;
  pesoAposPersistencia?: number | null;
  ajusteSimulado?: number | null;
  alerta90?: boolean | string | null;
  consultadoEm?: string | null;
  status?: string | null;
}

export type EstadoOgi = 'sem_dado' | 'nao_comparavel' | 'ruido' | 'estagnado' | 'crescimento' | 'retracao';
export const ROTULO_ESTADO_OGI: Record<EstadoOgi, string> = {
  sem_dado: 'Sem dado',
  nao_comparavel: 'Base não comparável',
  ruido: 'Variação pequena (ruído)',
  estagnado: 'Estagnação confirmada',
  crescimento: 'Crescimento',
  retracao: 'Retração',
};

/** variação absoluta (pessoas em 12 meses) abaixo da qual o OGI é neutro: ruído de fonte, não movimento */
export const LIMIAR_RUIDO = 3;
/** pontos de OGI por ponto de nota (mesma inclinação nos dois lados): +90 → 5; −90 ou menos → 1 */
export const ESCALA_NOTA = 45;
export const NOTA_NEUTRA = 3;
/** desconto padrão do afastamento do neutro quando a causa já está num sinal do VSCS (a testar: 0, 0,5, 1) */
export const DESCONTO_CAUSA_COMUM = 0.5;
/** janela da causa comum, igual à do OGI anual */
export const JANELA_CAUSA_DIAS = 365;

/** status do pipeline que tornam o resultado inutilizável (comparação sem acento e sem caixa) */
const STATUS_BLOQUEIO = /bloque|nao[_ ]?compar|nao[_ ]?valid|sem[_ ]?dado|indispon|erro|insuf|invalid/;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function estadoOgi(r: ResultadoOgi | null | undefined): EstadoOgi {
  if (!r) return 'sem_dado';
  const total = num(r.total);
  const delta = num(r.delta365);
  if (total === null || delta === null) return 'sem_dado';
  if (r.status && STATUS_BLOQUEIO.test(semAcento(r.status))) return 'nao_comparavel';
  if (total - delta <= 0) return 'nao_comparavel'; // sem base de 12 meses atrás: crescimento indefinido
  if (delta === 0) return 'estagnado';
  if (Math.abs(delta) < LIMIAR_RUIDO) return 'ruido';
  return delta > 0 ? 'crescimento' : 'retracao';
}

/**
 * Força do OGI em pontos (a escala do documento OGI 0.4): peso após persistência × materialidade, com ou sem
 * a confiabilidade. Usa os fatores gravados; sem eles, deriva do ajuste simulado. null quando não há como saber.
 */
export function forcaOgi(r: ResultadoOgi, usarConfiabilidade: boolean): number | null {
  const peso = num(r.pesoAposPersistencia);
  const mat = num(r.fatorMaterialidade);
  const conf = num(r.fatorConfiabilidade);
  const ajuste = num(r.ajusteSimulado);
  if (peso !== null && mat !== null) return peso * mat * (usarConfiabilidade ? (conf ?? 1) : 1);
  if (ajuste === null) return null;
  if (usarConfiabilidade) return ajuste;
  return conf ? ajuste / conf : null;
}

export type CausaComum = 'expansao' | 'retracao' | 'reorganizacao';
/**
 * Tipos de sinal que registram uma causa empresarial que também mexe no tamanho da equipe. Vagas genéricas
 * (vaga_area_alvo, vaga_lideranca_alvo) não entram: abrir vaga não é expandir a empresa.
 */
export const CAUSA_POR_TIPO: Record<string, CausaComum> = {
  expansao_mercado: 'expansao',
  nova_unidade: 'expansao',
  captacao: 'expansao',
  resultados_crescimento: 'expansao',
  vaga_expansao_comercial: 'expansao',
  fusao_aquisicao: 'reorganizacao',
  reestruturacao: 'reorganizacao',
  reorganizacao: 'reorganizacao',
  demissao: 'retracao',
  demissoes: 'retracao',
  layoff: 'retracao',
  retracao: 'retracao',
  fechamento_unidade: 'retracao',
};
/** que causas explicam cada direção do OGI (reorganização explica tanto alta quanto queda) */
const CAUSAS_DO_ESTADO: Partial<Record<EstadoOgi, CausaComum[]>> = {
  crescimento: ['expansao', 'reorganizacao'],
  retracao: ['retracao', 'reorganizacao'],
};

export interface SinalCausa {
  id?: string;
  tipo: string;
  data: string;
  exemplo?: boolean;
}

/** O sinal mais recente da conta que registra a mesma causa do OGI, na janela de 12 meses até a referência. */
export function causaComum(estado: EstadoOgi, sinais: SinalCausa[], referencia: string): { causa: CausaComum; sinal: SinalCausa } | null {
  const aceitas = CAUSAS_DO_ESTADO[estado];
  if (!aceitas) return null;
  const ref = Date.parse(`${referencia.slice(0, 10)}T00:00:00Z`);
  const candidatos = sinais
    .filter(s => !s.exemplo && /^\d{4}-\d{2}-\d{2}/.test(s.data ?? ''))
    .map(s => ({ s, causa: CAUSA_POR_TIPO[s.tipo], idade: (ref - Date.parse(`${s.data.slice(0, 10)}T00:00:00Z`)) / 86_400_000 }))
    .filter(x => x.causa && aceitas.includes(x.causa) && x.idade >= 0 && x.idade <= JANELA_CAUSA_DIAS)
    .sort((a, b) => a.idade - b.idade);
  return candidatos[0] ? { causa: candidatos[0].causa!, sinal: candidatos[0].s } : null;
}

export interface NotaOgi {
  estado: EstadoOgi;
  /** 1–5, ou null quando não há dado comparável */
  nota: number | null;
  /** pontos de OGI usados (após confiabilidade, se pedida); null sem dado ou no ruído */
  forca: number | null;
  /** desconto aplicado por causa comum, com o sinal que a registra */
  deduplicacao: { causa: CausaComum; sinalId: string | null; desconto: number } | null;
  /** a nota usa confiabilidade abaixo de 1 (resultado provisório) */
  provisoria: boolean;
}

export interface OpcoesNotaOgi {
  usarConfiabilidade?: boolean;
  /** 0 = sem deduplicação, 1 = a causa comum zera o afastamento do neutro */
  descontoCausaComum?: number;
  sinais?: SinalCausa[];
  /** AAAA-MM-DD: data de referência da janela da causa comum (a consulta do OGI, ou a carga) */
  referencia?: string;
  /** pontos de OGI por ponto de nota (padrão ESCALA_NOTA); variar para testar a normalização */
  escala?: number;
}

const limitar = (v: number) => Math.min(5, Math.max(1, v));

export function notaOgi(r: ResultadoOgi | null | undefined, o: OpcoesNotaOgi = {}): NotaOgi {
  const estado = estadoOgi(r);
  const usar = o.usarConfiabilidade ?? true;
  const provisoria = usar && (num(r?.fatorConfiabilidade) ?? 1) < 1;
  if (estado === 'sem_dado' || estado === 'nao_comparavel') return { estado, nota: null, forca: null, deduplicacao: null, provisoria: false };
  if (estado === 'ruido') return { estado, nota: NOTA_NEUTRA, forca: null, deduplicacao: null, provisoria };
  const forca = forcaOgi(r!, usar);
  if (forca === null) return { estado: 'sem_dado', nota: null, forca: null, deduplicacao: null, provisoria: false };
  let afastamento = forca / (o.escala ?? ESCALA_NOTA);
  let deduplicacao: NotaOgi['deduplicacao'] = null;
  const desconto = o.descontoCausaComum ?? DESCONTO_CAUSA_COMUM;
  const ref = o.referencia ?? r!.consultadoEm ?? null;
  if (desconto > 0 && o.sinais?.length && ref) {
    const c = causaComum(estado, o.sinais, ref);
    if (c) {
      afastamento *= 1 - desconto;
      deduplicacao = { causa: c.causa, sinalId: c.sinal.id ?? null, desconto };
    }
  }
  return { estado, nota: Math.round(limitar(NOTA_NEUTRA + afastamento) * 100) / 100, forca: Math.round(forca * 10) / 10, deduplicacao, provisoria };
}

/** Os resultados do OGI no payload, onde quer que o pipeline os tenha gravado; vazio quando não há bloco OGI. */
export function resultadosOgi(payload: unknown): Record<string, ResultadoOgi> {
  const ogi = (payload as { ogi?: { simulacaoAssimetria?: { resultados?: Record<string, ResultadoOgi> } } } | null)?.ogi;
  return ogi?.simulacaoAssimetria?.resultados ?? {};
}
