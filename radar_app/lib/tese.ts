import type { Conta, PapelAbm, Pessoa, Sinal, StatusVscs } from './tipos';
import type { StatusConta } from './acoes';

/**
 * Tese da conta: as seis perguntas de uma oportunidade respondidas com o que a base tem. Por que esta
 * empresa, por que agora, qual oportunidade, qual evidência, com quem falar e qual a próxima ação.
 *
 * Regra: nada é inferido. Campo que a base não traz volta vazio (null ou lista vazia), e a tela mostra
 * "não identificado". Função pura; as dependências entram por parâmetro para os testes rodarem sem o app
 * (scripts/tests/tese.test.mjs).
 */

export interface Evidencia {
  fonte: string;
  url: string;
  data: string;
}

export interface Tese {
  empresa: { tier?: string; motivos: string[]; segmento?: string } | null;
  agora: { sinal: Sinal; dias: number; abertos: number; estagio?: StatusVscs; tendencia: number } | null;
  oportunidade: string | null;
  /** fontes do fato principal com link, sem repetir URL */
  evidencias: Evidencia[];
  /** fatos da conta nos 90 dias até a data de referência */
  fatos90d: number;
  quem: { nome: string; cargo: string; papel?: PapelAbm; origem: 'sinal' | 'comite'; statusValidacao?: string; bloqueado: boolean; liberado: boolean } | null;
  comite: { pessoas: number; faltando: string[] };
  /** 'base' = acaoRecomendada gravada pelo motor; 'matriz' = derivada da matriz ICP × VSCS porque a base ainda não traz */
  acao: { titulo: string; texto: string; abordar: boolean; origem?: 'base' | 'matriz' | 'andamento' };
  /** score ainda não certificado pelo motor */
  scorePendente: boolean;
  /** Conta Qualificada como o motor gravou (CQ-1); ausente quando a base ainda não traz */
  qualificada?: Conta['qualificada'];
}

export interface DependenciasTese {
  /** AAAA-MM-DD de referência (data real em São Paulo) */
  hoje: string;
  /** o sinal ainda está aberto (sem ação, ou adiado e já vencido)? */
  aberto: (s: Sinal) => boolean;
  /** data da abordagem já registrada nesta conta, se houver */
  abordadoEm?: string;
  ganchoDe: (tipo: string) => string | undefined;
  papelDe: (p: Pessoa) => PapelAbm;
  /** ações da matriz ICP × VSCS que pedem contato agora */
  acoesDeAbordagem: Set<string>;
  /** ação da matriz ICP × VSCS para a conta, usada só quando a base não traz acaoRecomendada */
  acaoDaMatriz?: (conta: Conta) => string | undefined;
  /** andamento registrado pelo time (radar_acoes), quando o registro compartilhado está ligado */
  andamento?: { status: StatusConta; em: string; por: string };
}

/** Depois do primeiro contato, o andamento registrado pelo time decide a próxima ação. */
export const ACAO_DO_ANDAMENTO: Partial<Record<StatusConta, { titulo: string; texto: string }>> = {
  respondeu: { titulo: 'Marcar a conversa', texto: 'A pessoa respondeu. Proponha um horário e leve a tese da conta para a primeira reunião.' },
  reuniao: { titulo: 'Preparar a reunião', texto: 'Revise a tese, o comitê e os fatos que chegaram desde o primeiro contato.' },
  oportunidade: { titulo: 'Conduzir a oportunidade', texto: 'Registre a proposta no CRM. O Radar segue trazendo os fatos da conta.' },
  descartada: { titulo: 'Conta descartada', texto: 'O Radar só volta a sugerir abordagem com um fato novo, depois do período de espera.' },
};

