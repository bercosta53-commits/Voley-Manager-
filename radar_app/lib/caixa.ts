import type { Conta, Sinal, StatusVscs } from './tipos';

/**
 * Caixa de sinais de Hoje (melhorias da tela de Sinais, fase 1 "confiança"): janela de validade por tipo,
 * ordenação escolhida pela pessoa, filtros (OU dentro do grupo, E entre grupos), contadores que somam o total,
 * força do sinal em 3 níveis e variação do score com período e base. Funções puras; testes em
 * scripts/tests/caixa.test.mjs. As janelas são proposta inicial, a calibrar com Útil/Ruído.
 */

// ---------------------------------------------------------------- janela de validade na caixa

/**
 * Até quando o sinal merece ação (dias desde o fato). É diferente da meia-vida do score: a meia-vida diz quanto
 * o sinal pesa; a janela diz até quando ele fica na caixa. Sinal vencido continua na conta e no gráfico.
 * Liderança e contratação de head usam 135 dias (um trimestre e meio, decisão D7 de 26/11): o fato amadurece.
 */
export const JANELA_CAIXA_DIAS: Record<string, number> = {
  lancamento_produto: 45,
  vaga_area_alvo: 30,
  nova_parceria: 60,
  nova_filial: 90,
  troca_lideranca: 135,
  executivo_chegou: 135,
  vaga_lideranca_alvo: 135,
  captacao: 90,
  expansao_comercial: 60,
  declaracao_expansao: 45,
  aquisicao_feita: 60,
  fusao: 60,
  reestruturacao: 60,
  foi_adquirida: 90,
  intencao: 15,
  presenca_evento: 30,
  palestra_lideranca: 30,
  premio: 30,
};
/**
 * Variantes dos coletores (troca_lideranca_ceo, lancamento_ia, vaga_lideranca_growth…) herdam a janela da raiz:
 * vale a chave mais longa que for prefixo do tipo.
 */
const RAIZES_JANELA: [string, number][] = [
  ['lancamento', 45],
  ['vaga_lideranca', 135],
  ['vaga_area', 30],
  ['vaga_expansao_comercial', 60],
  ['vaga_marketing', 30],
  ['vaga_comercial', 30],
  ['troca_lideranca', 135],
  ['troca_diretoria', 135],
  ['novo_cmo', 135],
  ['socio_entrou', 135],
  ['nova_unidade', 90],
  ['expansao_mercado', 90],
  ['parceria', 60],
  ['fusao', 60],
  ['aquisicao', 60],
  ['captacao', 90],
  ['declaracao', 45],
  ['intencao', 15],
  ['pedido', 15],
  ['visita', 15],
  ['presenca', 30],
];
export const JANELA_PADRAO_DIAS = 60;
export function janelaDe(s: Pick<Sinal, 'tipo'>): number {
  const exata = JANELA_CAIXA_DIAS[s.tipo];
  if (exata !== undefined) return exata;
  let melhor: [string, number] | undefined;
  for (const r of RAIZES_JANELA) if (s.tipo.startsWith(r[0]) && (!melhor || r[0].length > melhor[0].length)) melhor = r;
  return melhor?.[1] ?? JANELA_PADRAO_DIAS;
}

const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z') / 86_400_000;
export const idadeDias = (s: Pick<Sinal, 'data'>, dataCarga: string) => Math.round(dia(dataCarga) - dia(s.data));
/** Dentro da janela do tipo (evento futuro, como feira marcada, também fica). */
export const dentroDaJanela = (s: Pick<Sinal, 'tipo' | 'data'>, dataCarga: string) => idadeDias(s, dataCarga) <= janelaDe(s);

// ---------------------------------------------------------------- variação do score e força do sinal

