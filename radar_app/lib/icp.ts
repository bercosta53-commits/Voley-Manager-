import type { Base, Conta, Pessoa } from './tipos';
import { ACOES_DE_ABORDAGEM } from './avaliacao';
import { normalizar } from './contas';
import { diasEntre } from './utils';

/**
 * Aba ICP: a mesma regra de tier de scripts/qualificar_icp.py (regras em data/icp.json), conta a conta, com
 * alavancas para simular "e se" — SaaS como ramo principal, sede ainda não confirmada, faturamento validado
 * obrigatório, região e um mínimo de gatilhos comportamentais no Tier A. Com tudo desligado, reproduz os
 * tiers atuais da base.
 */

export interface RegrasIcp {
  regiao: string[];
  ramosPrincipais: string[];
  ramosSecundarios: string[];
  ramosFora: string[];
  especializacoesExcluidas: string[];
  portesAbaixo: string[];
  faturamentoAlvo: string;
}

export interface Alavancas {
  saas: boolean;
  sedeNaoConfirmada: boolean;
  exigirFaturamento: boolean;
  regiao: string[];
  minGatilhos: number;
}

export type Tier = 'A' | 'B' | 'C';
export type MotivoExclusao = 'regiao' | 'porte' | 'ramo' | 'b2c';

/** Barreiras de compra (G3): o que alonga o ciclo. */
export const BARREIRAS = [
  { bit: 1, rotulo: 'Homologação', curto: 'Homolog.', dica: 'Cadastro de fornecedor, documentação, procurement e jurídico do comprador' },
  { bit: 2, rotulo: 'Compliance do fornecedor', curto: 'Compliance', dica: 'Due diligence de segurança: questionário, ISO 27001, LGPD, pentest, cláusulas' },
  { bit: 4, rotulo: 'Prova técnica', curto: 'POC', dica: 'Piloto, POC ou avaliação técnica antes do contrato' },
  { bit: 8, rotulo: 'Integração', curto: 'Integração', dica: 'Implantação com sistemas legados e áreas envolvidas' },
  { bit: 16, rotulo: 'Licitação', curto: 'Licitação', dica: 'Compra pública com edital e prazos legais' },
] as const;

/** Oferta (ramo de TI) → barreiras típicas e faixa de ciclo (1 curto … 4 muito longo). */
const OFERTA: Record<string, [number, number]> = {
  'Outsourcing de Tecnologia': [1 | 2, 3],
  'Serviços Gerenciados de TI': [1 | 2 | 8, 3],
  Cibersegurança: [1 | 2 | 4, 3],
  'Identidade e Controle de Acesso': [2 | 4 | 8, 3],
  'Segurança e Privacidade de Dados': [1 | 2, 3],
  'Cloud Computing': [1 | 2 | 8, 3],
  'Data Centers e Hosting': [1 | 2, 3],
  'Telecomunicações B2B': [1 | 8, 3],
  'Sistemas de Gestão Empresarial': [1 | 4 | 8, 3],
  'Implantação de Sistemas': [1 | 8, 3],
  'Internet das Coisas (IoT)': [4 | 8, 3],
  'Automação Industrial': [4 | 8, 3],
  'Integração de Sistemas': [4 | 8, 2],
  'Consultoria em Tecnologia': [1, 2],
  'Desenvolvimento de Software': [1 | 4, 2],
  'Engenharia de Dados': [2 | 8, 2],
  'Business Intelligence e Analytics': [4 | 8, 2],
  'Inteligência Artificial': [2 | 4, 2],
  'Automação de Processos': [4 | 8, 2],
  'DevOps e Qualidade de Software': [1, 2],
  'Infraestrutura e Redes': [1 | 8, 2],
  'Hardware e Equipamentos de TI': [1, 2],
  'Software Especializado': [4 | 8, 2],
  'Aplicativos e Produtos Digitais': [1, 2],
  'SaaS B2B': [4, 1],
  'Tecnologia para E-commerce': [0, 1],
};
export const FAIXAS_CICLO = [
  { band: 1, rotulo: 'Curto', prazo: '< 1 mês', cor: 'var(--vr-ok)' },
  { band: 2, rotulo: 'Médio', prazo: '1–3 meses', cor: 'var(--vr-warm)' },
  { band: 3, rotulo: 'Longo', prazo: '3–9 meses', cor: 'color-mix(in srgb, var(--vr-warm) 50%, var(--vr-risk))' },
  { band: 4, rotulo: 'Muito longo', prazo: '9+ meses', cor: 'var(--vr-risk)' },
] as const;
const VERTICAIS_REGULADAS = ['ESP01', 'ESP02', 'ESP03', 'ESP15', 'ESP14'];