const TEXTO_ACAO: Record<string, string> = {
  'Abordagem contextualizada': 'Abordar a pessoa indicada citando o fato. O rascunho abaixo já parte dele.',
  'ABM personalizado': 'Trabalhar a conta inteira: mais de uma pessoa do comitê, com mensagem por papel.',
  '1:1 executivo': 'Contato executivo direto, de liderança para liderança, com o fato como abertura.',
  Monitorar: 'O VSCS ainda é baixo para o tier desta conta: os fatos de agora não bastam para abrir conversa. O Radar avisa quando um novo fato chegar perto deles no tempo.',
  'Ampliar pesquisa': 'Há movimento, mas falta um segundo fato. Pesquisar a conta e confirmar quem decide antes de abordar.',
  'Revisar ICP da conta': 'Score alto em conta fora do ICP costuma indicar ICP mal classificado. Revisar o tier antes de perseguir.',
  Ignorar: 'Fora do ICP e sem sinais relevantes.',
};

/** Ordem de preferência para "com quem falar" quando o sinal não nomeia ninguém. */
const ORDEM_PAPEL: PapelAbm[] = ['decisor', 'assina_cheque', 'dono_da_dor', 'influenciador', 'trava'];

/** Contato que a auditoria da inteligência bloqueou: não é sugerido primeiro, e aparece sinalizado. */
export const contatoBloqueado = (p: Pick<Pessoa, 'statusValidacao'>) => !!p.statusValidacao?.toUpperCase().startsWith('BLOQUEADO');

/**
 * Lista de liberados da inteligência (adendo v2, 25/11): só APTO_HISTORICO conta como liberado para contato.
 * Liberado não significa e-mail entregável hoje nem autorização jurídica irrestrita.
 */
export const contatoLiberado = (p: Pick<Pessoa, 'statusValidacao'>) => p.statusValidacao?.toUpperCase() === 'APTO_HISTORICO';

/** Ordem de preferência para sugerir: liberado, depois sem status ou pendente de validação, por último bloqueado. */
const prioridadeContato = (p: Pick<Pessoa, 'statusValidacao'>) => (contatoLiberado(p) ? 0 : contatoBloqueado(p) ? 2 : 1);

const ROTULO_VALIDACAO: Record<string, string> = {
  APTO_HISTORICO: 'contato liberado',
  APTO_HISTORICO_COM_ALERTA: 'liberado com alerta: revisar antes',
  VALIDAR_EMAIL_EXISTENTE: 'validar o e-mail antes',
  VALIDAR_EMAIL_NOVO: 'validar o e-mail novo antes',
  VERIFICAR_CATCH_ALL: 'e-mail catch-all: verificar antes',
  RECONFIRMAR_VINCULO: 'reconfirmar se ainda está na empresa',
  CHECAR_LINKEDIN_E_CARGO: 'checar LinkedIn e cargo antes',
  PESQUISAR_OU_REVISAR_LINKEDIN: 'revisar o LinkedIn antes',
  CONFIRMAR_LINKEDIN_NOVO: 'confirmar o LinkedIn novo antes',
  REVISAR_EMAIL_NOVO_VINCULO: 'revisar o e-mail do novo vínculo',
  PESQUISAR_EMAIL: 'e-mail ainda não encontrado',
  BLOQUEADO_AGUARDA_AUDITORIA: 'contato bloqueado até a auditoria',
};

/** O status de validação em linguagem de quem vai abordar; status desconhecido aparece como veio. */
export const rotuloValidacao = (status?: string) => (status ? (ROTULO_VALIDACAO[status.toUpperCase()] ?? status.toLowerCase().replace(/_/g, ' ')) : undefined);