/** Variação do score nos últimos `dias`, pela série da conta (90 dias, pontos igualmente espaçados). */
export function variacao(c: Pick<Conta, 'serie' | 'score'>, dias = 7): number | null {
  const s = c.serie ?? [];
  if (s.length < 2) return null;
  const passo = 90 / (s.length - 1);
  const k = Math.max(1, Math.round(dias / passo));
  const antes = s[Math.max(0, s.length - 1 - k)]!;
  return Math.round(c.score - antes);
}

/** "+18 em 30 dias (era 15)": período e base explícitos (a tendência gravada pelo motor é de 30 dias). */
export function textoVariacao(c: Pick<Conta, 'score' | 'tendencia'>): { curto: string; longo: string } {
  const t = Math.round(c.tendencia ?? 0);
  const agora = Math.round(c.score);
  const era = agora - t;
  if (Math.abs(t) < 1) return { curto: 'estável em 30 dias', longo: `Score ${agora}, igual há 30 dias` };
  const sinal = t > 0 ? '+' : '−';
  return { curto: `${sinal}${Math.abs(t)} em 30 dias (era ${era})`, longo: `Score ${agora}: era ${era} há 30 dias (${sinal}${Math.abs(t)})` };
}

export type Forca = 'forte' | 'medio' | 'contexto';
export const FORCA_ROTULO: Record<Forca, string> = { forte: 'forte', medio: 'médio', contexto: 'contexto' };
/** Força em 3 níveis, pelo nível do gatilho que o motor grava (A forte, B médio, C contexto). */
export const forcaDe = (s: Pick<Sinal, 'nivel'>): Forca => (s.nivel === 'A' ? 'forte' : s.nivel === 'B' ? 'medio' : 'contexto');
/** Contribuição sem a falsa precisão: inteiro com sinal. */
export const pontosInteiros = (p: number) => {
  const n = Math.round(p);
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
};

// ---------------------------------------------------------------- ordenação

export type Ordem = 'aceleracao' | 'forca' | 'recente' | 'score' | 'tier';
export const ORDENS: { id: Ordem; rotulo: string; dica: string }[] = [
  { id: 'aceleracao', rotulo: 'Maior aceleração', dica: 'variação do score da conta em 7 dias' },
  { id: 'forca', rotulo: 'Força do sinal', dica: 'quanto o sinal soma ao score hoje' },
  { id: 'recente', rotulo: 'Mais recente', dica: 'data do sinal' },
  { id: 'score', rotulo: 'Score da conta', dica: 'score total da conta' },
  { id: 'tier', rotulo: 'Tier / Fit', dica: 'tier da conta, depois score' },
];
export const ORDEM_PADRAO: Ordem = 'aceleracao';

const TIER: Record<string, number> = { A: 0, B: 1, C: 2 };

