import type { Conta, Pessoa, Sinal } from './tipos';
import { dentroDaJanela, idadeDias, janelaDe } from './caixa';

/**
 * Playbooks (melhorias da tela de Sinais, fase 3), com o conteúdo ajustado à oferta da Velora.
 *
 * - Sinal isolado: a linha "Oportunidade Velora" diz qual entregável da Velora o fato abre.
 * - Playbook combinado: dois ou mais sinais da mesma conta que contam a mesma história, dentro da janela de
 *   co-ocorrência. Ele substitui a leitura do sinal isolado e diz o que fazer: leitura, quem procurar, ângulo,
 *   o que não dizer, a pergunta de descoberta, a sequência e o que a Velora oferece.
 *
 * Só lê os sinais que já vêm na carga: não muda score, contrato nem banco. Textos aprovados pelo comercial
 * da Velora em 26/11/2026. Fica de fora por enquanto:
 * - E. "Lançamento sem braço comercial": depende de saber que a cobertura de vagas da conta é confiável
 *   (condição negativa), e a carga ainda não diz isso.
 * - Efeito no estágio de compra (fase 2) e registro de eventos por playbook (contrato radar_acoes, PR 14).
 * - "Prova" (caso de cliente): o time escolhe um caso real do portfólio; o Radar não inventa caso.
 */

// ---------------------------------------------------------------- famílias de sinal

/** Família: o que o fato significa para o playbook, independente do coletor que o trouxe. */
export type Familia =
  | 'lancamento'
  | 'contratacao'
  | 'parceria'
  | 'unidade'
  | 'lideranca'
  | 'societario'
  | 'captacao'
  | 'intencao'
  | 'evento'
  | 'crescimento';

const REGRAS_FAMILIA: [RegExp, Familia][] = [
  [/^lancamento/, 'lancamento'],
  [/^(vaga_|expansao_comercial$)/, 'contratacao'],
  [/^(nova_parceria|parceria)$/, 'parceria'],
  [/^(nova_filial|nova_unidade|expansao_mercado)$/, 'unidade'],
  [/^(troca_lideranca|troca_diretoria|executivo_chegou|novo_cmo|socio_entrou)/, 'lideranca'],
  [/^(fusao|aquisicao_|foi_adquirida|reestruturacao)/, 'societario'],
  [/^captacao/, 'captacao'],
  [/^(intencao|pedido_|visita_)/, 'intencao'],
  [/^(presenca_|palestra_|premio)/, 'evento'],
  [/^(declaracao_|resultados_crescimento|anuncios)/, 'crescimento'],
];

export function familiaDe(tipo: string): Familia | null {
  for (const [re, f] of REGRAS_FAMILIA) if (re.test(tipo)) return f;
  return null;
}

// ---------------------------------------------------------------- oferta da Velora

export type Oferta =
  | 'diagnostico'
  | 'growth'
  | 'abm'
  | 'aquisicao'
  | 'revops'
  | 'branding'
  | 'outbound'
  | 'mentorias'
  | 'icp'
  | 'gtm'
  | 'inteligencia'
  | 'imersoes'
  | 'growth_leader';

/** Entregáveis da Velora, com os nomes do site. */
export const OFERTAS: Record<Oferta, string> = {
  diagnostico: 'Diagnóstico de Aquisição',
  growth: 'Growth',
  abm: 'ABM',
  aquisicao: 'Aquisição',
  revops: 'RevOps',
  branding: 'Branding',
  outbound: 'Outbound otimizado',
  mentorias: 'Mentorias e treinamentos',
  icp: 'ICP e mapeamento de mercado',
  gtm: 'GTM',
  inteligencia: 'Inteligência de mercado',
  imersoes: 'Imersões',
  growth_leader: 'Growth Leader as a Service',
};

