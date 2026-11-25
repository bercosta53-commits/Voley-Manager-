import type { Conta, PapelAbm, Pessoa, Sinal, StatusVscs } from './tipos';

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
  quem: { nome: string; cargo: string; papel?: PapelAbm; origem: 'sinal' | 'comite' } | null;
  comite: { pessoas: number; faltando: string[] };
  acao: { titulo: string; texto: string; abordar: boolean };
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
}

const TEXTO_ACAO: Record<string, string> = {
  'Abordagem contextualizada': 'Abordar a pessoa indicada citando o fato. O rascunho abaixo já parte dele.',
  'ABM personalizado': 'Trabalhar a conta inteira: mais de uma pessoa do comitê, com mensagem por papel.',
  '1:1 executivo': 'Contato executivo direto, de liderança para liderança, com o fato como abertura.',
  Monitorar: 'O VSCS ainda é baixo para o tier desta conta. Um fato sozinho não abre conversa: o Radar avisa quando outro chegar perto deste no tempo.',
  'Ampliar pesquisa': 'Há movimento, mas falta um segundo fato. Pesquisar a conta e confirmar quem decide antes de abordar.',
  'Revisar ICP da conta': 'Score alto em conta fora do ICP costuma indicar ICP mal classificado. Revisar o tier antes de perseguir.',
  Ignorar: 'Fora do ICP e sem sinais relevantes.',
};

/** Ordem de preferência para "com quem falar" quando o sinal não nomeia ninguém. */
const ORDEM_PAPEL: PapelAbm[] = ['decisor', 'assina_cheque', 'dono_da_dor', 'influenciador', 'trava'];

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
  if (principal?.abordar?.nome) {
    const doComite = conta.comite.find(p => normal(p.nome) === normal(principal.abordar.nome));
    quem = { nome: principal.abordar.nome, cargo: principal.abordar.cargo, papel: doComite ? dep.papelDe(doComite) : undefined, origem: 'sinal' };
  } else {
    const ordenado = [...conta.comite].sort((a, b) => ORDEM_PAPEL.indexOf(dep.papelDe(a)) - ORDEM_PAPEL.indexOf(dep.papelDe(b)));
    const p = ordenado[0];
    if (p) quem = { nome: p.nome, cargo: p.cargo, papel: dep.papelDe(p), origem: 'comite' };
  }

  let acao: Tese['acao'];
  if (!principal && dep.abordadoEm) {
    acao = { titulo: 'Acompanhar a abordagem', texto: 'Sem resposta em 5 dias, fazer um segundo contato curto retomando o mesmo fato.', abordar: false };
  } else if (!principal) {
    acao = { titulo: 'Esperar um motivo', texto: 'Nenhum fato aberto nesta conta. Abordar sem motivo gasta a primeira impressão; o Radar avisa em Hoje quando algo mudar.', abordar: false };
  } else if (conta.acaoRecomendada) {
    acao = {
      titulo: conta.acaoRecomendada,
      texto: TEXTO_ACAO[conta.acaoRecomendada] ?? conta.v2?.frase ?? '',
      abordar: dep.acoesDeAbordagem.has(conta.acaoRecomendada) || !!conta.v2?.via_rapida,
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
  };
}
