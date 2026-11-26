import type { Conta } from './tipos';
import {
  CLASSES, DIMENSOES, ENTRADA_SWEET_SPOT, EVIDENCIA_NECESSARIA, ORIGEM, PESOS, REGRAS, ROTULO_CURTO, ROTULO_DIMENSAO, SINAIS_PENDENTES_ENTRAM,
  SWEET_SPOT, TOLERANCIA, VERSAO_MODELO, type Classe, type Dimensao,
} from './prioridade-config';

/**
 * Prioridade integrada (experimental): motor de classes e adaptador de apresentação, funções puras.
 * Regras e limites em lib/prioridade-config.ts. Testes em scripts/tests/prioridade.test.mjs.
 * Nunca arredonda antes de classificar; compara limites com tolerância; nunca transforma ausência em nota.
 */

// ---------------------------------------------------------------- motor

export type Notas = Record<Dimensao, number>;

/** v ≥ limite, com a tolerância fixa da configuração */
export const atinge = (v: number, limite: number) => v >= limite - TOLERANCIA;

export function notaIntegrada(n: Notas): number {
  const peso = DIMENSOES.reduce((s, d) => s + PESOS[d], 0);
  return DIMENSOES.reduce((s, d) => s + n[d] * PESOS[d], 0) / peso;
}

export interface CriterioClasse {
  rotulo: string;
  dimensao: Dimensao | 'nota';
  atendido: boolean;
  valor: number;
  minimo: number;
}

function criterios(n: Notas, media: number, regra: { nota: number; minimos: Record<Dimensao, number> }): CriterioClasse[] {
  return [
    { rotulo: 'Nota integrada', dimensao: 'nota' as const, atendido: atinge(media, regra.nota), valor: media, minimo: regra.nota },
    ...DIMENSOES.map(d => ({ rotulo: ROTULO_DIMENSAO[d], dimensao: d, atendido: atinge(n[d], regra.minimos[d]), valor: n[d], minimo: regra.minimos[d] })),
  ];
}
export const criteriosA1 = (n: Notas, media = notaIntegrada(n)) => criterios(n, media, REGRAS.A1);
export const criteriosA2 = (n: Notas, media = notaIntegrada(n)) => criterios(n, media, REGRAS.A2);
/** Critérios de entrada no sweet spot (as regras da classe mais baixa dele, A2). */
export const criteriosSweet = (n: Notas, media = notaIntegrada(n)) => criterios(n, media, REGRAS[ENTRADA_SWEET_SPOT]);
export const noSweetSpot = (c: Classe) => SWEET_SPOT.includes(c);

/** Classe na ordem da configuração: C (trava), A1, A2, B1, B2. */
export function classificar(n: Notas): Classe {
  const media = notaIntegrada(n);
  if (!atinge(n.icp, REGRAS.C.icpAbaixoDe) || !atinge(media, REGRAS.C.notaAbaixoDe)) return 'C';
  if (criteriosA1(n, media).every(c => c.atendido)) return 'A1';
  if (criteriosA2(n, media).every(c => c.atendido)) return 'A2';
  if (atinge(media, REGRAS.B1.nota)) return 'B1';
  return 'B2';
}

/**
 * Nota mínima da dimensão faltante para a conta chegar a uma classe: o maior entre o que falta para a nota
 * integrada chegar ao piso da classe e o mínimo individual daquela dimensão. Acima de 5, é impossível (null).
 */
function notaMinimaPara(regra: { nota: number; minimos: Record<Dimensao, number> }, conhecidas: Partial<Notas>, faltante: Dimensao): number | null {
  const pesoTotal = DIMENSOES.reduce((s, d) => s + PESOS[d], 0);
  const soma = DIMENSOES.filter(d => d !== faltante).reduce((s, d) => s + (conhecidas[d] ?? 0) * PESOS[d], 0);
  const pelaMedia = (regra.nota * pesoTotal - soma) / PESOS[faltante];
  const minimo = Math.max(pelaMedia, regra.minimos[faltante]);
  return minimo > 5 + TOLERANCIA ? null : minimo;
}
export const notaMinimaParaA1 = (conhecidas: Partial<Notas>, faltante: Dimensao) => notaMinimaPara(REGRAS.A1, conhecidas, faltante);
/** Para entrar no sweet spot (regras de A2). */
export const notaMinimaParaSweet = (conhecidas: Partial<Notas>, faltante: Dimensao) => notaMinimaPara(REGRAS[ENTRADA_SWEET_SPOT], conhecidas, faltante);

