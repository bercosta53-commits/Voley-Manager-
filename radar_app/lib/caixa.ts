import type { Conta, Sinal, StatusVscs } from './tipos';
import { ACOES_DE_ABORDAGEM, MATRIZ_ICP, faixaVscs } from './avaliacao';

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
export const dentroDaJanela = (s: Pick<Sinal, 'tipo' | 'data'> & Partial<Pick<Sinal, 'id'>>, dataCarga: string, conta?: Pick<Conta, 'v2'>) => {
  const idade = idadeDias(s, dataCarga);
  const c = conta?.v2?.contribuicoes?.find(c => c.id === s.id);
  // Nomeação efetiva com vínculo confirmado e janela ativa no motor; nunca uma vaga.
  const maturada = c?.janela_lideranca === 'implementacao' && c.categoria === 'lideranca' && c.pontos > 0 && c.maturacao?.startsWith('aplicada:');
  return Number.isFinite(idade) && idade <= (maturada ? 450 : janelaDe(s));
};

/** Caixa comercial não é a linha do tempo. Contexto, duplicatas absorvidas, negativos e pendentes ficam na conta. */
export function elegivelCaixa(s: Pick<Sinal, 'pontos' | 'categoria' | 'tipo'>): boolean {
  return Number.isFinite(s.pontos) && s.pontos > 0 && s.categoria !== 'negativo' && s.categoria !== 'contexto' && s.tipo !== 'noticia_setorial';
}
export const tierEfetivo = (c?: Partial<Pick<Conta, 'tier' | 'icp' | 'v2'>>) => c?.icp?.tier ?? c?.v2?.tier ?? c?.tier ?? '';
export function acaoDaConta(c?: Partial<Pick<Conta, 'tier' | 'icp' | 'v2' | 'score' | 'acaoRecomendada'>>): string {
  const t = tierEfetivo(c);
  const score = c?.v2?.vscs ?? c?.score;
  if ((t === 'A' || t === 'B' || t === 'C') && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100)
    return MATRIZ_ICP[t][faixaVscs(score)] ?? 'Monitorar';
  return 'Monitorar';
}
export function podeAbordar(s: Pick<Sinal, 'pontos' | 'categoria' | 'tipo'>, c?: Partial<Pick<Conta, 'tier' | 'icp' | 'v2' | 'score' | 'acaoRecomendada'>>): boolean {
  return elegivelCaixa(s) && ACOES_DE_ABORDAGEM.has(acaoDaConta(c));
}

// ---------------------------------------------------------------- variação do score e força do sinal

