import type { Base, EstadoSinal, Sinal } from './tipos';
import type { StatusConta } from './acoes';

/**
 * Visão da liderança: o que o time fez com o que o Radar trouxe. Só lê o que já existe sem esforço extra:
 * os fatos que a carga traz e os cliques que já fazem parte do fluxo (abordar, adiar, arquivar, útil/ruído).
 * O andamento da conta é opcional: aparece se alguém usou e nunca conta como falha. Não há ranking de pessoas
 * nem campo novo a preencher — isso é papel do CRM. Função pura; testes em scripts/tests/lideranca.test.mjs.
 *
 * O andamento entra por parâmetro (`status` por conta) e hoje vem de radar_acoes. Quando houver CRM (visão
 * própria ou integração), basta trocar a origem desse dado: esta função e a tela não mudam.
 */

export interface ContaParada {
  contaId: string;
  nome: string;
  score: number;
  fato: string;
  /** dias desde que o Radar avisou do fato mais recente da conta */
  diasDesdeAviso: number;
}

export interface Lideranca {
  dataCarga: string;
  fatosSemana: number;
  contasComFatoSemana: number;
  /** contas em oportunidade (VSCS ≥ piso) ou qualificadas pelo motor */
  quentes: number;
  quentesComAcao: number;
  /** as quentes sem nenhuma ação do time, mais quentes primeiro (no máximo `limite`) */
  quentesSemAcao: ContaParada[];
  quentesSemAcaoTotal: number;
  /** mediana de dias entre o aviso do Radar e a primeira ação no sinal; null sem ações */
  diasAteAgir: number | null;
  sinaisComAcao: number;
  /** andamento registrado (opcional): contagem por status; vazio quando ninguém usou */
  andamento: Partial<Record<StatusConta, number>>;
}

const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z') / 86_400_000;
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

export function lideranca(
  base: Base,
  estados: Record<string, EstadoSinal>,
  status: Record<string, { status: StatusConta }>,
  { pisoOportunidade = 55, limite = 5 }: { pisoOportunidade?: number; limite?: number } = {},
): Lideranca {
  const dataCarga = (base.atualizadoEm ?? base.geradoEm).slice(0, 10);
  const hoje = dia(dataCarga);
  const acionaveis = base.sinais.filter(s => s.tipo !== 'noticia_setorial');
  const daSemana = acionaveis.filter(s => {
    const idade = hoje - dia(s.data);
    return idade >= 0 && idade <= 7;
  });

  const porConta = new Map<string, Sinal[]>();
  for (const s of acionaveis) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
  // "ação" é qualquer clique do fluxo normal num sinal da conta, ou um andamento registrado
  const teveAcao = (contaId: string) =>
    !!status[contaId] || (porConta.get(contaId) ?? []).some(s => estados[s.id]?.acao || estados[s.id]?.avaliacao);

  const quentes = base.contas.filter(c => c.score >= pisoOportunidade || c.qualificada?.status === 'sim');
  const semAcao = quentes
    .filter(c => !teveAcao(c.id))
    .map(c => {
      const recente = [...(porConta.get(c.id) ?? [])].sort((a, b) => (b.alertaEm || b.data).localeCompare(a.alertaEm || a.data))[0];
      return {
        contaId: c.id,
        nome: c.nome,
        score: c.score,
        fato: recente ? recente.sinal || recente.rotulo : 'sem fato registrado',
        diasDesdeAviso: recente ? Math.max(0, Math.round(hoje - dia(recente.alertaEm || recente.data))) : 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  const comAcao = acionaveis.filter(s => estados[s.id]?.em && (estados[s.id]?.acao || estados[s.id]?.avaliacao));
  const diasAteAgir = mediana(comAcao.map(s => Math.max(0, Math.round(dia(estados[s.id]!.em!) - dia(s.alertaEm || s.data)))));

  const andamento: Lideranca['andamento'] = {};
  for (const { status: st } of Object.values(status)) andamento[st] = (andamento[st] ?? 0) + 1;

  return {
    dataCarga,
    fatosSemana: daSemana.length,
    contasComFatoSemana: new Set(daSemana.map(s => s.contaId)).size,
    quentes: quentes.length,
    quentesComAcao: quentes.length - semAcao.length,
    quentesSemAcao: semAcao.slice(0, limite),
    quentesSemAcaoTotal: semAcao.length,
    diasAteAgir,
    sinaisComAcao: comAcao.length,
    andamento,
  };
}