/** Ordena pela escolha; empate sempre pela data mais recente. Nunca muda a lista recebida. */
export function ordenarCaixa(lista: Sinal[], ordem: Ordem, contas: Map<string, Pick<Conta, 'score' | 'serie' | 'tier'>>): Sinal[] {
  const valor = (s: Sinal): number => {
    const c = contas.get(s.contaId);
    if (ordem === 'aceleracao') return c ? (variacao(c) ?? 0) : 0;
    if (ordem === 'forca') return s.pontos;
    if (ordem === 'recente') return dia(s.data);
    if (ordem === 'score') return c?.score ?? 0;
    return -((TIER[c?.tier ?? ''] ?? 3) * 1000) + (c?.score ?? 0); // tier A antes, depois score
  };
  return [...lista].sort((a, b) => valor(b) - valor(a) || b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- filtros e contadores

export interface FiltrosCaixa {
  estagios: StatusVscs[];
  tipos: string[];
  tiers: string[];
  setores: string[];
  ufs: string[];
  /** só sinais dos últimos N dias */
  janela: 7 | 30 | 90 | null;
  /** nome do playbook combinado ativo na conta (fase 3), ou QUALQUER_PLAYBOOK */
  playbooks: string[];
}
export const SEM_FILTROS_CAIXA: FiltrosCaixa = { estagios: [], tipos: [], tiers: [], setores: [], ufs: [], janela: null, playbooks: [] };
export const QUALQUER_PLAYBOOK = 'Qualquer playbook';
export const SEM_SETOR = 'Sem setor';
export const SEM_UF = 'Sem UF';

type ContaFiltro = Pick<Conta, 'vscsStatus' | 'tier' | 'uf' | 'segmento' | 'ramoTI'> & { playbook?: string };
export const setorDe = (c?: ContaFiltro) => c?.ramoTI?.nome ?? (c?.segmento || SEM_SETOR);
export const temFiltroCaixa = (f: FiltrosCaixa) => JSON.stringify({ ...SEM_FILTROS_CAIXA, ...f }) !== JSON.stringify(SEM_FILTROS_CAIXA);

/** OU dentro de cada filtro, E entre filtros. `ignorar` tira um grupo (para contar as opções dele). */
export function filtrarCaixa(lista: Sinal[], f: FiltrosCaixa, contas: Map<string, ContaFiltro>, dataCarga: string, ignorar?: keyof FiltrosCaixa): Sinal[] {
  return lista.filter(s => {
    const c = contas.get(s.contaId);
    if (ignorar !== 'estagios' && f.estagios.length && !(c?.vscsStatus && f.estagios.includes(c.vscsStatus))) return false;
    if (ignorar !== 'tipos' && f.tipos.length && !f.tipos.includes(s.rotulo)) return false;
    if (ignorar !== 'tiers' && f.tiers.length && !f.tiers.includes(c?.tier ?? '')) return false;
    if (ignorar !== 'setores' && f.setores.length && !f.setores.includes(setorDe(c))) return false;
    if (ignorar !== 'ufs' && f.ufs.length && !f.ufs.includes(c?.uf || SEM_UF)) return false;
    if (ignorar !== 'janela' && f.janela && idadeDias(s, dataCarga) > f.janela) return false;
    if (ignorar !== 'playbooks' && f.playbooks?.length && !(c?.playbook && (f.playbooks.includes(QUALQUER_PLAYBOOK) || f.playbooks.includes(c.playbook)))) return false;
    return true;
  });
}

/** Contagem por valor de um grupo, considerando os outros filtros (o número diz quantos sobrariam). */
export function contarOpcoes(lista: Sinal[], f: FiltrosCaixa, contas: Map<string, ContaFiltro>, dataCarga: string, grupo: 'estagios' | 'tipos' | 'tiers' | 'setores' | 'ufs' | 'playbooks') {
  const base = filtrarCaixa(lista, f, contas, dataCarga, grupo);
  const n = new Map<string, number>();
  for (const s of base) {
    const c = contas.get(s.contaId);
    const k =
      grupo === 'estagios' ? c?.vscsStatus ?? ''
      : grupo === 'tipos' ? s.rotulo
      : grupo === 'tiers' ? c?.tier ?? ''
      : grupo === 'setores' ? setorDe(c)
      : grupo === 'playbooks' ? c?.playbook ?? ''
      : c?.uf || SEM_UF;
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}

/** Sinais por estágio do score: todas as faixas, então a soma é sempre o total da caixa. */
export function porEstagio(lista: Sinal[], contas: Map<string, ContaFiltro>, faixas: StatusVscs[]): { estagio: StatusVscs | 'Sem estágio'; n: number }[] {
  const n = new Map<string, number>();
  for (const s of lista) {
    const st = contas.get(s.contaId)?.vscsStatus ?? 'Sem estágio';
    n.set(st, (n.get(st) ?? 0) + 1);
  }
  const saida: { estagio: StatusVscs | 'Sem estágio'; n: number }[] = faixas.map(e => ({ estagio: e, n: n.get(e) ?? 0 }));
  if (n.get('Sem estágio')) saida.push({ estagio: 'Sem estágio', n: n.get('Sem estágio')! });
  return saida;
}
