import type { Barra } from '@/components/ui/perfil-compacto';
import type { Base } from './tipos';
import { FAIXAS_VSCS, ACOES_DE_ABORDAGEM } from './avaliacao';
import { diasEntre } from './utils';
import { FAIXAS_CAPITAL, FAIXAS_FUNCIONARIOS, PORTES, REGIOES, SEM_UF, faixaCapital, faixaFuncionarios, porteDe, regiaoDe } from './regioes';

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function contar<T>(itens: T[], chave: (x: T) => string | undefined | null, rotular?: (k: string) => string): Barra[] {
  const n = new Map<string, number>();
  for (const x of itens) {
    const k = chave(x) || '';
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].map(([id, valor]) => ({ id, rotulo: rotular ? rotular(id) : id, valor })).sort((a, b) => b.valor - a.valor);
}

/** Junta o que passa de `limite` itens em "Outros" (sem repintar os primeiros). */
function top(barras: Barra[], limite: number, outros = 'Outros'): Barra[] {
  if (barras.length <= limite) return barras;
  const resto = barras.slice(limite).reduce((n, b) => n + b.valor, 0);
  return [...barras.slice(0, limite), { id: '__outros', rotulo: outros, valor: resto }];
}

export interface PerfilContas {
  contas: number;
  tierA: number;
  comSinal30: number;
  atencaoOuMais: number;
  paraAbordar: number;
  comCnpj: number;
  semUf: number;
  tiers: Barra[];
  status: Barra[];
  ramos: Barra[];
  ufs: Barra[];
  todasUfs: Barra[];
  regioes: Barra[];
  portes: Barra[];
  capital: Barra[];
  funcionarios: Barra[];
  comFuncionarios: number;
  familias: Barra[];
  especializacoes: Barra[];
  modelos: Barra[];
  leituras: string[];
}

/** Perfil da base de contas: ICP, momento (score), o que fazem e onde estão — e o que ainda falta confirmar. */
export function perfilContas(base: Base): PerfilContas {
  const C = base.contas;
  const hoje = base.geradoEm;
  const recentes = new Set(base.sinais.filter(s => s.tipo !== 'noticia_setorial' && diasEntre(s.data, hoje) <= 30).map(s => s.contaId));
  const comSinal30 = C.filter(c => recentes.has(c.id)).length;
  const atencaoOuMais = C.filter(c => c.vscsStatus && c.vscsStatus !== 'Monitoramento').length;
  const paraAbordar = C.filter(c => c.acaoRecomendada && ACOES_DE_ABORDAGEM.has(c.acaoRecomendada)).length;
  const comCnpj = C.filter(c => c.cnpj).length;
  const semUf = C.filter(c => !c.uf).length;

  const tiers = ['A', 'B', 'C'].map(t => ({ id: t, rotulo: `Tier ${t}`, valor: C.filter(c => c.tier === t).length })).filter(b => b.valor);
  const status = [...FAIXAS_VSCS]
    .reverse()
    .map(([, st]) => ({ id: st, rotulo: st, valor: C.filter(c => c.vscsStatus === st).length }))
    .filter(b => b.valor);
  const ramos = contar(C, c => c.ramoTI?.nome, k => k || 'A classificar');
  const ufs = top(contar(C.filter(c => c.uf), c => c.uf), 5);
  const todasUfs = contar(C.filter(c => c.uf), c => c.uf);
  const ordem = <T extends string>(lista: readonly T[], f: (c: (typeof C)[number]) => string | null) =>
    lista.map(k => ({ id: k, rotulo: k, valor: C.filter(c => f(c) === k).length })).filter(b => b.valor);
  const regioes = ordem([...REGIOES, SEM_UF], c => regiaoDe(c.uf));
  const portes = ordem(PORTES, porteDe);
  const capital = ordem(FAIXAS_CAPITAL, c => faixaCapital(c.capitalSocial));
  const funcionarios = ordem(FAIXAS_FUNCIONARIOS, c => faixaFuncionarios(c.funcionarios));
  const comFuncionarios = C.filter(c => c.funcionarios).length;
  const familias = contar(C, c => c.ramoTI?.familia, k => k || 'A classificar');
  const especializacoes = contar(
    C.filter(c => c.especializacao && c.especializacao.codigo !== 'GEN'),
    c => c.especializacao?.nome,
  );
  const ROTULO_MODELO: Record<string, string> = { produto: 'Produto', servico: 'Serviço', misto: 'Misto', '': 'A classificar' };
  const modelos = contar(C, c => c.modeloNegocio, k => ROTULO_MODELO[k] ?? k);

  const b = tiers.find(t => t.id === 'B');
  const sp = ufs.find(u => u.id === 'SP');
  const maiorRegiao = [...regioes].filter(r => r.id !== SEM_UF).sort((x, y) => y.valor - x.valor)[0];
  const leituras = [
    `Só ${comSinal30} contas (${pct(comSinal30, C.length)}%) tiveram sinal nos últimos 30 dias; ${atencaoOuMais} estão em Atenção ou acima e ${paraAbordar ? `${paraAbordar} pedem abordagem` : 'nenhuma pede abordagem hoje'}.`,
    b ? `${pct(b.valor, C.length)}% da base é tier B; as ${C.filter(c => c.tier === 'A').length} contas tier A são as candidatas a ABM 1:1.` : '',
    `${maiorRegiao ? `${pct(maiorRegiao.valor, C.length)}% estão no ${maiorRegiao.rotulo}${sp ? ` (SP sozinho tem ${pct(sp.valor, C.length)}%)` : ''}. ` : ''}Faltam dados: ${semUf} contas sem UF e ${C.length - comCnpj} sem CNPJ confirmado na Receita.`,
    (() => {
      const grandes = portes.find(x => x.id === 'Média ou grande')?.valor ?? 0;
      const comPorte = portes.filter(x => x.id !== 'Sem CNPJ').reduce((n, x) => n + x.valor, 0);
      return comPorte ? `Das ${comPorte} contas com porte na Receita, ${pct(grandes, comPorte)}% são médias ou grandes; micro e pequenas são ${comPorte - grandes}.` : '';
    })(),
  ].filter(Boolean);

  return {
    contas: C.length,
    tierA: C.filter(c => c.tier === 'A').length,
    comSinal30,
    atencaoOuMais,
    paraAbordar,
    comCnpj,
    semUf,
    tiers,
    status,
    ramos,
    ufs,
    todasUfs,
    regioes,
    portes,
    capital,
    funcionarios,
    comFuncionarios,
    familias,
    especializacoes,
    modelos,
    leituras,
  };
}