/** Variação do score nos últimos `dias`, pela série da conta (90 dias, pontos igualmente espaçados). */
export function variacao(c: Pick<Conta, 'serie' | 'score'> & Partial<Pick<Conta, 'serie180' | 'v2'>>, dias = 7): number | null {
  const h = c.serie180;
  if (h && h.valores.length === 181 && h.versao === c.v2?.versao && (!c.v2?.calculadoEm || h.ate === c.v2.calculadoEm.slice(0,10)) && Math.abs(h.valores[180] - c.score) <= .05) {
    const antes = h.valores[180 - dias];
    return Number.isFinite(antes) ? Math.round(c.score - antes) : null;
  }
  const s = c.serie ?? [];
  // Apenas o formato legado completo: dois valores pós-migração não representam 90 dias.
  if (s.length !== 31 || Math.abs(s[30] - c.score) > .51) return null;
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
export const FORCA_ROTULO: Record<Forca, string> = { forte: 'forte', medio: 'médio', contexto: 'complementar' };
/** Força em 3 níveis, pelo nível do gatilho que o motor grava (A forte, B médio, C contexto). */
export const forcaDe = (s: Pick<Sinal, 'nivel'>): Forca => (s.nivel === 'A' ? 'forte' : s.nivel === 'B' ? 'medio' : 'contexto');
/** Contribuição sem a falsa precisão: inteiro com sinal. */
/** O bloco é o fato comercial; a descrição da vaga original continua na evidência. */
export const tituloSinal = (s: Sinal, conta: Pick<Conta, 'v2'>) => {
  const c = conta.v2?.contribuicoes?.find(c => c.id === s.id);
  return c?.chave === 'vaga_bloco' ? c.texto : s.sinal ?? s.porQueAgora;
};
export const pontosInteiros = (p: number) => {
  // sinal recém-coletado, ainda sem pontuação do VSCS: diz isso em vez de "+NaN"
  if (!Number.isFinite(p)) return 'a pontuar';
  if (p === 0) return 'contexto';
  if (Math.abs(p) < 0.5) return `${p < 0 ? '−' : '+'}${Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`;
  const n = Math.round(p);
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
};

// ---------------------------------------------------------------- ordenação

export type Ordem = 'prioridade' | 'aceleracao' | 'forca' | 'recente' | 'score' | 'tier';
export const ORDENS: { id: Ordem; rotulo: string; dica: string }[] = [
  { id: 'prioridade', rotulo: 'Prioridade comercial', dica: 'ICP e ação da conta, contribuição individual; primeiro o melhor sinal de cada conta' },
  { id: 'aceleracao', rotulo: 'Aceleração da conta (7d)', dica: 'variação em 7 dias quando há série válida; desempate pela contribuição do sinal' },
  { id: 'forca', rotulo: 'Força do sinal', dica: 'quanto o sinal soma ao score hoje' },
  { id: 'recente', rotulo: 'Mais recente', dica: 'data do sinal' },
  { id: 'score', rotulo: 'Score da conta', dica: 'score total da conta' },
  { id: 'tier', rotulo: 'Tier / Fit', dica: 'tier da conta, depois score' },
];
export const ORDEM_PADRAO: Ordem = 'prioridade';

const TIER: Record<string, number> = { A: 0, B: 1, C: 2 };

type ContaOrdenacao = Pick<Conta, 'score' | 'serie' | 'tier'> & Partial<Pick<Conta, 'icp' | 'v2' | 'serie180' | 'acaoRecomendada'>>;
const impacto = (s: Sinal) => Number.isFinite(s.pontos) ? s.pontos : -Infinity;
const prioridade = (c?: ContaOrdenacao) => {
  const t = tierEfetivo(c);
  return ACOES_DE_ABORDAGEM.has(acaoDaConta(c)) ? 0 : t === 'A' || t === 'B' ? 1 : t === 'C' ? 2 : 3;
};
export function ordenarCaixa(lista: Sinal[], ordem: Ordem, contas: Map<string, ContaOrdenacao>): Sinal[] {
  const comparadorSinal = (a: Sinal, b: Sinal) => impacto(b) - impacto(a) || b.data.localeCompare(a.data) || a.id.localeCompare(b.id);
  const valor = (s: Sinal): number => {
    const c = contas.get(s.contaId);
    if (ordem === 'aceleracao') return c ? variacao(c) ?? -Infinity : -Infinity;
    if (ordem === 'forca') return impacto(s);
    if (ordem === 'recente') return dia(s.data);
    if (ordem === 'score') return c?.score ?? 0;
    return -((TIER[tierEfetivo(c)] ?? 3) * 1000) + (c?.score ?? 0);
  };
  if (ordem !== 'prioridade') return [...lista].sort((a,b) => valor(b) - valor(a) || comparadorSinal(a,b));
  const porConta = new Map<string, Sinal[]>();
  for (const s of lista) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
  const camada = new Map<string, number>();
  for (const ss of porConta.values()) ss.sort(comparadorSinal).forEach((s,i) => camada.set(s.id,i));
  return [...lista].sort((a,b) => {
    const ca = contas.get(a.contaId), cb = contas.get(b.contaId);
    return prioridade(ca) - prioridade(cb) || (camada.get(a.id) ?? 0) - (camada.get(b.id) ?? 0)
      || impacto(b) - impacto(a) || (cb?.score ?? 0) - (ca?.score ?? 0)
      || (TIER[tierEfetivo(ca)] ?? 3) - (TIER[tierEfetivo(cb)] ?? 3) || comparadorSinal(a,b);
  });
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

type ContaFiltro = Pick<Conta, 'vscsStatus' | 'tier' | 'uf' | 'segmento' | 'ramoTI'> & Partial<Pick<Conta, 'icp' | 'v2'>> & { playbook?: string };
export const setorDe = (c?: ContaFiltro) => c?.ramoTI?.nome ?? (c?.segmento || SEM_SETOR);
export const temFiltroCaixa = (f: FiltrosCaixa) => JSON.stringify({ ...SEM_FILTROS_CAIXA, ...f }) !== JSON.stringify(SEM_FILTROS_CAIXA);

/** OU dentro de cada filtro, E entre filtros. `ignorar` tira um grupo (para contar as opções dele). */
export function filtrarCaixa(lista: Sinal[], f: FiltrosCaixa, contas: Map<string, ContaFiltro>, dataCarga: string, ignorar?: keyof FiltrosCaixa): Sinal[] {
  return lista.filter(s => {
    const c = contas.get(s.contaId);
    if (ignorar !== 'estagios' && f.estagios.length && !(c?.vscsStatus && f.estagios.includes(c.vscsStatus))) return false;
    if (ignorar !== 'tipos' && f.tipos.length && !f.tipos.includes(s.rotulo)) return false;
    if (ignorar !== 'tiers' && f.tiers.length && !f.tiers.includes(tierEfetivo(c))) return false;
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
      : grupo === 'tiers' ? tierEfetivo(c)
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