/** Sinal isolado: o que o fato abre para a Velora. Uma frase, sem prometer a dor. */
export const OPORTUNIDADE: Record<Familia, { texto: string; ofertas: Oferta[] }> = {
  lancamento: { texto: 'Levar o lançamento do anúncio ao pipeline: posicionamento, canais e metas de adoção.', ofertas: ['gtm', 'aquisicao'] },
  contratacao: { texto: 'Time de receita crescendo: processo, cadência e rampa para as pessoas novas renderem desde o primeiro mês.', ofertas: ['outbound', 'mentorias', 'revops'] },
  parceria: { texto: 'Parceria nova pede demanda conjunta e contas-alvo combinadas com o parceiro.', ofertas: ['abm', 'gtm'] },
  unidade: { texto: 'Praça nova: mapear o mercado local e montar a aquisição por região.', ofertas: ['icp', 'aquisicao'] },
  lideranca: { texto: 'Gestão nova revisando o plano: chegar aos primeiros 90 dias com diagnóstico e prioridades de aquisição.', ofertas: ['diagnostico', 'gtm'] },
  societario: { texto: 'Integração entre marketing, inteligência comercial, pré-vendas e previsibilidade de receita.', ofertas: ['revops', 'branding'] },
  captacao: { texto: 'Investimento novo em crescimento: transformar o capital em aquisição previsível.', ofertas: ['growth', 'revops'] },
  intencao: { texto: 'Interesse declarado: o ponto de partida é o Diagnóstico de Aquisição.', ofertas: ['diagnostico'] },
  evento: { texto: 'Presença em evento: abordagem por conta, com a pauta do evento como assunto.', ofertas: ['abm'] },
  crescimento: { texto: 'Meta de crescimento declarada: estratégia de aquisição B2B para chegar lá.', ofertas: ['gtm', 'growth'] },
};

export const oportunidadeDe = (s: Pick<Sinal, 'tipo' | 'categoria'>) => {
  if (s.categoria === 'negativo') return null;
  const f = familiaDe(s.tipo);
  return f ? OPORTUNIDADE[f] : null;
};

// ---------------------------------------------------------------- catálogo de playbooks combinados

export interface Playbook {
  id: string;
  nome: string;
  /** dois grupos de famílias: um sinal de cada, até `janela` dias de distância (F usa `minimoFamilias`) */
  gatilho: { a: Familia[]; b: Familia[]; janela: number } | { minimoFamilias: number; janela: number };
  gatilhoTexto: string;
  leitura: string;
  dor: string;
  /** persona: rótulo e o que procurar no cargo das pessoas do comitê */
  procurar: { rotulo: string; cargo: RegExp }[];
  janelaAcao: number;
  angulo: string;
  naoDizer?: string;
  descoberta: string;
  sequencia: { dia: number; canal: string }[];
  ofertas: Oferta[];
  sucesso: string;
  /** rascunho que cita o mercado, não a vigilância; {setor} vem do segmento da conta */
  mensagem: string;
}

const MKT = { rotulo: 'Head de Marketing/Growth', cargo: /marketing|growth|cmo\b|demanda/i };
const COMERCIAL = { rotulo: 'Liderança comercial', cargo: /comercial|vendas|sales|cro\b|neg[oó]cios/i };
const CLEVEL = { rotulo: 'C-level ou fundador', cargo: /\bceo\b|fundador|founder|presidente|s[oó]cio|diretor[a]? geral|\bcoo\b|\bcfo\b/i };
const CANAIS = { rotulo: 'Alianças/Canais', cargo: /alian[cç]|canal|canais|parcer/i };
const OPERACOES = { rotulo: 'Operações/Receita', cargo: /opera[cç]|receita|revops|regional|\bcoo\b/i };
const PRODUTO = { rotulo: 'Marketing de produto', cargo: /produto|product/i };