/** Gatilhos comportamentais: como a empresa vende hoje (dores que o diagnóstico da Velora resolve). */
export const GATILHOS = [
  { id: 1, tag: 'Pedido', curto: 'Lid. rasa', nome: 'Liderança comercial rasa', def: 'Vendas no máximo até coordenação e marketing no máximo até gerência.', como: 'cargos do comitê: maior nível em vendas e em marketing.' },
  { id: 2, tag: 'Pedido', curto: 'Customiz.', nome: 'Produto customizado e pouco escalável', def: 'Receita de serviço ou projeto: implantação, fábrica, outsourcing, integração.', como: 'modelo de negócio + o que a empresa faz.' },
  { id: 3, tag: 'Pedido', curto: 'Ciclo longo', nome: 'Ciclo de venda médio a longo', def: 'Deduzido da oferta: homologação, compliance exigido do fornecedor, prova técnica, integração ou licitação alongam a compra.', como: 'tipo de oferta + quem a empresa atende (regulado, enterprise, governo).' },
  { id: 4, tag: 'Sugestão', curto: 'Fundador', nome: 'Venda nas mãos do fundador', def: 'CEO ou sócio no comitê e ninguém acima de gerente em vendas ou marketing: o fundador é o gargalo comercial.', como: 'cargos do comitê.' },
  { id: 5, tag: 'Sugestão', curto: 'Platô', nome: 'Maturidade sem tração nova', def: '10+ anos de CNPJ e nenhum sinal de crescimento no Radar: cresceu por indicação e bateu teto.', como: 'data de abertura + ausência de captação, expansão, vaga ou filial.' },
] as const;

export interface ContaIcp {
  conta: Conta;
  uf: string;
  vertical: string;
  familia: string;
  segmento: string;
  /** tier gravado na base hoje */
  tierAtual: Tier;
  /** pedaços da regra, independentes das alavancas */
  ramo: 'principal' | 'secundario' | 'fora' | 'sem';
  b2c: boolean;
  ufConfirmada: boolean;
  porte: 'abaixo' | 'validado' | 'sem';
  /** gatilhos que batem (1–5) e os medidos com dado incompleto */
  gatilhos: Set<number>;
  incompletos: Set<number>;
  ciclo: number;
  barreiras: number;
  papeis: Set<string>;
  comiteCompleto: boolean;
}

const NIVEL_CARGO: [number, RegExp][] = [
  [5, /\b(ceo|cfo|cto|coo|cmo|cro|cco|cio|cso|cpo|chief|presidente|founder|fundador|fundadora|co-founder|cofundador|socio|socia|partner|owner)\b/],
  [4, /\b(vp|vice|diretor|diretora|director)\b/],
  [3.5, /\bhead\b/],
  [3, /\b(gerente|manager|gestor|gestora)\b/],
  [2, /\b(coordenador|coordenadora|supervisor|supervisora|lider|lead)\b/],
];
const nivel = (p: Pessoa) => NIVEL_CARGO.find(([, r]) => r.test(normalizar(p.cargo)))?.[0] ?? 1;
const FUNDADOR = /\b(ceo|founder|fundador|fundadora|co-founder|cofundador|socio|socia|owner|presidente)\b/;
const CLIENTE_GOVERNO = /\b(governo|prefeitura|setor publico|publico|municipios|orgaos)\b/;
const CLIENTE_ENTERPRISE = /\b(enterprise|grandes empresas|corporativ|multinaciona|industrias)\b/;
const CLIENTE_REGULADO = /\b(banco|bancos|financeir|seguradora|saude|hospita|energia|telecom|regulad)\b/;

