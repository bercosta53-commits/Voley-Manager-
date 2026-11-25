import type { Conta, EstadoSinal, Sinal } from './tipos';
import type { StatusConta } from './acoes';
import { LUGARES_ESSENCIAIS, faltandoNoComite } from './papeis';

/**
 * Cobertura da conta (P2-11): quão bem o time está trabalhando uma conta que o Radar diz estar quente.
 * Só lê o que já existe sem esforço extra: o comitê mapeado e os cliques do fluxo normal (abordar, adiar,
 * arquivar, útil/ruído) ou o andamento opcional. Nada aqui pede preenchimento. Função pura; testes em
 * scripts/tests/cobertura.test.mjs. A visão da liderança (lib/lideranca.ts) usa as mesmas regras.
 */

/** piso da faixa "Oportunidade emergente" do VSCS 3.0 */
export const PISO_QUENTE = 55;

/** Quente = VSCS na faixa de oportunidade ou Conta Qualificada pelo motor (D12). */
export const ehQuente = (c: Pick<Conta, 'score' | 'qualificada'>, piso = PISO_QUENTE) => c.score >= piso || c.qualificada?.status === 'sim';

/** Ação do time na conta: qualquer clique do fluxo num sinal dela, ou um andamento registrado. */
export const teveAcao = (sinaisDaConta: Pick<Sinal, 'id'>[], estados: Record<string, EstadoSinal>, andamento?: { status: StatusConta }) =>
  !!andamento || sinaisDaConta.some(s => !!(estados[s.id]?.acao || estados[s.id]?.avaliacao));

export interface Cobertura {
  quente: boolean;
  trabalhada: boolean;
  /** quente e sem nenhuma ação do time: o alerta do P2-11 */
  subTrabalhada: boolean;
  /** lugares essenciais do comitê com alguém (de 3) */
  comite: number;
}

export function cobertura(
  conta: Pick<Conta, 'score' | 'qualificada' | 'comite' | 'comiteFaltando'>,
  sinaisDaConta: Pick<Sinal, 'id'>[],
  estados: Record<string, EstadoSinal>,
  andamento?: { status: StatusConta },
): Cobertura {
  const quente = ehQuente(conta);
  const trabalhada = teveAcao(sinaisDaConta, estados, andamento);
  return { quente, trabalhada, subTrabalhada: quente && !trabalhada, comite: LUGARES_ESSENCIAIS.length - faltandoNoComite(conta).length };
}
