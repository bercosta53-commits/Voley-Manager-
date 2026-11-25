import type { EstadoSinal, Relevancia3 } from './tipos';

/**
 * Regras puras do registro de ações (tabela radar_acoes, db/001_radar_acoes.sql): como as linhas viram o
 * estado de cada sinal, e como uma mudança feita na tela vira linhas novas. Sem dependências em tempo de
 * execução; testado em scripts/tests/acoes.test.mjs.
 *
 * Semântica (alinhada com a inteligência em 25/11):
 * - o registro é só de inserção e lido em ordem (id crescente);
 * - grupos independentes por sinal: ação (abordado, adiado, arquivado; "reaberto" limpa), avaliação (útil,
 *   ruído) e relevância (1–3); `status` é por conta;
 * - uma linha com `desfaz_id` limpa o grupo da linha desfeita. Ela só é gravada para desfazer a linha vigente,
 *   então ler em ordem basta.
 */

export type TipoAcao = 'abordado' | 'adiado' | 'arquivado' | 'reaberto' | 'util' | 'ruido' | 'relevancia' | 'status';
export type StatusConta = 'abordado' | 'respondeu' | 'reuniao' | 'oportunidade' | 'descartada';

export interface LinhaAcao {
  id: number;
  conta_id: string;
  sinal_id: string | null;
  tipo: TipoAcao;
  ate: string | null;
  relevancia: number | null;
  status: StatusConta | null;
  nota: string | null;
  desfaz_id: number | null;
  autor_email: string;
  criado_em: string;
}

export type NovaLinha = Omit<LinhaAcao, 'id' | 'criado_em' | 'autor_email' | 'nota'> & { nota?: string | null };

/** A linha vigente de cada grupo de um sinal: é ela que um "desfazer" referencia. */
export interface Vigentes {
  acao?: LinhaAcao;
  avaliacao?: LinhaAcao;
  relevancia?: LinhaAcao;
}

export interface Dobra {
  estados: Record<string, EstadoSinal>;
  vigentes: Record<string, Vigentes>;
  /** último status de cada conta, com autor e data */
  status: Record<string, { status: StatusConta; por: string; em: string }>;
  /** a linha de status vigente de cada conta: é ela que um "desfazer" referencia */
  statusVigente: Record<string, LinhaAcao>;
}

export const STATUS_CONTA: StatusConta[] = ['abordado', 'respondeu', 'reuniao', 'oportunidade', 'descartada'];

const grupo = (t: TipoAcao): keyof Vigentes | 'status' =>
  t === 'util' || t === 'ruido' ? 'avaliacao' : t === 'relevancia' ? 'relevancia' : t === 'status' ? 'status' : 'acao';

const data = (iso: string) => iso.slice(0, 10);

/** Lê o registro em ordem e devolve o estado efetivo de cada sinal e o status de cada conta. */
export function dobrar(linhas: LinhaAcao[]): Dobra {
  const vigentes: Record<string, Vigentes> = {};
  const status: Dobra['status'] = {};
  const statusVigente: Dobra['statusVigente'] = {};
  const porId = new Map(linhas.map(l => [l.id, l]));
  for (const l of [...linhas].sort((a, b) => a.id - b.id)) {
    const g = grupo(l.tipo);
    if (g === 'status') {
      if (l.desfaz_id) {
        if (statusVigente[l.conta_id]?.id === l.desfaz_id) {
          delete status[l.conta_id];
          delete statusVigente[l.conta_id];
        }
      } else if (l.status) {
        status[l.conta_id] = { status: l.status, por: l.autor_email, em: data(l.criado_em) };
        statusVigente[l.conta_id] = l;
      }
      continue;
    }
    if (!l.sinal_id) continue;
    const v = (vigentes[l.sinal_id] ??= {});
    if (l.desfaz_id) {
      const desfeita = porId.get(l.desfaz_id);
      if (desfeita && v[g]?.id === desfeita.id) delete v[g];
      continue;
    }
    if (l.tipo === 'reaberto') delete v.acao;
    else v[g] = l;
  }

  const estados: Record<string, EstadoSinal> = {};
  for (const [sinalId, v] of Object.entries(vigentes)) {
    const e: EstadoSinal = {};
    if (v.acao) Object.assign(e, { acao: v.acao.tipo as EstadoSinal['acao'], ...(v.acao.ate ? { ate: v.acao.ate } : {}) });
    if (v.avaliacao) e.avaliacao = v.avaliacao.tipo as EstadoSinal['avaliacao'];
    if (v.relevancia?.relevancia) e.relevancia = v.relevancia.relevancia as Relevancia3;
    const recentes = [v.acao, v.avaliacao, v.relevancia].filter((x): x is LinhaAcao => !!x).sort((a, b) => b.id - a.id);
    if (!recentes.length) continue;
    e.em = data(recentes[0].criado_em);
    e.por = recentes[0].autor_email;
    estados[sinalId] = e;
  }
  return { estados, vigentes, status, statusVigente };
}