/** Features da conta para o simulador (calculado uma vez). */
export function prepararContas(base: Base, regras: RegrasIcp): ContaIcp[] {
  const hoje = base.geradoEm;
  const crescimento = new Set(
    [...base.sinais.map(s => ({ id: s.contaId, s })), ...base.contas.flatMap(c => c.historico.map(h => ({ id: c.id, s: h })))]
      .filter(({ s }) => ['captacao', 'expansao_mercado', 'nova_unidade', 'vaga_area_alvo', 'vaga_lideranca_alvo', 'vaga_expansao_comercial'].includes(s.tipo) && diasEntre(s.data, hoje) <= 365)
      .map(({ id }) => id),
  );
  return base.contas.map(c => {
    const codRamo = c.ramoTI?.codigo ?? 'A classificar';
    const esp = c.especializacao?.codigo ?? 'GEN';
    const uf = (c.uf ?? '').toUpperCase();
    const ramo: ContaIcp['ramo'] = regras.ramosPrincipais.includes(codRamo)
      ? c.modeloNegocio === 'produto'
        ? 'secundario'
        : 'principal'
      : regras.ramosSecundarios.includes(codRamo)
        ? 'secundario'
        : regras.ramosFora.includes(codRamo)
          ? 'fora'
          : 'sem';
    const porteTxt = normalizar(c.porte ?? '');
    const porte: ContaIcp['porte'] = !porteTxt ? 'sem' : regras.portesAbaixo.some(p => normalizar(p) === porteTxt) ? 'abaixo' : 'validado';

    // G1/G4: níveis em vendas e marketing pelo comitê
    const vendas = c.comite.filter(p => p.area === 'comercial').map(nivel);
    const mkt = c.comite.filter(p => p.area === 'marketing').map(nivel);
    const maxV = Math.max(0, ...vendas);
    const maxM = Math.max(0, ...mkt);
    const semComercial = !vendas.length && !mkt.length;
    const gatilhos = new Set<number>();
    const incompletos = new Set<number>();
    if (maxV <= 2 && maxM <= 3) gatilhos.add(1);
    if (semComercial) incompletos.add(1).add(4);
    if (c.modeloNegocio === 'servico' || c.modeloNegocio === 'misto') gatilhos.add(2);
    // G3: ciclo deduzido da oferta + do cliente atendido
    const texto = normalizar(`${c.oQueFaz ?? ''} ${c.segmento ?? ''}`);
    const of = OFERTA[c.ramoTI?.nome ?? ''];
    let barreiras = of?.[0] ?? 0;
    let ciclo = of?.[1] ?? 0;
    if (of) {
      if (esp === 'ESP09' || CLIENTE_GOVERNO.test(texto)) {
        barreiras |= 16;
        ciclo += 1;
      }
      if (VERTICAIS_REGULADAS.includes(esp) || CLIENTE_REGULADO.test(texto)) {
        barreiras |= 2;
        ciclo = Math.max(ciclo, 2);
      }
      if (CLIENTE_ENTERPRISE.test(texto)) {
        barreiras |= 1;
        ciclo = Math.max(ciclo, 2);
      }
      ciclo = Math.min(4, ciclo);
    }
    if (ciclo >= 2) gatilhos.add(3);
    const temFundador = c.comite.some(p => FUNDADOR.test(normalizar(p.cargo)));
    if (temFundador && maxV <= 3 && maxM <= 3) gatilhos.add(4);
    const fundacao = c.dataAbertura ?? (c.anoFundacao ? `${c.anoFundacao}-07-01` : null);
    if (fundacao) {
      if (diasEntre(fundacao, hoje) >= 3652 && !crescimento.has(c.id)) gatilhos.add(5);
      if (!c.dataAbertura) incompletos.add(5); // ano de fundação de pesquisa: medição ainda a validar
    } else incompletos.add(5);

    return {
      conta: c,
      uf,
      vertical: esp === 'GEN' ? 'Generalista' : (c.especializacao?.nome ?? 'Generalista'),
      familia: c.ramoTI?.familia || 'Sem classificação',
      segmento: c.ramoTI?.nome && c.ramoTI.nome !== 'A classificar' ? c.ramoTI.nome : 'Sem segmento',
      tierAtual: (c.icp?.tier ?? c.tier ?? 'C') as Tier,
      ramo,
      b2c: ramo === 'fora' || regras.especializacoesExcluidas.includes(esp),
      ufConfirmada: !!uf && (c.ufFonte === 'receita' || c.ufFonte === 'site'),
      porte,
      gatilhos,
      incompletos,
      ciclo,
      barreiras,
      papeis: new Set(c.comite.map(p => p.papelAbm ?? '').filter(Boolean)),
      comiteCompleto: !(c.comiteFaltando ?? []).length,
    };
  });
}