// ---------------------------------------------------------------- adaptador

export type Mapeamento = 'documentado' | 'proposto' | 'pendente' | 'indisponivel';
export type MotivoSemNota = 'nao_coletado' | 'fora_do_intervalo' | 'metodo_nao_mapeado' | 'oculto_modo_apresentacao' | null;

export interface DimensaoIntegrada {
  nota: number | null;
  resumo: string | null;
  status: 'avaliada' | 'sem_avaliacao' | 'desatualizada';
  motivoSemNota: MotivoSemNota;
  semAchados: boolean;
  entraNoCalculo: boolean;
  motivoExclusao: string | null;
  dataReferencia: string | null;
  fontes: { url: string; titulo: string | null }[];
  /** origem do dado (tabela 5.3); a tela lê a mesma informação da configuração, então o transporte pode omitir */
  origem?: { campoOrigem: string | null; escalaOriginal: string | null; transformacao: string | null; mapeamento: Mapeamento };
  pendenciasQualidade: string[];
}

export type SituacaoSweetSpot = 'sweet_spot' | 'candidata' | 'fora_por_criterio' | 'fora_por_falta_de_dados' | 'fora_por_classe';

export interface VisaoIntegradaConta {
  contaId: string;
  dimensoes: Record<Dimensao, DimensaoIntegrada>;
  cobertura: number;
  notaIntegrada: number | null;
  classeIntegrada: Classe | null;
  versaoModelo: typeof VERSAO_MODELO;
  motivosClassificacao: string[];
  /** critérios de entrada no sweet spot (regras de A2) */
  criteriosSweet: CriterioClasse[] | null;
  criteriosSweetAtendidos: number | null;
  dimensoesFaltantes: Dimensao[];
  situacaoSweetSpot: SituacaoSweetSpot;
  investigacao: {
    dimensao: Dimensao;
    motivo: string | null;
    evidenciaNecessaria: string | null;
    /** nota mínima da dimensão faltante para entrar no sweet spot (A2) */
    notaMinimaParaSweet: number | null;
    /** e para chegar ao topo (A1); null se A1 já está fora de alcance */
    notaMinimaParaA1: number | null;
    podeChegarA1: boolean;
  } | null;
}

/** Auditoria web da conta (Oportunidade digital), já analisada; chave = domínio. */
export interface AuditoriaDigital {
  nivel: number;
  confianca: 'adequada' | 'parcial' | 'insuficiente';
  dataReferencia: string | null;
  fonte: string | null;
  resumo: string;
}

const linkSeguro = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
const vazio = (origem: DimensaoIntegrada['origem'], motivo: MotivoSemNota, resumo: string | null, pend: string[] = []): DimensaoIntegrada => ({
  nota: null, resumo, status: 'sem_avaliacao', motivoSemNota: motivo, semAchados: false, entraNoCalculo: false,
  motivoExclusao: resumo, dataReferencia: null, fontes: [], origem, pendenciasQualidade: pend,
});
const origemDe = (d: Dimensao): DimensaoIntegrada['origem'] => {
  const o = ORIGEM[d];
  return { campoOrigem: o.campoOrigem, escalaOriginal: o.escalaOriginal, transformacao: o.transformacao, mapeamento: o.mapeamento };
};

export function dimensaoIcp(c: Pick<Conta, 'icp' | 'tier'>): DimensaoIntegrada {
  const tier = (c.icp?.tier ?? c.tier ?? '').toUpperCase();
  if (!tier) return vazio(origemDe('icp'), 'nao_coletado', 'Tier ICP ainda não classificado.');
  const nota = ORIGEM.icp.nota[tier];
  if (nota === undefined) return vazio(origemDe('icp'), 'fora_do_intervalo', 'Tier ICP fora de A/B/C.', [`tier "${tier}" fora de A/B/C`]);
  return {
    nota, resumo: `Tier ${tier}${c.icp?.motivos?.length ? `: ${c.icp.motivos.slice(0, 3).join(' · ')}` : ''}`, status: 'avaliada', motivoSemNota: null,
    semAchados: false, entraNoCalculo: true, motivoExclusao: null, dataReferencia: null, fontes: [], origem: origemDe('icp'), pendenciasQualidade: [],
  };
}