/** Em ordem de prioridade: se mais de um ativar, vale o primeiro. */
export const PLAYBOOKS: Playbook[] = [
  {
    id: 'lancamento_tracao',
    nome: 'Lançamento com tração',
    gatilho: { a: ['lancamento'], b: ['contratacao'], janela: 30 },
    gatilhoTexto: 'Lançamento + contratação em aquisição ou receita, até 30 dias de distância',
    leitura: 'Não foi só um anúncio: estão investindo para o produto vender.',
    dor: 'Transformar o lançamento em pipeline; rampa do time novo; prova de valor rápida.',
    procurar: [MKT, COMERCIAL],
    janelaAcao: 30,
    angulo: 'Como fazer o lançamento sair do anúncio e virar pipeline.',
    naoDizer: '"Vi que vocês abriram vagas."',
    descoberta: 'Qual é a meta de adoção do lançamento no próximo trimestre, e de onde vocês esperam que ela venha?',
    sequencia: [
      { dia: 0, canal: 'LinkedIn' },
      { dia: 2, canal: 'E-mail' },
      { dia: 5, canal: 'Ligação' },
      { dia: 10, canal: 'E-mail com caso' },
    ],
    ofertas: ['gtm', 'aquisicao', 'outbound'],
    sucesso: 'Reunião marcada em até 21 dias.',
    mensagem:
      'Acompanho o mercado de {setor} e, na maioria das empresas que vemos, o desafio depois de um lançamento não é o produto, é fazer o canal de aquisição acompanhar. Faz sentido trocar 20 minutos sobre como vocês estão pensando a tração do lançamento?',
  },
  {
    id: 'lideranca_montando_time',
    nome: 'Liderança nova montando time',
    gatilho: { a: ['lideranca'], b: ['contratacao'], janela: 90 },
    gatilhoTexto: 'Liderança nova + contratação em aquisição ou receita, até 90 dias de distância',
    leitura: 'A gestão nova já está desenhando o próprio time: o plano está sendo decidido agora.',
    dor: 'Dar resultado antes de o time amadurecer; definir processo e metas para quem está chegando.',
    procurar: [MKT, COMERCIAL, CLEVEL],
    janelaAcao: 60,
    angulo: 'Como a liderança nova chega ao primeiro trimestre com plano, processo e time rendendo.',
    naoDizer: 'Comparar com a gestão anterior.',
    descoberta: 'O que precisa estar de pé nos próximos 90 dias para o plano novo dar certo?',
    sequencia: [
      { dia: 0, canal: 'LinkedIn' },
      { dia: 3, canal: 'E-mail' },
      { dia: 7, canal: 'Ligação' },
    ],
    ofertas: ['growth_leader', 'mentorias', 'revops'],
    sucesso: 'Reunião marcada em até 30 dias.',
    mensagem:
      'Acompanho o mercado de {setor} e vemos um padrão: quem assume a área e monta time ao mesmo tempo precisa de resultado antes de o time amadurecer. Faz sentido trocar 20 minutos sobre como vocês estão organizando os próximos 90 dias?',
  },
  {
    id: 'expansao_canal',
    nome: 'Expansão via canal',
    gatilho: { a: ['parceria'], b: ['unidade'], janela: 60 },
    gatilhoTexto: 'Nova parceria + nova unidade, até 60 dias de distância',
    leitura: 'Estão entrando em um mercado novo apoiados por um parceiro.',
    dor: 'Marca desconhecida na praça nova; coordenar o marketing com o parceiro; medir o que vem do canal.',
    procurar: [CANAIS, MKT, OPERACOES],
    janelaAcao: 60,
    angulo: 'Como gerar demanda local junto com o parceiro desde o primeiro mês.',
    naoDizer: 'Detalhes do acordo com o parceiro que não foram públicos.',
    descoberta: 'Quanto da demanda da nova praça vocês esperam que venha do parceiro, e quanto precisa ser construída por vocês?',
    sequencia: [
      { dia: 0, canal: 'E-mail' },
      { dia: 3, canal: 'LinkedIn' },
      { dia: 7, canal: 'Ligação' },
    ],
    ofertas: ['abm', 'icp', 'gtm'],
    sucesso: 'Reunião marcada em até 30 dias.',
    mensagem:
      'Acompanho o mercado de {setor} e, quando a entrada numa praça nova vem junto com um parceiro, o que mais pesa no começo é a demanda local que cada lado precisa construir. Faz sentido trocar 20 minutos sobre como vocês estão pensando isso?',
  },
  {
    id: 'escalando_operacao',
    nome: 'Escalando operação',
    gatilho: { a: ['unidade'], b: ['contratacao'], janela: 45 },
    gatilhoTexto: 'Nova unidade + contratação, até 45 dias de distância',
    leitura: 'A expansão está saindo do papel com time próprio.',
    dor: 'Rampa de time novo; padronizar processo entre unidades.',
    procurar: [OPERACOES, COMERCIAL],
    janelaAcao: 45,
    angulo: 'Como fazer a unidade nova chegar à meta sem esperar o time amadurecer.',
    naoDizer: 'Citar as vagas diretamente.',
    descoberta: 'Em quanto tempo a unidade nova precisa se pagar?',
    sequencia: [
      { dia: 0, canal: 'E-mail' },
      { dia: 3, canal: 'LinkedIn' },
      { dia: 7, canal: 'Ligação' },
    ],
    ofertas: ['revops', 'mentorias', 'outbound'],
    sucesso: 'Reunião marcada em até 30 dias.',
    mensagem:
      'Acompanho o mercado de {setor} e, em expansão regional, o que mais atrasa a meta costuma ser a rampa do time novo e o processo diferente entre unidades. Faz sentido trocar 20 minutos sobre como vocês estão estruturando isso?',
  },
  {
    id: 'reposicionamento',
    nome: 'Reposicionamento',
    gatilho: { a: ['lancamento'], b: ['parceria'], janela: 45 },
    gatilhoTexto: 'Lançamento + nova parceria, até 45 dias de distância',
    leitura: 'Estão mudando a proposta de valor ou entrando em uma categoria nova.',
    dor: 'Mensagem nova ainda não testada; co-marketing com o parceiro.',
    procurar: [PRODUTO, MKT],
    janelaAcao: 45,
    angulo: 'Como validar o novo posicionamento com o mercado antes de escalar a mídia.',
    descoberta: 'O que muda no cliente ideal de vocês com esse movimento?',
    sequencia: [
      { dia: 0, canal: 'LinkedIn' },
      { dia: 3, canal: 'E-mail' },
      { dia: 7, canal: 'Ligação' },
    ],
    ofertas: ['branding', 'gtm', 'icp'],
    sucesso: 'Reunião marcada em até 30 dias.',
    mensagem:
      'Acompanho o mercado de {setor} e, quando a oferta muda, o passo que mais economiza mídia é validar a mensagem nova com as contas certas antes de escalar. Faz sentido trocar 20 minutos sobre isso?',
  },
  {
    id: 'momento_mudanca',
    nome: 'Momento de mudança',
    gatilho: { minimoFamilias: 3, janela: 60 },
    gatilhoTexto: '3 ou mais sinais de tipos diferentes em 60 dias, sem outra combinação',
    leitura: 'A empresa está em transformação, mesmo sem uma história única.',
    dor: 'Prioridades em disputa; orçamento sendo redistribuído.',
    procurar: [CLEVEL, MKT],
    janelaAcao: 45,
    angulo: 'Consultivo e aberto: o que está no topo da lista para o próximo trimestre.',
    descoberta: 'Muita coisa mudando aí. O que está no topo da lista para o próximo trimestre?',
    sequencia: [
      { dia: 0, canal: 'E-mail' },
      { dia: 4, canal: 'LinkedIn' },
      { dia: 8, canal: 'Ligação' },
    ],
    ofertas: ['diagnostico', 'imersoes', 'growth_leader'],
    sucesso: 'Conversa de descoberta.',
    mensagem:
      'Acompanho o mercado de {setor} e, em fases de muitas frentes ao mesmo tempo, ajuda ter um diagnóstico de onde a aquisição está travando antes de redistribuir orçamento. Faz sentido trocar 20 minutos sobre as prioridades do próximo trimestre?',
  },
];

