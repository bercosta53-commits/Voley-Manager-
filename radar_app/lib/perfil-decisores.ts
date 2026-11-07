import type { Base, PapelAbm } from './tipos';
import { normalizar } from './contas';
import { PAPEIS } from './papeis';

/** Nível hierárquico pelo cargo (a primeira regra que bate vence; a ordem vai do topo para a base). */
const NIVEIS: [string, RegExp][] = [
  ['C-level e sócios', /\b(ceo|cfo|cto|coo|cmo|cro|cco|cio|ciso|cso|cpo|chief|presidente|founder|fundador|fundadora|co-founder|cofundador|cofundadora|socio|socia|partner|owner|proprietario)\b/],
  ['Diretoria e VP', /\b(vp|vice|diretor|diretora|director)\b/],
  ['Head', /\bhead\b/],
  ['Gerência', /\b(gerente|manager|gestor|gestora)\b/],
  ['Coordenação', /\b(coordenador|coordenadora|supervisor|supervisora|lider|lead)\b/],
];
const OUTROS_NIVEL = 'Especialistas e outros';

/** Função pelo cargo: o que a pessoa decide (a primeira regra que bate vence). */
const FUNCOES: [string, RegExp][] = [
  ['CEO', /\b(ceo|chief executive|presidente|diretor geral|diretora geral|diretor executivo|diretora executiva|general manager)\b/],
  ['Comercial e receita', /\b(cro|cco|cso|comercial|vendas|sales|negocios|business development|revenue|receita|growth|contas|account|parcerias|partnerships|canais)\b/],
  ['Marketing', /\b(cmo|marketing|brand|marca|demand|comunicacao)\b/],
  ['Fundador ou sócio', /\b(founder|fundador|fundadora|co-founder|cofundador|cofundadora|socio|socia|partner|owner)\b/],
  ['Tecnologia', /\b(cto|cio|ciso|tecnologia|technology|engenharia|engineering|ti|it|seguranca|security|dados|data)\b/],
  ['Operações', /\b(coo|operacoes|operations|delivery|servicos|services|projetos|customer success|sucesso do cliente|cs)\b/],
  ['Produto', /\b(cpo|produto|product)\b/],
  ['Finanças', /\b(cfo|financeiro|financeira|finance|controller|controladoria)\b/],
];
const OUTRAS_FUNCOES = 'Outras';

import type { Barra } from '@/components/ui/perfil-compacto';
export type { Barra };

export interface PerfilDecisores {
  pessoas: number;
  contas: number;
  mediaPorConta: number;
  medianaPorConta: number;
  comiteCompleto: number;
  comEmail: number;
  comLinkedin: number;
  niveis: Barra[];
  funcoes: Barra[];
  papeis: (Barra & { id: PapelAbm })[];
  contatosPorConta: Barra[];
  lacunas: Barra[];
  /** as três leituras curtas que abrem o perfil */
  leituras: string[];
}

const QUEM: Record<string, string> = { Decisor: 'o decisor', 'Dono da dor': 'o dono da dor', 'Assina o cheque': 'quem assina o cheque' };

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function classificar(cargo: string, regras: [string, RegExp][], outros: string) {
  const t = normalizar(cargo);
  return regras.find(([, r]) => r.test(t))?.[0] ?? outros;
}

function contar(valores: string[], ordem: string[]) {
  const n = new Map<string, number>();
  for (const v of valores) n.set(v, (n.get(v) ?? 0) + 1);
  return ordem.map(rotulo => ({ id: rotulo, rotulo, valor: n.get(rotulo) ?? 0 }));
}

/** Perfil da base de decisores: quem são, que papel têm no comitê e onde faltam pessoas. */
export function perfilDecisores(base: Base): PerfilDecisores {
  const pessoas = base.contas.flatMap(c => c.comite);
  const porConta = base.contas.map(c => c.comite.length).sort((a, b) => a - b);
  const mediana = porConta.length ? porConta[Math.floor(porConta.length / 2)]! : 0;

  const niveis = contar(
    pessoas.map(p => classificar(p.cargo, NIVEIS, OUTROS_NIVEL)),
    [...NIVEIS.map(([r]) => r), OUTROS_NIVEL],
  );
  const funcoes = contar(
    pessoas.map(p => classificar(p.cargo, FUNCOES, OUTRAS_FUNCOES)),
    [...FUNCOES.map(([r]) => r), OUTRAS_FUNCOES],
  )
    .filter(b => b.valor > 0)
    .sort((a, b) => Number(a.rotulo === OUTRAS_FUNCOES) - Number(b.rotulo === OUTRAS_FUNCOES) || b.valor - a.valor);

  const papeis = PAPEIS.map(x => ({ id: x.id, rotulo: x.rotulo, valor: pessoas.filter(p => p.papelAbm === x.id).length })).filter(b => b.valor > 0);

  const faixas = ['1', '2', '3', '4', '5', '6+'];
  const contatosPorConta = faixas.map(f => ({
    id: f,
    rotulo: f,
    valor: porConta.filter(n => (f === '6+' ? n >= 6 : n === Number(f))).length,
  }));
  const semContato = porConta.filter(n => n === 0).length;
  if (semContato) contatosPorConta.unshift({ id: '0', rotulo: '0', valor: semContato });

  const faltando = base.contas.flatMap(c => c.comiteFaltando ?? []);
  const lacunas = ['Decisor', 'Dono da dor', 'Assina o cheque']
    .map(r => ({ id: r, rotulo: r === 'Assina o cheque' ? 'Sem quem assina o cheque' : `Sem ${r.charAt(0).toLowerCase()}${r.slice(1)}`, valor: faltando.filter(x => x === r).length }))
    .filter(b => b.valor > 0);
  const comiteCompleto = base.contas.filter(c => !(c.comiteFaltando ?? []).length).length;

  const topo = niveis[0]!;
  const maiorLacuna = [...lacunas].sort((a, b) => b.valor - a.valor)[0];
  const temFuncao = (f: string) => base.contas.filter(c => c.comite.some(p => classificar(p.cargo, FUNCOES, OUTRAS_FUNCOES) === f)).length;
  const comMarketing = temFuncao('Marketing');
  const comComercial = temFuncao('Comercial e receita');
  const leituras = [
    `${pct(topo.valor, pessoas.length)}% dos contatos são C-level ou sócios: perto de quem assina o cheque, longe de quem toca a operação comercial no dia a dia.`,
    maiorLacuna
      ? `A maior lacuna é ${QUEM[maiorLacuna.id] ?? maiorLacuna.rotulo}: falta em ${maiorLacuna.valor} contas (${pct(maiorLacuna.valor, base.contas.length)}%). Só ${comiteCompleto} (${pct(comiteCompleto, base.contas.length)}%) têm o comitê completo.`
      : `Todas as contas têm o comitê completo.`,
    `${pct(comMarketing, base.contas.length)}% das contas têm alguém de marketing mapeado e ${pct(comComercial, base.contas.length)}% alguém de comercial ou receita: é por eles que a conversa de aquisição começa.`,
  ].filter(Boolean);

  return {
    pessoas: pessoas.length,
    contas: base.contas.length,
    mediaPorConta: pessoas.length / Math.max(1, base.contas.length),
    medianaPorConta: mediana,
    comiteCompleto,
    comEmail: pessoas.filter(p => p.email).length,
    comLinkedin: pessoas.filter(p => p.linkedin).length,
    niveis,
    funcoes,
    papeis,
    contatosPorConta,
    lacunas,
    leituras,
  };
}