export function dimensaoSinais(
  c: Pick<Conta, 'score' | 'scorePendente' | 'v2'>,
  fatos: { data: string; url?: string; fonte?: string }[] = [],
): DimensaoIntegrada {
  const v = c.score;
  if (typeof v !== 'number' || !Number.isFinite(v)) return vazio(origemDe('sinais'), 'nao_coletado', 'VSCS ainda não calculado.');
  if (v < 0 || v > 100) return vazio(origemDe('sinais'), 'fora_do_intervalo', 'VSCS fora de 0–100.', [`VSCS ${v} fora do intervalo 0–100`]);
  const pend = c.scorePendente ? ['VSCS pendente de certificação pelo motor'] : [];
  const entra = !c.scorePendente || SINAIS_PENDENTES_ENTRAM;
  const ordenados = [...fatos].sort((a, b) => b.data.localeCompare(a.data));
  return {
    nota: 1 + (4 * v) / 100,
    resumo: v === 0 ? 'Nenhum sinal relevante encontrado' : `VSCS ${Math.round(v)}${c.v2?.sinais_contados ? ` · ${c.v2.sinais_contados} fatos` : ''}`,
    status: 'avaliada', motivoSemNota: null, semAchados: v === 0, entraNoCalculo: entra,
    motivoExclusao: entra ? null : 'VSCS pendente de certificação', dataReferencia: ordenados[0]?.data ?? null,
    fontes: ordenados.flatMap(f => (linkSeguro(f.url) ? [{ url: f.url!, titulo: f.fonte ?? null }] : [])).slice(0, 3),
    origem: origemDe('sinais'), pendenciasQualidade: pend,
  };
}

export function dimensaoClima(): DimensaoIntegrada {
  return vazio(origemDe('clima'), 'metodo_nao_mapeado', ORIGEM.clima.motivo);
}

export function dimensaoDigital(auditoria: AuditoriaDigital | undefined, agora: Date): DimensaoIntegrada {
  if (!auditoria) return vazio(origemDe('oportunidadeDigital'), 'nao_coletado', 'Domínio ainda sem auditoria web.');
  if (auditoria.nivel === 0 || auditoria.confianca === 'insuficiente')
    return { ...vazio(origemDe('oportunidadeDigital'), 'nao_coletado', 'Auditoria web inconclusiva (páginas ou evidências insuficientes).'), dataReferencia: auditoria.dataReferencia };
  const nota = ORIGEM.oportunidadeDigital.nota[auditoria.nivel];
  if (nota === undefined)
    return vazio(origemDe('oportunidadeDigital'), 'fora_do_intervalo', 'Nível de maturidade fora de L1–L5.', [`nível ${auditoria.nivel} fora de L1–L5`]);
  const idadeDias = auditoria.dataReferencia ? (agora.getTime() - Date.parse(auditoria.dataReferencia)) / 86_400_000 : null;
  const velha = idadeDias !== null && idadeDias > ORIGEM.oportunidadeDigital.validadeDias;
  return {
    nota, resumo: auditoria.resumo, status: velha ? 'desatualizada' : 'avaliada', motivoSemNota: null, semAchados: false,
    entraNoCalculo: !velha, motivoExclusao: velha ? `Auditoria com mais de ${ORIGEM.oportunidadeDigital.validadeDias} dias` : null,
    dataReferencia: auditoria.dataReferencia, fontes: linkSeguro(auditoria.fonte) ? [{ url: auditoria.fonte!, titulo: 'Evidência da auditoria' }] : [],
    origem: origemDe('oportunidadeDigital'), pendenciasQualidade: auditoria.confianca === 'parcial' ? ['auditoria com cobertura parcial'] : [],
  };
}

const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',');
export const formatarNota = fmt1;
export const formatarIntegrada = (v: number) => v.toFixed(2).replace('.', ',');

