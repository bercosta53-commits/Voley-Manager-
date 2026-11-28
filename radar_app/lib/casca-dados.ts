import type { Base, Conta, Pessoa, Sinal } from './tipos';

/**
 * S-1: o que a casca (menu, Cmd+K, aviso de frescor) precisa da base, e nada mais. As telas que não usam a base
 * inteira mandam só isto ao navegador, em vez dos 1,5 MB do snapshot. Função pura; testes em
 * scripts/tests/casca-dados.test.mjs.
 */

/** Campos de conta que a busca (Cmd+K), a pergunta em português (lib/filtros.ts) e o menu leem. */
export type ContaIndice = Pick<
  Conta,
  'id' | 'nome' | 'razaoSocial' | 'cnpj' | 'dominio' | 'cidade' | 'uf' | 'segmento' | 'braco' | 'tier' | 'statusComercial' | 'tendencia' | 'score' | 'subsegmentoTI'
> & {
  especializacao?: { nome: string };
  qualificada?: { status: Exclude<Conta['qualificada'], undefined>['status'] };
  comite: Pick<Pessoa, 'nome' | 'cargo'>[];
};
export type SinalIndice = Pick<Sinal, 'id' | 'contaId'>;

export interface BaseCasca {
  geradoEm: string;
  atualizadoEm?: Base['atualizadoEm'];
  ficticia?: boolean;
  fontes: Base['fontes'];
  contas: ContaIndice[];
  sinais: SinalIndice[];
}

export function paraCasca(base: Base): BaseCasca {
  return {
    geradoEm: base.geradoEm,
    atualizadoEm: base.atualizadoEm,
    ficticia: base.ficticia,
    fontes: base.fontes,
    contas: base.contas.map(c => ({
      id: c.id,
      nome: c.nome,
      razaoSocial: c.razaoSocial,
      cnpj: c.cnpj,
      dominio: c.dominio,
      cidade: c.cidade,
      uf: c.uf,
      segmento: c.segmento,
      braco: c.braco,
      tier: c.tier,
      statusComercial: c.statusComercial,
      tendencia: c.tendencia,
      score: c.score,
      ...(c.subsegmentoTI && { subsegmentoTI: c.subsegmentoTI }),
      ...(c.especializacao && { especializacao: { nome: c.especializacao.nome } }),
      ...(c.qualificada && { qualificada: { status: c.qualificada.status } }),
      comite: (c.comite ?? []).map(p => ({ nome: p.nome, cargo: p.cargo })),
    })),
    sinais: base.sinais.map(s => ({ id: s.id, contaId: s.contaId })),
  };
}

export interface Alivio {
  /** decomposição do score (Parcela[]) e contribuições do VSCS: só a tela que mostra "de onde vem o score" usa */
  decomposicao?: 'todas' | 'com_sinal' | 'nenhuma';
  historico?: 'todo' | 'mais_recente' | 'nenhum';
  serie?: boolean;
  /** contas que mantêm a decomposição mesmo com decomposicao 'nenhuma' (ex.: o exemplo da metodologia) */
  manter?: string[];
}

/**
 * S-1: a base com os campos pesados que a tela não usa esvaziados (mesma forma de Base, então a tela não muda).
 * Nada é inventado: o campo ou vem inteiro, ou vem vazio, ou vem só o item mais recente.
 */
/**
 * Campos do topo do snapshot que as telas leem. O snapshot real carrega também blocos de trabalho do pipeline
 * (OGI, Atlas de aquisição, auditorias e simulações do VSCS): ficam no servidor, que os usa antes de montar a tela,
 * e não vão ao navegador. scoreModelo e scoreModeloDC são pequenos e explicam o motor em Métricas.
 */
const CAMPOS_DA_TELA = ['geradoEm', 'scoreVersao', 'atualizadoEm', 'contas', 'sinais', 'fontes', 'agenda', 'varreduras', 'ficticia', 'diagnostico', 'scoreModelo', 'scoreModeloDC'] as const;
/** campos da conta que nenhuma tela lê (gravados pelo pipeline para auditoria) */
const FORA_DA_TELA_CONTA = ['aquisicaoDigital', 'pesquisaSinais', 'receitaApolloNaoAuditada'] as const;

type Requalificacao = NonNullable<NonNullable<Base['contas'][number]['icpEvidencia']>['requalificacao2G']>;
/** os campos da requalificação que lib/icp.ts lê; justificativas, URLs e histórico ficam no servidor */
function requalificacaoDaTela(r: Requalificacao): Requalificacao {
  const gatilhos = r.gatilhos
    ? Object.fromEntries(Object.entries(r.gatilhos).map(([k, g]) => [k, g ? { status: g.status, contaParaTierA: g.contaParaTierA } : g]))
    : undefined;
  return {
    ...(r.status !== undefined && { status: r.status }),
    ...(r.ramoAvaliado !== undefined && { ramoAvaliado: r.ramoAvaliado }),
    ...(r.modeloAvaliado !== undefined && { modeloAvaliado: r.modeloAvaliado }),
    ...(r.sede && { sede: { uf: r.sede.uf, url: r.sede.url } }),
    ...(r.faturamento && { faturamento: { status: r.faturamento.status } }),
    ...(r.pendencias && { pendencias: r.pendencias }),
    ...(gatilhos && { gatilhos }),
  } as Requalificacao;
}

const semMovimentos = <T extends object>(v2: T): T => {
  const { movimentos: _m, ...resto } = v2 as T & { movimentos?: unknown };
  return resto as T;
};

export function aliviarBase(base: Base, { decomposicao = 'todas', historico = 'todo', serie = true, manter = [] }: Alivio): Base {
  const comSinal = decomposicao === 'com_sinal' ? new Set(base.sinais.map(s => s.contaId)) : null;
  const topo = Object.fromEntries(CAMPOS_DA_TELA.filter(k => k in base).map(k => [k, (base as unknown as Record<string, unknown>)[k]])) as unknown as Base;
  return {
    ...topo,
    contas: base.contas.map(c => {
      const manterDecomp = decomposicao === 'todas' || (comSinal?.has(c.id) ?? false) || manter.includes(c.id);
      const recente = historico === 'mais_recente' ? [...(c.historico ?? [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 1) : [];
      const conta = { ...c } as Record<string, unknown>;
      for (const k of FORA_DA_TELA_CONTA) delete conta[k];
      return {
        ...(conta as unknown as typeof c),
        // da evidência de ICP, a tela usa só alguns campos da requalificação (lib/icp.ts); o resto é registro de pesquisa
        ...(c.icpEvidencia && { icpEvidencia: c.icpEvidencia.requalificacao2G ? { requalificacao2G: requalificacaoDaTela(c.icpEvidencia.requalificacao2G) } : {} }),
        composicao: manterDecomp ? c.composicao : [],
        // v2.movimentos é o registro de auditoria do motor (nenhuma tela lê); contribuições só onde a decomposição aparece
        ...(c.v2 && { v2: { ...semMovimentos(c.v2), ...(!manterDecomp && { contribuicoes: [] }) } }),
        historico: historico === 'todo' ? c.historico : recente,
        serie: serie ? c.serie : [],
        ...(!serie && c.serie180 && { serie180: undefined }),
      };
    }),
  };
}