/** A linha que leva a conta do status vigente (do banco) ao status pedido; null tira o status (desfazer). */
export function linhaDoStatus(contaId: string, vigente: LinhaAcao | undefined, para: StatusConta | null): NovaLinha | null {
  const base = { conta_id: contaId, sinal_id: null, ate: null, relevancia: null, desfaz_id: null };
  if (para) return vigente?.status === para ? null : { ...base, tipo: 'status', status: para };
  return vigente ? { ...base, tipo: 'status', status: vigente.status, desfaz_id: vigente.id } : null;
}

/** Valida o status que chega da tela: um dos cinco, ou null para tirar. */
export function validarStatus(x: unknown): StatusConta | null | 'invalido' {
  if (x === null || x === undefined) return null;
  return STATUS_CONTA.includes(x as StatusConta) ? (x as StatusConta) : 'invalido';
}

/**
 * As linhas que levam o sinal do estado vigente (lido do banco, não do navegador) ao estado pedido pela tela.
 * Campo igual não gera linha; campo que some gera "reaberto" (ação) ou um desfazer da linha vigente.
 */
export function linhasDaMudanca(sinalId: string, contaId: string, vigentes: Vigentes, para: EstadoSinal | null): NovaLinha[] {
  const alvo = para ?? {};
  const base = { conta_id: contaId, sinal_id: sinalId, ate: null, relevancia: null, status: null, desfaz_id: null };
  const saida: NovaLinha[] = [];

  const acaoAtual = vigentes.acao;
  if (alvo.acao) {
    const mudou = acaoAtual?.tipo !== alvo.acao || (alvo.acao === 'adiado' && (acaoAtual?.ate ?? null) !== (alvo.ate ?? null));
    if (mudou) saida.push({ ...base, tipo: alvo.acao, ate: alvo.acao === 'adiado' ? (alvo.ate ?? null) : null });
  } else if (acaoAtual) {
    saida.push({ ...base, tipo: 'reaberto' });
  }

  const avaliacaoAtual = vigentes.avaliacao;
  if (alvo.avaliacao && avaliacaoAtual?.tipo !== alvo.avaliacao) saida.push({ ...base, tipo: alvo.avaliacao });
  else if (!alvo.avaliacao && avaliacaoAtual) saida.push({ ...base, tipo: avaliacaoAtual.tipo, desfaz_id: avaliacaoAtual.id });

  const relevanciaAtual = vigentes.relevancia;
  if (alvo.relevancia && relevanciaAtual?.relevancia !== alvo.relevancia) saida.push({ ...base, tipo: 'relevancia', relevancia: alvo.relevancia });
  else if (!alvo.relevancia && relevanciaAtual) saida.push({ ...base, tipo: 'relevancia', relevancia: relevanciaAtual.relevancia, desfaz_id: relevanciaAtual.id });

  return saida;
}

/** Valida o estado que chega da tela: só valores conhecidos, data no formato certo. Devolve null se inválido. */
export function validarEstado(x: unknown): EstadoSinal | null | 'invalido' {
  if (x === null || x === undefined) return null;
  if (typeof x !== 'object') return 'invalido';
  const e = x as Record<string, unknown>;
  const saida: EstadoSinal = {};
  if (e.acao !== undefined) {
    if (!['abordado', 'adiado', 'arquivado'].includes(e.acao as string)) return 'invalido';
    saida.acao = e.acao as EstadoSinal['acao'];
  }
  if (e.ate !== undefined) {
    if (typeof e.ate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.ate)) return 'invalido';
    saida.ate = e.ate;
  }
  if (saida.acao === 'adiado' && !saida.ate) return 'invalido';
  if (e.avaliacao !== undefined) {
    if (!['util', 'ruido'].includes(e.avaliacao as string)) return 'invalido';
    saida.avaliacao = e.avaliacao as EstadoSinal['avaliacao'];
  }
  if (e.relevancia !== undefined) {
    if (![1, 2, 3].includes(e.relevancia as number)) return 'invalido';
    saida.relevancia = e.relevancia as Relevancia3;
  }
  return saida;
}

/** E-mail de quem está logado, lido do JWT do Cloudflare Access que o Worker já verificou (cloudflare-worker.mjs). */
export function emailDoAccess(jwt: string | null): string | null {
  const partes = jwt?.split('.');
  if (!partes || partes.length !== 3) return null;
  try {
    const json = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.email === 'string' && json.email.includes('@') ? json.email : null;
  } catch {
    return null;
  }
}
