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
}

/**
 * S-1: a base com os campos pesados que a tela não usa esvaziados (mesma forma de Base, então a tela não muda).
 * Nada é inventado: o campo ou vem inteiro, ou vem vazio, ou vem só o item mais recente.
 */
export function aliviarBase(base: Base, { decomposicao = 'todas', historico = 'todo', serie = true }: Alivio): Base {
  const comSinal = decomposicao === 'com_sinal' ? new Set(base.sinais.map(s => s.contaId)) : null;
  return {
    ...base,
    contas: base.contas.map(c => {
      const manterDecomp = decomposicao === 'todas' || (comSinal?.has(c.id) ?? false);
      const recente = historico === 'mais_recente' ? [...(c.historico ?? [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 1) : [];
      return {
        ...c,
        composicao: manterDecomp ? c.composicao : [],
        ...(c.v2 && !manterDecomp && { v2: { ...c.v2, contribuicoes: [] } }),
        historico: historico === 'todo' ? c.historico : recente,
        serie: serie ? c.serie : [],
      };
    }),
  };
}