const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z') / 86_400_000;
const normal = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function teseDaConta(conta: Conta, sinais: Sinal[], dep: DependenciasTese): Tese {
  const hoje = dia(dep.hoje);
  const acionaveis = sinais.filter(s => s.tipo !== 'noticia_setorial');
  const abertos = acionaveis.filter(dep.aberto).sort((a, b) => b.pontos - a.pontos || b.data.localeCompare(a.data));
  const principal = abertos[0];

  const motivos = conta.icp?.motivos ?? [];
  const tier = conta.icp?.tier ?? (conta.tier || undefined);
  const segmento = conta.ramoTI?.nome ?? (conta.segmento || undefined);
  const empresa = tier || motivos.length || segmento ? { tier, motivos, segmento } : null;

  const agora = principal
    ? { sinal: principal, dias: Math.max(0, Math.round(hoje - dia(principal.data))), abertos: abertos.length, estagio: conta.vscsStatus, tendencia: conta.tendencia }
    : null;

  const oportunidade = principal ? (dep.ganchoDe(principal.tipo) ?? conta.v2?.frase ?? null) : null;

  const evidencias: Evidencia[] = [];
  if (principal) {
    const todas = principal.fontes?.length ? principal.fontes : [{ fonte: principal.fonte, url: principal.url, data: principal.data }];
    const vistas = new Set<string>();
    for (const e of todas) {
      if (!e.url || vistas.has(e.url)) continue;
      vistas.add(e.url);
      evidencias.push({ fonte: e.fonte || 'fonte sem nome', url: e.url, data: e.data || principal.data });
    }
  }
  const fatos90d = acionaveis.filter(s => {
    const idade = hoje - dia(s.data);
    return idade >= 0 && idade <= 90;
  }).length;

  let quem: Tese['quem'] = null;
  const citado = principal?.abordar?.nome?.replace(/[•\s.]/g, '') ? principal.abordar.nome : '';
  if (citado) {
    const doComite = conta.comite.find(p => normal(p.nome) === normal(citado));
    quem = {
      nome: citado,
      cargo: principal!.abordar.cargo,
      papel: doComite ? dep.papelDe(doComite) : undefined,
      origem: 'sinal',
      statusValidacao: doComite?.statusValidacao,
      bloqueado: !!doComite && contatoBloqueado(doComite),
      liberado: !!doComite && contatoLiberado(doComite),
    };
  } else {
    // sem nome no fato: primeiro um contato liberado, depois pendente, por último bloqueado; dentro de cada grupo, o papel mais próximo da decisão
    const ordenado = [...conta.comite].sort(
      (a, b) => prioridadeContato(a) - prioridadeContato(b) || ORDEM_PAPEL.indexOf(dep.papelDe(a)) - ORDEM_PAPEL.indexOf(dep.papelDe(b)),
    );
    const p = ordenado[0];
    if (p) quem = { nome: p.nome, cargo: p.cargo, papel: dep.papelDe(p), origem: 'comite', statusValidacao: p.statusValidacao, bloqueado: contatoBloqueado(p), liberado: contatoLiberado(p) };
  }

  let acao: Tese['acao'];
  const doAndamento = dep.andamento && ACAO_DO_ANDAMENTO[dep.andamento.status];
  if (doAndamento) {
    acao = { ...doAndamento, abordar: false, origem: 'andamento' };
  } else if (!principal && (dep.abordadoEm || dep.andamento?.status === 'abordado')) {
    acao = { titulo: 'Acompanhar a abordagem', texto: 'Sem resposta em 5 dias, fazer um segundo contato curto retomando o mesmo fato.', abordar: false };
  } else if (!principal) {
    acao = { titulo: 'Esperar um motivo', texto: 'Nenhum fato aberto nesta conta. Abordar sem motivo gasta a primeira impressão; o Radar avisa em Hoje quando algo mudar.', abordar: false };
  } else if (conta.acaoRecomendada || dep.acaoDaMatriz?.(conta)) {
    const titulo = (conta.acaoRecomendada || dep.acaoDaMatriz?.(conta))!;
    acao = {
      titulo,
      texto: TEXTO_ACAO[titulo] ?? conta.v2?.frase ?? '',
      abordar: dep.acoesDeAbordagem.has(titulo) || !!conta.v2?.via_rapida,
      origem: conta.acaoRecomendada ? 'base' : 'matriz',
    };
  } else {
    acao = { titulo: 'Avaliar a abordagem', texto: 'A matriz ICP × VSCS ainda não classificou esta conta. Decidir pelo fato e pelo comitê.', abordar: true };
  }

  return {
    empresa,
    agora,
    oportunidade,
    evidencias,
    fatos90d,
    quem,
    comite: { pessoas: conta.comite.length, faltando: conta.comiteFaltando ?? [] },
    acao,
    scorePendente: !!conta.scorePendente,
    qualificada: conta.qualificada,
  };
}
