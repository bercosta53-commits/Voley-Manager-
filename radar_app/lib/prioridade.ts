import type { Conta } from './tipos';
import {
  CLASSES, DIMENSOES, ENTRADA_SWEET_SPOT, EVIDENCIA_NECESSARIA, ORIGEM, PESOS, REGRAS, ROTULO_CURTO, ROTULO_DIMENSAO, SINAIS_PENDENTES_ENTRAM,
  SWEET_SPOT, TOLERANCIA, VERSAO_MODELO, ajusteClima, type Classe, type Dimensao, type ModoClima,
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

/**
 * Nota integrada. Modo 'media': média ponderada das dimensões presentes (com três avaliadas, a média é das três).
 * Modo 'ancorado': média de ICP, Sinais e Digital presentes, ajustada pelo Clima em até ±0,25.
 */
export function notaIntegrada(n: Partial<Notas>, modo: ModoClima = 'media'): number {
  if (modo === 'ancorado') {
    const ds = DIMENSOES.filter(d => d !== 'clima' && n[d] !== undefined);
    if (!ds.length) return n.clima ?? 0;
    return ds.reduce((s, d) => s + n[d]!, 0) / ds.length + (n.clima === undefined ? 0 : ajusteClima(n.clima));
  }
  const ds = DIMENSOES.filter(d => n[d] !== undefined);
  const peso = ds.reduce((s, d) => s + PESOS[d], 0);
  return ds.reduce((s, d) => s + n[d]! * PESOS[d], 0) / peso;
}

export interface CriterioClasse {
  rotulo: string;
  dimensao: Dimensao | 'nota';
  atendido: boolean;
  valor: number;
  minimo: number;
}

function criterios(n: Partial<Notas>, media: number, regra: { nota: number; minimos: Record<Dimensao, number> }): CriterioClasse[] {
  return [
    { rotulo: 'Nota integrada', dimensao: 'nota' as const, atendido: atinge(media, regra.nota), valor: media, minimo: regra.nota },
    ...DIMENSOES.filter(d => n[d] !== undefined).map(d => ({ rotulo: ROTULO_DIMENSAO[d], dimensao: d, atendido: atinge(n[d]!, regra.minimos[d]), valor: n[d]!, minimo: regra.minimos[d] })),
  ];
}
export const criteriosA1 = (n: Partial<Notas>, media = notaIntegrada(n)) => criterios(n, media, REGRAS.A1);
export const criteriosA2 = (n: Partial<Notas>, media = notaIntegrada(n)) => criterios(n, media, REGRAS.A2);
/** Critérios de entrada no sweet spot (as regras da classe mais baixa dele, A2). */
export const criteriosSweet = (n: Partial<Notas>, media = notaIntegrada(n)) => criterios(n, media, REGRAS[ENTRADA_SWEET_SPOT]);
export const noSweetSpot = (c: Classe) => SWEET_SPOT.includes(c);

/** Classe na ordem da configuração: C (trava), A1, A2, B1, B2. */
export function classificar(n: Partial<Notas>, modo: ModoClima = 'media'): Classe {
  const media = notaIntegrada(n, modo);
  if ((n.icp !== undefined && !atinge(n.icp, REGRAS.C.icpAbaixoDe)) || !atinge(media, REGRAS.C.notaAbaixoDe)) return 'C';
  if (criteriosA1(n, media).every(c => c.atendido)) return 'A1';
  if (criteriosA2(n, media).every(c => c.atendido)) return 'A2';
  if (atinge(media, REGRAS.B1.nota)) return 'B1';
  return 'B2';
}

/**
 * Nota mínima da dimensão faltante para a conta chegar a uma classe: o maior entre o que falta para a nota
 * integrada chegar ao piso da classe e o mínimo individual daquela dimensão. Acima de 5, é impossível (null).
 */
function notaMinimaPara(regra: { nota: number; minimos: Record<Dimensao, number> }, conhecidas: Partial<Notas>, faltante: Dimensao, modo: ModoClima = 'media'): number | null {
  if (modo === 'ancorado') {
    const outras = DIMENSOES.filter(d => d !== 'clima' && d !== faltante);
    if (faltante === 'clima') {
      // o ajuste que falta para a média das três chegar ao piso; acima de ±0,25 não há Clima que resolva
      const media3 = outras.reduce((s, d) => s + (conhecidas[d] ?? 0), 0) / outras.length;
      const precisa = regra.nota - media3;
      if (precisa > 0.25 + TOLERANCIA) return null;
      return Math.max(regra.minimos.clima, Math.min(5, 3 + 4 * precisa));
    }
    const ajuste = conhecidas.clima === undefined ? 0 : ajusteClima(conhecidas.clima);
    const pelaMedia = (regra.nota - ajuste) * (outras.length + 1) - outras.reduce((s, d) => s + (conhecidas[d] ?? 0), 0);
    const minimo = Math.max(pelaMedia, regra.minimos[faltante]);
    return minimo > 5 + TOLERANCIA ? null : minimo;
  }
  const pesoTotal = DIMENSOES.reduce((s, d) => s + PESOS[d], 0);
  const soma = DIMENSOES.filter(d => d !== faltante).reduce((s, d) => s + (conhecidas[d] ?? 0) * PESOS[d], 0);
  const pelaMedia = (regra.nota * pesoTotal - soma) / PESOS[faltante];
  const minimo = Math.max(pelaMedia, regra.minimos[faltante]);
  return minimo > 5 + TOLERANCIA ? null : minimo;
}
export const notaMinimaParaA1 = (conhecidas: Partial<Notas>, faltante: Dimensao, modo: ModoClima = 'media') => notaMinimaPara(REGRAS.A1, conhecidas, faltante, modo);
/** Para entrar no sweet spot (regras de A2). */
export const notaMinimaParaSweet = (conhecidas: Partial<Notas>, faltante: Dimensao, modo: ModoClima = 'media') => notaMinimaPara(REGRAS[ENTRADA_SWEET_SPOT], conhecidas, faltante, modo);

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
  /** só no Clima: a nota do cálculo anterior (contexto 3 + 2·S), usada no modo 'media' e na comparação */
  notaClassica?: number | null;
}