/** Tier simulado + por que a conta ficou fora (para os cards de exclusão). */
export function tierSimulado(a: ContaIcp, al: Alavancas): { tier: Tier; exclusao?: MotivoExclusao } {
  if (a.b2c) return { tier: 'C', exclusao: 'b2c' };
  if (a.ramo === 'sem') return { tier: 'C', exclusao: 'ramo' };
  if (a.uf && !al.regiao.includes(a.uf)) return { tier: 'C', exclusao: 'regiao' };
  if (a.porte === 'abaixo') return { tier: 'C', exclusao: 'porte' };
  const ramoOk = a.ramo === 'principal' || (a.ramo === 'secundario' && al.saas);
  const sedeOk = !!a.uf && (a.ufConfirmada || al.sedeNaoConfirmada);
  const porteOk = !al.exigirFaturamento || a.porte === 'validado';
  let tier: Tier = ramoOk && sedeOk && porteOk ? 'A' : 'B';
  if (tier === 'A' && a.gatilhos.size < al.minGatilhos) tier = 'B';
  return { tier };
}

export const ALAVANCAS_ATUAIS = (regras: RegrasIcp): Alavancas => ({ saas: false, sedeNaoConfirmada: false, exigirFaturamento: false, regiao: [...regras.regiao], minGatilhos: 0 });

/** Tudo o que a aba mostra para um cenário de alavancas. */
export function simular(contas: ContaIcp[], al: Alavancas) {
  const linhas = contas.map(a => ({ ...a, ...tierSimulado(a, al) }));
  const conta = (t: Tier) => linhas.filter(l => l.tier === t).length;
  const A = linhas.filter(l => l.tier === 'A');
  const exclusoes = (['regiao', 'porte', 'ramo', 'b2c'] as MotivoExclusao[]).map(m => ({ motivo: m, n: linhas.filter(l => l.exclusao === m).length }));
  const umAUm = A.filter(l => l.conta.score >= 40).length;
  const umMany = linhas.filter(l => l.tier === 'B' && l.uf && al.regiao.includes(l.uf)).length;
  const entram = linhas.filter(l => l.tier === 'A' && l.tierAtual !== 'A').sort((x, y) => y.conta.score - x.conta.score);
  const saem = linhas.filter(l => l.tier !== 'A' && l.tierAtual === 'A').sort((x, y) => y.conta.score - x.conta.score);
  const porque = (l: (typeof linhas)[number]) =>
    l.uf && !al.regiao.includes(l.uf)
      ? 'fora da região'
      : al.exigirFaturamento && l.porte !== 'validado'
        ? 'sem faturamento validado'
        : l.gatilhos.size < al.minGatilhos
          ? `${l.gatilhos.size} de ${al.minGatilhos} gatilhos`
          : 'regra alterada';
  const naRegiao = linhas.filter(l => l.uf && al.regiao.includes(l.uf)).length;
  const classificadas = linhas.filter(l => l.uf && al.regiao.includes(l.uf) && !l.exclusao).length;
  const funil = [
    { rotulo: 'Base total', n: linhas.length },
    { rotulo: `Na região ${al.regiao.join('/') || '—'}`, n: naRegiao },
    { rotulo: 'Ramo classificado, sem exclusão', n: classificadas },
    { rotulo: 'Tier A', n: A.length },
    { rotulo: 'Tier A com comitê completo', n: A.filter(l => l.comiteCompleto).length },
    { rotulo: 'Prontas para ativar', n: A.filter(l => l.conta.acaoRecomendada && ACOES_DE_ABORDAGEM.has(l.conta.acaoRecomendada)).length },
  ];
  return {
    linhas,
    nA: A.length,
    nB: conta('B'),
    nC: conta('C'),
    exclusoes,
    saasAfetadas: linhas.filter(l => l.ramo === 'secundario').length,
    aSemFaturamento: A.filter(l => l.porte !== 'validado').length,
    programa: { umAUm, umFew: A.length - umAUm, umMany },
    entram,
    saem,
    porque,
    funil,
  };
}