/** Junta as quatro dimensões e aplica as regras: classe, sweet spot, proximidade e investigação. */
export function visaoIntegrada(
  contaId: string,
  dimensoes: Record<Dimensao, DimensaoIntegrada>,
  { ocultas = [] }: { ocultas?: Dimensao[] } = {},
): VisaoIntegradaConta {
  // dimensão oculta no modo apresentação conta como faltante, para a classe não revelar o valor escondido
  const dims = { ...dimensoes };
  for (const d of ocultas)
    dims[d] = { ...dims[d], nota: null, entraNoCalculo: false, motivoSemNota: 'oculto_modo_apresentacao', resumo: 'Indisponível nesta visão', fontes: [], status: 'sem_avaliacao' };
  const validas = DIMENSOES.filter(d => dims[d].nota !== null && dims[d].entraNoCalculo);
  const faltantes = DIMENSOES.filter(d => !validas.includes(d));
  const base = { contaId, dimensoes: dims, cobertura: validas.length, versaoModelo: VERSAO_MODELO, dimensoesFaltantes: faltantes };

  if (!faltantes.length) {
    const n = Object.fromEntries(DIMENSOES.map(d => [d, dims[d].nota!])) as Notas;
    const media = notaIntegrada(n);
    const classe = classificar(n);
    const crit = criteriosSweet(n, media);
    const motivos =
      classe === 'C'
        ? [!atinge(n.icp, REGRAS.C.icpAbaixoDe) ? `ICP ${fmt1(n.icp)} abaixo de ${fmt1(REGRAS.C.icpAbaixoDe)} (trava)` : `Nota integrada ${formatarIntegrada(media)} abaixo de ${fmt1(REGRAS.C.notaAbaixoDe)}`]
        : crit.filter(c => !c.atendido).map(c => `${c.rotulo} ${c.dimensao === 'nota' ? formatarIntegrada(c.valor) : fmt1(c.valor)}, falta ${fmt1(Math.round((c.minimo - c.valor) * 100) / 100)}`);
    return {
      ...base, notaIntegrada: media, classeIntegrada: classe, motivosClassificacao: noSweetSpot(classe) ? [] : motivos, criteriosSweet: crit,
      criteriosSweetAtendidos: crit.filter(c => c.atendido).length, situacaoSweetSpot: noSweetSpot(classe) ? 'sweet_spot' : 'fora_por_classe', investigacao: null,
    };
  }

  const semClasse = { ...base, notaIntegrada: null, classeIntegrada: null, criteriosSweet: null, criteriosSweetAtendidos: null };
  if (faltantes.length >= 2)
    return { ...semClasse, motivosClassificacao: [`Faltam ${faltantes.map(d => ROTULO_CURTO[d]).join(', ')}`], situacaoSweetSpot: 'fora_por_falta_de_dados', investigacao: null };

  // uma faltando: teste de viabilidade com a faltante em 5,0 (só para o teste; nunca exibido nem guardado)
  const falta = faltantes[0]!;
  const conhecidas = Object.fromEntries(validas.map(d => [d, dims[d].nota!])) as Partial<Notas>;
  const teste = { ...conhecidas, [falta]: 5 } as Notas;
  const media = notaIntegrada(teste);
  const quebram = criteriosSweet(teste, media).filter(c => !c.atendido && c.dimensao !== falta);
  const minima = notaMinimaParaSweet(conhecidas, falta);
  const podeChegarA1 = criteriosA1(teste, media).every(c => c.atendido);
  if (quebram.length || minima === null) {
    const motivos = quebram
      .filter(c => c.dimensao !== 'nota')
      .map(c => `${c.rotulo} ${fmt1(c.valor)} < ${fmt1(c.minimo)}`);
    return {
      ...semClasse,
      // o teto usa a faltante no máximo da escala; mostra só o teto da média, nunca a nota de teste
      motivosClassificacao: motivos.length ? motivos : [`Teto da nota integrada ${formatarIntegrada(media)} (o sweet spot pede ${formatarIntegrada(REGRAS[ENTRADA_SWEET_SPOT].nota)})`],
      situacaoSweetSpot: 'fora_por_criterio',
      investigacao: null,
    };
  }
  return {
    ...semClasse,
    motivosClassificacao: [`Investigar ${ROTULO_DIMENSAO[falta]}: precisa de nota ≥ ${fmt1(Math.ceil(minima * 10 - 1e-6) / 10)} para o sweet spot`],
    situacaoSweetSpot: 'candidata',
    investigacao: {
      dimensao: falta, motivo: dims[falta].resumo, evidenciaNecessaria: EVIDENCIA_NECESSARIA[falta],
      notaMinimaParaSweet: minima, notaMinimaParaA1: notaMinimaParaA1(conhecidas, falta), podeChegarA1,
    },
  };
}

export { CLASSES };