export type SituacaoSweetSpot = 'sweet_spot' | 'candidata' | 'fora_por_criterio' | 'fora_por_falta_de_dados' | 'fora_por_classe';

export interface VisaoIntegradaConta {
  contaId: string;
  dimensoes: Record<Dimensao, DimensaoIntegrada>;
  cobertura: number;
  notaIntegrada: number | null;
  classeIntegrada: Classe | null;
  versaoModelo: typeof VERSAO_MODELO;
  /** como o Clima entrou na nota */
  modoClima: ModoClima;
  /** no modo ancorado: a classe que a conta teria no cálculo anterior (Clima com peso 0,5), para comparar */
  classeAnterior?: Classe | null;
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

export interface ClimaDaConta {
  nome: string;
  estado: string;
  S: number;
  confianca?: string;
  dataReferencia: string;
  fontes?: { nome?: string; url: string }[];
}

/** Pulso do setor para a conta (lib/clima-pulso.ts): clima composto relativo à média da base e contra a maré. */
export interface PulsoDaConta {
  /** clima composto da vertical (contexto 35% + pulso 65%), −1 a +1 */
  composto: number;
  /** composto menos a média da base */
  relativo: number;
  contraMare: boolean;
}

/**
 * Clima do setor da conta (vertical do Clima pelo código de especialização). É avaliação editorial sobre
 * indicadores reais com data e fonte; a edição tem validade de 21 dias. Sem edição ou vertical, sem nota.
 * - Nota clássica (contexto): 3 + 2·S, de 1 a 5.
 * - Com o pulso (modo ancorado): 3 + 2 × clima composto relativo à base; conta contra a maré não fica abaixo de 3.
 *   A nota clássica vai junto (notaClassica), para o modo 'media' e a comparação.
 */
export function dimensaoClima(clima?: ClimaDaConta | null, agora: Date = new Date(), pulso?: PulsoDaConta | null): DimensaoIntegrada {
  if (!clima) return vazio(origemDe('clima'), 'metodo_nao_mapeado', ORIGEM.clima.motivo);
  const classica = Math.round(Math.min(5, Math.max(1, 3 + 2 * clima.S)) * 10) / 10;
  const doPulso = pulso ? Math.round(Math.min(5, Math.max(pulso.contraMare ? 3 : 1, 3 + 2 * pulso.relativo)) * 10) / 10 : null;
  const nota = doPulso ?? classica;
  const idade = (agora.getTime() - Date.parse(clima.dataReferencia)) / 86_400_000;
  const velha = idade > ORIGEM.clima.validadeDias;
  const sinal = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(2).replace('.', ',')}`;
  const leitura = pulso
    ? ` · composto ${sinal(pulso.composto)}, ${pulso.relativo >= 0.05 ? 'acima' : pulso.relativo <= -0.05 ? 'abaixo' : 'na'} da média${pulso.contraMare ? ' · cresce contra a maré' : ''}`
    : '';
  return {
    nota,
    ...(doPulso !== null && { notaClassica: classica }),
    resumo: `${clima.estado} · ${clima.nome}${leitura}`,
    status: velha ? 'desatualizada' : 'avaliada',
    motivoSemNota: null,
    semAchados: false,
    entraNoCalculo: !velha,
    motivoExclusao: velha ? `Edição do Clima com mais de ${ORIGEM.clima.validadeDias} dias` : null,
    dataReferencia: clima.dataReferencia,
    fontes: (clima.fontes ?? []).flatMap(f => (linkSeguro(f.url) ? [{ url: f.url, titulo: f.nome ?? null }] : [])).slice(0, 3),
    origem: origemDe('clima'),
    pendenciasQualidade: clima.confianca && clima.confianca !== 'Alta' ? [`confiança ${clima.confianca.toLowerCase()} na leitura do setor`] : [],
  };
}

export function dimensaoDigital(auditoria: AuditoriaDigital | undefined, agora: Date): DimensaoIntegrada {
  if (!auditoria) return vazio(origemDe('oportunidadeDigital'), 'nao_coletado', 'Domínio ainda sem auditoria web.');
  // nível 0: sem classificação. Confiança insuficiente (sem página válida auditada) entra com o nível provisório
  // do Atlas e fica marcada como pendência de qualidade (decisão de 27/11: toda a base reclassificada conta)
  if (auditoria.nivel === 0)
    return { ...vazio(origemDe('oportunidadeDigital'), 'nao_coletado', 'Auditoria web inconclusiva (páginas ou evidências insuficientes).'), dataReferencia: auditoria.dataReferencia };
  const nota = ORIGEM.oportunidadeDigital.nota[auditoria.nivel];
  if (nota === undefined)
    return vazio(origemDe('oportunidadeDigital'), 'fora_do_intervalo', 'Nível de maturidade fora de L1–L4.', [`nível ${auditoria.nivel} fora de L1–L4`]);
  const idadeDias = auditoria.dataReferencia ? (agora.getTime() - Date.parse(auditoria.dataReferencia)) / 86_400_000 : null;
  const velha = idadeDias !== null && idadeDias > ORIGEM.oportunidadeDigital.validadeDias;
  return {
    nota, resumo: auditoria.confianca === 'insuficiente' ? `${auditoria.resumo} (provisório)` : auditoria.resumo, status: velha ? 'desatualizada' : 'avaliada', motivoSemNota: null, semAchados: false,
    entraNoCalculo: !velha, motivoExclusao: velha ? `Auditoria com mais de ${ORIGEM.oportunidadeDigital.validadeDias} dias` : null,
    dataReferencia: auditoria.dataReferencia, fontes: linkSeguro(auditoria.fonte) ? [{ url: auditoria.fonte!, titulo: 'Evidência da auditoria' }] : [],
    origem: origemDe('oportunidadeDigital'), pendenciasQualidade: auditoria.confianca === 'parcial' ? ['auditoria com cobertura parcial'] : auditoria.confianca === 'insuficiente' ? ['nível provisório: sem página válida auditada'] : [],
  };
}

const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',');
export const formatarNota = fmt1;
export const formatarIntegrada = (v: number) => v.toFixed(2).replace('.', ',');

/** Junta as quatro dimensões e aplica as regras: classe, sweet spot, proximidade e investigação. */
export function visaoIntegrada(
  contaId: string,
  dimensoes: Record<Dimensao, DimensaoIntegrada>,
  { ocultas = [], modoClima = 'media' }: { ocultas?: Dimensao[]; modoClima?: ModoClima } = {},
): VisaoIntegradaConta {
  const modo = modoClima;
  // dimensão oculta no modo apresentação conta como faltante, para a classe não revelar o valor escondido
  const dims = { ...dimensoes };
  // cálculo anterior: o Clima volta a ser o do contexto (3 + 2·S)
  if (modo === 'media' && dims.clima.notaClassica !== undefined && dims.clima.notaClassica !== null) dims.clima = { ...dims.clima, nota: dims.clima.notaClassica };
  for (const d of ocultas)
    dims[d] = { ...dims[d], nota: null, entraNoCalculo: false, motivoSemNota: 'oculto_modo_apresentacao', resumo: 'Indisponível nesta visão', fontes: [], status: 'sem_avaliacao' };
  const validas = DIMENSOES.filter(d => dims[d].nota !== null && dims[d].entraNoCalculo);
  const faltantes = DIMENSOES.filter(d => !validas.includes(d));
  const base = { contaId, dimensoes: dims, cobertura: validas.length, versaoModelo: VERSAO_MODELO, modoClima: modo, dimensoesFaltantes: faltantes };

  // quatro avaliadas, ou três (decisão de 27/11: faltar uma não desclassifica; média e mínimos das três)
  if (faltantes.length <= 1) {
    const n = Object.fromEntries(validas.map(d => [d, dims[d].nota!])) as Partial<Notas>;
    const media = notaIntegrada(n, modo);
    const classe = classificar(n, modo);
    const crit = criteriosSweet(n, media);
    // comparação com o cálculo anterior (só no modo ancorado)
    const nAnterior = { ...n, ...(n.clima !== undefined && dims.clima.notaClassica != null ? { clima: dims.clima.notaClassica } : {}) };
    const classeAnterior = modo === 'ancorado' ? classificar(nAnterior, 'media') : undefined;
    const motivos =
      classe === 'C'
        ? [n.icp !== undefined && !atinge(n.icp, REGRAS.C.icpAbaixoDe) ? `ICP ${fmt1(n.icp)} abaixo de ${fmt1(REGRAS.C.icpAbaixoDe)} (trava)` : `Nota integrada ${formatarIntegrada(media)} abaixo de ${fmt1(REGRAS.C.notaAbaixoDe)}`]
        : crit.filter(c => !c.atendido).map(c => `${c.rotulo} ${c.dimensao === 'nota' ? formatarIntegrada(c.valor) : fmt1(c.valor)}, falta ${fmt1(Math.round((c.minimo - c.valor) * 100) / 100)}`);
    const falta = faltantes[0];
    const aviso = falta ? [`Classificada com 3 de 4: falta avaliar ${ROTULO_DIMENSAO[falta]}`] : [];
    return {
      ...base, notaIntegrada: media, classeIntegrada: classe, classeAnterior, motivosClassificacao: noSweetSpot(classe) ? aviso : [...motivos, ...aviso], criteriosSweet: crit,
      criteriosSweetAtendidos: crit.filter(c => c.atendido).length, situacaoSweetSpot: noSweetSpot(classe) ? 'sweet_spot' : 'fora_por_classe',
      investigacao: falta
        ? {
            dimensao: falta, motivo: dims[falta].resumo, evidenciaNecessaria: EVIDENCIA_NECESSARIA[falta],
            // só há nota que resolve se as outras dimensões já cumprem os mínimos (senão, a trava é outra)
            notaMinimaParaSweet: noSweetSpot(classe) || !crit.every(c => c.dimensao === 'nota' || c.atendido) ? null : notaMinimaParaSweet(n, falta, modo),
            notaMinimaParaA1: criteriosA1(n, media).every(c => c.dimensao === 'nota' || c.atendido) ? notaMinimaParaA1(n, falta, modo) : null,
            podeChegarA1: criteriosA1(n, media).every(c => c.dimensao === 'nota' || c.atendido) && notaMinimaParaA1(n, falta, modo) !== null,
          }
        : null,
    };
  }

  const semClasse = { ...base, notaIntegrada: null, classeIntegrada: null, criteriosSweet: null, criteriosSweetAtendidos: null };
  if (faltantes.length >= 2)
    return { ...semClasse, motivosClassificacao: [`Faltam ${faltantes.map(d => ROTULO_CURTO[d]).join(', ')}`], situacaoSweetSpot: 'fora_por_falta_de_dados', investigacao: null };

  // uma faltando: teste de viabilidade com a faltante em 5,0 (só para o teste; nunca exibido nem guardado)
  const falta = faltantes[0]!;
  const conhecidas = Object.fromEntries(validas.map(d => [d, dims[d].nota!])) as Partial<Notas>;
  const teste = { ...conhecidas, [falta]: 5 } as Notas;
  const media = notaIntegrada(teste, modo);
  const quebram = criteriosSweet(teste, media).filter(c => !c.atendido && c.dimensao !== falta);
  const minima = notaMinimaParaSweet(conhecidas, falta, modo);
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
      notaMinimaParaSweet: minima, notaMinimaParaA1: notaMinimaParaA1(conhecidas, falta, modo), podeChegarA1,
    },
  };
}

export { CLASSES };
