import type { Base, Conta } from './tipos';
import { normalizar } from './contas';
import { faltandoNoComite, papelNoComite } from './papeis';

/**
 * ICP oficial = tier persistido no snapshot. O simulador é apenas um cenário, calculado
 * sobre as evidências da requalificação 2G. Nunca altera o ICP ou o VSCS gravado.
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
  oficial?: boolean;
  saas: boolean;
  sedeNaoConfirmada: boolean;
  exigirFaturamento: boolean;
  regiao: string[];
  minGatilhos: number;
}

export type Tier = 'A' | 'B' | 'C';
export type MotivoExclusao = 'regiao' | 'porte' | 'ramo' | 'b2c' | 'outro';

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
  { id: 1, tag: 'Pedido', curto: 'Lid. rasa', nome: 'Liderança comercial rasa', def: 'Vendas no máximo até coordenação e marketing no máximo até gerência.', como: 'Pesquisa registrada da estrutura e dos mandatos; comitê incompleto não comprova ausência.' },
  { id: 2, tag: 'Pedido', curto: 'Customiz.', nome: 'Produto customizado e pouco escalável', def: 'Receita de serviço ou projeto: implantação, fábrica, outsourcing, integração.', como: 'Evidência registrada de projetos customizados; modelo de serviço isolado não basta.' },
  { id: 3, tag: 'Pedido', curto: 'Ciclo longo', nome: 'Ciclo de venda médio a longo', def: 'Deduzido da oferta: homologação, compliance exigido do fornecedor, prova técnica, integração ou licitação alongam a compra.', como: 'Barreiras documentadas ou inferência de alta confiança na requalificação.' },
  { id: 4, tag: 'Sugestão', curto: 'Fundador', nome: 'Venda nas mãos do fundador', def: 'Dependência efetiva do fundador para gerar ou fechar negócios.', como: 'Evidência do mandato comercial, não ausência de cargos no cadastro.' },
  { id: 5, tag: 'Sugestão', curto: 'Platô', nome: 'Maturidade sem tração nova', def: 'Maturidade com estagnação ou pouca tração demonstrada por trajetória comparável.', como: 'Série de receita, clientes ou equipe; falta de sinais não prova estagnação.' },
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
  porte: 'abaixo' | 'acima' | 'validado' | 'sem';
  revisaoEstruturalPendente: boolean;
  statusIcp?: string;
  /** gatilhos que batem (1–5) e os medidos com dado incompleto */
  gatilhos: Set<number>;
  incompletos: Set<number>;
  ciclo: number;
  barreiras: number;
  papeis: Set<string>;
  comiteCompleto: boolean;
}

const CLIENTE_GOVERNO = /\b(governo|prefeitura|setor publico|publico|municipios|orgaos)\b/;
const CLIENTE_ENTERPRISE = /\b(enterprise|grandes empresas|corporativ|multinaciona|industrias)\b/;
const CLIENTE_REGULADO = /\b(banco|bancos|financeir|seguradora|saude|hospita|energia|telecom|regulad)\b/;