// ---------------------------------------------------------------- detecção

export interface Ativacao {
  playbook: Playbook;
  /** os sinais que formam a combinação, do mais antigo ao mais recente */
  evidencia: Sinal[];
  /** dia em que o último sinal da combinação aconteceu */
  ativadoEm: string;
  /** fim da janela de ação (o que vier antes: janela do playbook ou validade do sinal mais antigo) */
  expiraEm: string;
  diasRestantes: number;
}

const DIA = 86_400_000;
const somarDias = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10) + 'T12:00:00Z') + n * DIA).toISOString().slice(0, 10);
const distancia = (a: Sinal, b: Sinal) => Math.abs(Date.parse(a.data.slice(0, 10)) - Date.parse(b.data.slice(0, 10))) / DIA;

function montar(playbook: Playbook, evidencia: Sinal[], dataCarga: string): Ativacao | null {
  const ord = [...evidencia].sort((a, b) => a.data.localeCompare(b.data));
  const ativadoEm = ord[ord.length - 1]!.data.slice(0, 10);
  const fimAcao = somarDias(ativadoEm, playbook.janelaAcao);
  const fimValidade = ord.map(s => somarDias(s.data, janelaDe(s))).sort()[0]!;
  const expiraEm = fimAcao < fimValidade ? fimAcao : fimValidade;
  const diasRestantes = Math.round((Date.parse(expiraEm) - Date.parse(dataCarga.slice(0, 10))) / DIA);
  if (diasRestantes < 0) return null;
  return { playbook, evidencia: ord, ativadoEm, expiraEm, diasRestantes };
}

