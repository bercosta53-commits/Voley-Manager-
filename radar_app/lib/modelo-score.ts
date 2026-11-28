/**
 * Resumo legível do motor de score gravado no snapshot (payload.scoreModelo e payload.scoreModeloDC). A tela
 * Métricas → Como calcula lê daqui: os números vêm do motor, não de constantes no app (motor único). Sem os
 * blocos (bases antigas), devolve null e a tela mostra só a explicação geral. Função pura; testes em
 * scripts/tests/modelo-score.test.mjs.
 */

export interface ItemModelo {
  rotulo: string;
  texto: string;
}

export interface ResumoModelo {
  versao: string;
  aprovadoEm: string | null;
  estado: string | null;
  itens: ItemModelo[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const br = (v: number) => String(v).replace('.', ',');
const ROTULO_SENIORIDADE: Record<string, string> = {
  cLevelReceita: 'C-level de receita',
  diretoriaReceita: 'diretoria de receita',
  head: 'head',
  gerencia: 'gerência',
  coordenacao: 'coordenação',
  especialistaGTM: 'especialista de GTM',
  operacional: 'operacional',
};
const ROTULO_CATEGORIA: Record<string, string> = { lideranca: 'liderança', expansao: 'expansão', contratacao: 'contratação', gtm: 'GTM', intencao: 'intenção', contexto: 'contexto' };
const cat = (k: string) => ROTULO_CATEGORIA[k] ?? k;
const ROTULO_JANELA: Record<string, string> = {
  intencao: 'intenção',
  vaga_area_alvo: 'vaga na área-alvo',
  vaga_bloco: 'bloco de vagas',
  lancamento_produto: 'lançamento de produto',
  declaracao_expansao: 'declaração de expansão',
  fusao: 'fusão',
  aquisicao_feita: 'aquisição feita',
  nova_parceria: 'nova parceria',
  expansao_comercial: 'expansão comercial',
  captacao: 'captação',
  nova_filial: 'nova filial',
  vaga_lideranca_alvo: 'vaga de liderança-alvo',
  padrao: 'demais',
};

export function resumoModelo(base: { scoreVersao?: string } & Obj): ResumoModelo | null {
  const m = obj(base.scoreModelo);
  const dc = obj(base.scoreModeloDC);
  const versao = (typeof m?.versao === 'string' && m.versao) || (typeof dc?.versao === 'string' && dc.versao) || base.scoreVersao;
  if (!versao || (!m && !dc)) return null;
  const itens: ItemModelo[] = [];

  const sen = obj(m?.senioridade);
  if (sen) {
    const pares = Object.entries(sen)
      .filter(([, v]) => n(v) !== null)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([k, v]) => `${ROTULO_SENIORIDADE[k] ?? k} ${v}`);
    if (pares.length) itens.push({ rotulo: 'Base por senioridade do cargo', texto: pares.join(' · ') });
  }
  if (typeof m?.contexto === 'string') itens.push({ rotulo: 'Cargo comprovado, não palavra solta', texto: m.contexto });
  const vagas = obj(m?.vagasOperacionais);
  if (vagas || typeof m?.criterio === 'string') {
    const tabela = vagas
      ? `Base por quantidade de vagas operacionais: ${Object.entries(vagas)
          .sort((a, b) => Number(a[1]) - Number(b[1]))
          .map(([k, v]) => `${k} → ${v}`)
          .join(' · ')}. `
      : '';
    itens.push({ rotulo: `Vagas agrupadas em ${n(m?.janelaAgrupamentoDias) ?? 30} dias`, texto: tabela + (typeof m?.criterio === 'string' ? m.criterio : '') });
  }
  const c = obj(dc?.dc);
  if (c) {
    const nao = Array.isArray(c.nao_corrobora) ? (c.nao_corrobora as string[]).map(cat).join(', ') : null;
    itens.push({
      rotulo: 'Corroboração',
      texto: [
        n(c.max_corroboradores) !== null && `Até ${c.max_corroboradores} fatos corroboram o principal`,
        n(c.mesma_categoria) !== null && `da mesma categoria valem ${br(c.mesma_categoria as number)}`,
        nao && `${nao} não corrobora`,
      ]
        .filter(Boolean)
        .join('; ') + '.',
    });
  }
  const f90 = obj(dc?.faixa_90);
  if (f90 && n(f90.teto_sem_requisitos) !== null) {
    const cats = Array.isArray(f90.categorias_gtm) ? (f90.categorias_gtm as string[]).map(cat).join(', ') : '';
    itens.push({
      rotulo: `Teto de ${br(f90.teto_sem_requisitos as number)} sem requisitos`,
      texto: `Passar de ${br(f90.teto_sem_requisitos as number)} exige materialidade de ${f90.materialidade_minima ?? '—'} ou mais, fonte do fato principal de ${br((f90.fonte_minima_dominante as number) ?? 0)} ou mais e dos corroboradores de ${br((f90.fonte_minima_corroborador as number) ?? 0)} ou mais${cats ? `, em categorias de GTM (${cats})` : ''}.`,
    });
  }
  const lid = obj(dc?.lideranca_nomeada);
  if (lid && n(lid.expira_dia) !== null) {
    const fase = (k: string) => n(obj(lid[k])?.ate_dia);
    itens.push({
      rotulo: 'Liderança nomeada tem fases',
      texto: `Diagnóstico até o dia ${fase('diagnostico') ?? '—'}, subida até ${fase('subida') ?? '—'}, transição até ${fase('transicao') ?? '—'}, implementação até ${fase('implementacao') ?? '—'}; deixa de contar no dia ${lid.expira_dia}.`,
    });
  }
  const jan = obj(dc?.janela_acao_dias);
  if (jan) {
    const pares = Object.entries(jan)
      .filter(([, v]) => n(v) !== null)
      .sort((a, b) => (a[1] as number) - (b[1] as number))
      .map(([k, v]) => `${ROTULO_JANELA[k] ?? k.replace(/_/g, ' ')} ${v} d`);
    itens.push({ rotulo: 'Janela para agir, por tipo de fato', texto: pares.join(' · ') });
  }
  if (typeof dc?.ativacao_comercial === 'string') itens.push({ rotulo: 'Ativação comercial', texto: dc.ativacao_comercial });

  return {
    versao,
    aprovadoEm: typeof m?.aprovadoEm === 'string' ? m.aprovadoEm : null,
    estado: typeof dc?.estado === 'string' ? dc.estado : null,
    itens,
  };
}