/** Features da conta para o simulador (calculado uma vez). */
export function prepararContas(base: Base, regras: RegrasIcp): ContaIcp[] {
  return base.contas.map(c => {
    const revisao = c.icpEvidencia?.requalificacao2G;
    const codRamo = revisao?.ramoAvaliado ?? c.ramoTI?.codigo ?? 'A classificar';
    const esp = c.especializacao?.codigo ?? 'GEN';
    const uf = (revisao?.sede?.uf || c.uf || '').toUpperCase();
    const modelo = revisao?.modeloAvaliado ?? c.modeloNegocio;
    const ramo: ContaIcp['ramo'] = regras.ramosPrincipais.includes(codRamo)
      ? modelo === 'produto'
        ? 'secundario'
        : 'principal'
      : regras.ramosSecundarios.includes(codRamo)
        ? 'secundario'
        : regras.ramosFora.includes(codRamo)
          ? 'fora'
          : 'sem';
    const faturamento = revisao?.faturamento?.status;
    const porteTxt = normalizar(c.porte ?? '');
    const porte: ContaIcp['porte'] = faturamento === 'faixa' ? 'validado'
      : faturamento === 'acima' ? 'acima'
      : faturamento === 'abaixo' || (!faturamento && regras.portesAbaixo.some(p => normalizar(p) === porteTxt)) ? 'abaixo'
      : 'sem';
    // Só evidência persistida favorável conta. Desconhecido não é positivo.
    const gatilhos = new Set<number>();
    const incompletos = new Set<number>();
    for (const i of [1, 2, 3, 4, 5]) {
      const g = revisao?.gatilhos?.[`g${i}`];
      if (g?.contaParaTierA === true) gatilhos.add(i);
      else if (!g?.status || !g.status.startsWith('contrario')) incompletos.add(i);
    }
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
    return {
      conta: c,
      uf,
      vertical: esp === 'GEN' ? 'Generalista' : (c.especializacao?.nome ?? 'Generalista'),
      familia: c.ramoTI?.familia || 'Sem classificação',
      segmento: c.ramoTI?.nome && c.ramoTI.nome !== 'A classificar' ? c.ramoTI.nome : 'Sem segmento',
      tierAtual: (['A', 'B', 'C'].includes(c.tier) ? c.tier : c.icp?.tier ?? 'C') as Tier,
      ramo,
      b2c: ramo === 'fora' || regras.especializacoesExcluidas.includes(esp),
      ufConfirmada: !!uf && (!!revisao?.sede?.url || c.ufFonte === 'receita' || c.ufFonte === 'site'),
      porte,
      statusIcp: revisao?.status,
      revisaoEstruturalPendente: !revisao || (revisao.pendencias ?? []).includes('validacao_estrutural'),
      gatilhos,
      incompletos,
      ciclo,
      barreiras,
      papeis: new Set<string>(c.comite.flatMap(p => [papelNoComite(p), ...(p.papeisExtras ?? [])])),
      comiteCompleto: !faltandoNoComite(c).length,
    };
  });
}

/** Tier simulado + por que a conta ficou fora (para os cards de exclusão). */
export function tierSimulado(a: ContaIcp, al: Alavancas): { tier: Tier; exclusao?: MotivoExclusao } {
  if (al.oficial) {
    if (a.tierAtual !== 'C') return { tier: a.tierAtual };
    const exclusao: MotivoExclusao = a.b2c ? 'b2c' : a.uf && !al.regiao.includes(a.uf) ? 'regiao' : a.porte === 'abaixo' || a.porte === 'acima' ? 'porte' : a.ramo === 'sem' ? 'ramo' : 'outro';
    return { tier: 'C', exclusao };
  }
  if (a.b2c) return { tier: 'C', exclusao: 'b2c' };
  if (a.ramo === 'sem') return { tier: 'C', exclusao: 'ramo' };
  if (a.uf && !al.regiao.includes(a.uf)) return { tier: 'C', exclusao: 'regiao' };
  if (a.porte === 'abaixo' || a.porte === 'acima') return { tier: 'C', exclusao: 'porte' };
  const ramoOk = a.ramo === 'principal' || (a.ramo === 'secundario' && al.saas);
  const sedeOk = !!a.uf && (a.ufConfirmada || al.sedeNaoConfirmada);
  const porteOk = !al.exigirFaturamento || a.porte === 'validado';
  let tier: Tier = ramoOk && sedeOk && porteOk && !a.revisaoEstruturalPendente ? 'A' : 'B';
  if (tier === 'A' && a.gatilhos.size < al.minGatilhos) tier = 'B';
  return { tier };
}

export const ALAVANCAS_ATUAIS = (regras: RegrasIcp): Alavancas => ({ oficial: true, saas: false, sedeNaoConfirmada: false, exigirFaturamento: false, regiao: [...regras.regiao], minGatilhos: 2 });

/** Tudo o que a aba mostra para um cenário de alavancas. */
export function simular(contas: ContaIcp[], al: Alavancas) {
  const linhas = contas.map(a => ({ ...a, ...tierSimulado(a, al) }));
  const conta = (t: Tier) => linhas.filter(l => l.tier === t).length;
  const A = linhas.filter(l => l.tier === 'A');
  const exclusoes = (['regiao', 'porte', 'ramo', 'b2c', 'outro'] as MotivoExclusao[]).map(m => ({ motivo: m, n: linhas.filter(l => l.exclusao === m).length }));
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
    { rotulo: 'Prontas para ativar', n: A.filter(l => l.conta.qualificada?.status === 'sim').length },
  ];
  return {
    linhas,
    oficial: al.oficial === true,
    aValidadas: A.filter(l => l.statusIcp === 'a_validado' && l.tierAtual === 'A').length,
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