/**
 * O playbook combinado da conta, se houver: considera só sinais positivos ainda dentro da validade na data da
 * carga. Entre pares possíveis, fica o par mais recente (e, no empate, o mais próximo).
 */
export function detectarPlaybook(sinaisDaConta: Sinal[], dataCarga: string): Ativacao | null {
  const validos = sinaisDaConta.filter(s => s.categoria !== 'negativo' && idadeDias(s, dataCarga) >= 0 && dentroDaJanela(s, dataCarga));
  const comFamilia = validos.map(s => ({ s, f: familiaDe(s.tipo) })).filter((x): x is { s: Sinal; f: Familia } => !!x.f);
  for (const pb of PLAYBOOKS) {
    const g = pb.gatilho;
    if ('a' in g) {
      let melhor: [Sinal, Sinal] | null = null;
      for (const x of comFamilia.filter(x => g.a.includes(x.f)))
        for (const y of comFamilia.filter(y => g.b.includes(y.f) && y.s.id !== x.s.id)) {
          if (distancia(x.s, y.s) > g.janela) continue;
          if (!melhor) melhor = [x.s, y.s];
          else {
            const recente = (p: [Sinal, Sinal]) => (p[0].data > p[1].data ? p[0].data : p[1].data);
            const r1 = recente([x.s, y.s]);
            const r0 = recente(melhor);
            if (r1 > r0 || (r1 === r0 && distancia(x.s, y.s) < distancia(melhor[0], melhor[1]))) melhor = [x.s, y.s];
          }
        }
      const at = melhor && montar(pb, melhor, dataCarga);
      if (at) return at;
    } else {
      // um sinal (o mais recente) por família, dentro de `janela` dias a partir do mais recente de todos
      const recentes = [...comFamilia].sort((a, b) => b.s.data.localeCompare(a.s.data));
      if (!recentes.length) continue;
      const topo = recentes[0]!.s;
      const porFamilia = new Map<Familia, Sinal>();
      for (const x of recentes) if (distancia(x.s, topo) <= g.janela && !porFamilia.has(x.f)) porFamilia.set(x.f, x.s);
      if (porFamilia.size >= g.minimoFamilias) {
        const at = montar(pb, [...porFamilia.values()], dataCarga);
        if (at) return at;
      }
    }
  }
  return null;
}

/** Playbook ativo por conta, a partir de todos os sinais da carga. */
export function playbooksPorConta(sinais: Sinal[], dataCarga: string): Map<string, Ativacao> {
  const porConta = new Map<string, Sinal[]>();
  for (const s of sinais) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
  const out = new Map<string, Ativacao>();
  for (const [id, lista] of porConta) {
    const at = detectarPlaybook(lista, dataCarga);
    if (at) out.set(id, at);
  }
  return out;
}

/** Quem do comitê já mapeado bate com a persona do playbook (pelo cargo). */
export function pessoasParaPlaybook(pb: Playbook, comite: Pick<Pessoa, 'nome' | 'cargo'>[]) {
  return pb.procurar.map(p => ({ rotulo: p.rotulo, pessoas: comite.filter(c => p.cargo.test(c.cargo)) }));
}

/** Rascunho da primeira mensagem do playbook: cita o mercado, não a vigilância. A pessoa revisa e envia. */
export function mensagemPlaybook(pb: Playbook, conta: Pick<Conta, 'segmento' | 'ramoTI'>, nome?: string) {
  const setor = (conta.ramoTI?.nome ?? conta.segmento ?? '').toLowerCase().trim() || 'vocês';
  const abre = nome ? `Oi, ${nome.split(' ')[0]}.` : 'Oi.';
  return `${abre} ${pb.mensagem.replace('{setor}', setor)}`;
}
