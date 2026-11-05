/**
 * Tipos e regras puras do Radar de Proximidade — usado tanto no servidor (geração da base sintética)
 * quanto no cliente (filtros, rótulos, legenda), por isso não é server-only.
 *
 * Radar de Proximidade: distância = peças faltantes até a primeira conversa, não um score opaco.
 * Modelo e regras seguem a spec "Velora Radar — Módulo Radar de Proximidade" (Fase 1: protótipo).
 */

export type Braco = 'servicos_profissionais' | 'servicos_financeiros' | 'tecnologia' | 'adjacente';

export const BRACOS: { id: Braco; rotulo: string; rotuloCurto: string; subsegmentos: string[] }[] = [
  { id: 'servicos_profissionais', rotulo: 'Serviços profissionais B2B', rotuloCurto: 'Profissionais', subsegmentos: ['Advocacia', 'Auditoria', 'Contábil', 'Tributário'] },
  { id: 'servicos_financeiros', rotulo: 'Serviços financeiros', rotuloCurto: 'Financeiro', subsegmentos: ['Cooperativas', 'Seguros', 'Previdência', 'Consórcios'] },
  { id: 'tecnologia', rotulo: 'Tecnologia B2B madura', rotuloCurto: 'Tecnologia', subsegmentos: ['SaaS vertical', 'Infraestrutura', 'Dados e IA', 'Segurança'] },
  { id: 'adjacente', rotulo: 'Adjacente', rotuloCurto: 'Adjacente', subsegmentos: ['Outros'] },
];

export type UF = 'SP' | 'PR' | 'SC' | 'RS';
export const UFS: UF[] = ['SP', 'PR', 'SC', 'RS'];

export type Anel = 1 | 2 | 3 | 4;
export const ANEIS: { id: Anel; rotulo: string; descricao: string }[] = [
  { id: 1, rotulo: 'Pronta para ativar', descricao: 'Fit, sinal, pessoa e canal — as quatro peças no lugar.' },
  { id: 2, rotulo: 'Ponto de contato à vista', descricao: 'Fit no ICP; falta exatamente uma peça para ativar.' },
  { id: 3, rotulo: 'Em observação', descricao: 'Fit no ICP, mas ainda sem sinal, pessoa ou canal.' },
  { id: 4, rotulo: 'Horizonte', descricao: 'Fora do ICP principal ou ainda não tratada.' },
];

export interface Dimensoes {
  fit: number;
  timing: number;
  access: number;
  engagement: number;
}

export const PESOS_PADRAO: Record<keyof Dimensoes, number> = { fit: 0.3, timing: 0.3, access: 0.25, engagement: 0.15 };
export const VERSAO_PESOS = '2026.1-proto';

export const TIPOS_SINAL: { id: string; rotulo: string; peso: number }[] = [
  { id: 'troca_lideranca', rotulo: 'Troca de C-level / novo diretor comercial ou de marketing', peso: 1.0 },
  { id: 'vaga_aberta', rotulo: 'Vaga aberta em marketing, vendas ou growth', peso: 0.8 },
  { id: 'expansao', rotulo: 'Expansão, nova unidade, captação ou M&A', peso: 0.8 },
  { id: 'lancamento', rotulo: 'Lançamento de produto ou serviço', peso: 0.6 },
  { id: 'mencao', rotulo: 'Menção em notícia setorial', peso: 0.3 },
];
const PESO_SINAL = new Map(TIPOS_SINAL.map(t => [t.id, t.peso]));

/** Meia-vida de ~30 dias: um sinal perde metade do peso a cada ~31 dias. */
export const decaimento = (dias: number) => Math.exp(-dias / 45);

export interface FatoSinal {
  tipo: string;
  diasAtras: number;
}

export function calcularTiming(sinais: FatoSinal[]): number {
  if (!sinais.length) return 0;
  return Math.min(1, Math.max(...sinais.map(s => (PESO_SINAL.get(s.tipo) ?? 0.3) * decaimento(s.diasAtras))));
}

export interface FatosAcesso {
  pessoaMapeada: boolean;
  canalVerificado: boolean;
  caminhoQuente: boolean;
}

export function calcularAccess(f: FatosAcesso): number {
  return (f.pessoaMapeada ? 0.4 : 0) + (f.canalVerificado ? 0.3 : 0) + (f.caminhoQuente ? 0.3 : 0);
}

export function proximity(d: Dimensoes, pesos: Record<keyof Dimensoes, number> = PESOS_PADRAO): number {
  return d.fit * pesos.fit + d.timing * pesos.timing + d.access * pesos.access + d.engagement * pesos.engagement;
}

/**
 * O anel é decidido por regra (prioridade sobre o score); o score só posiciona a conta dentro do anel.
 * As "três peças" são sinal relevante (timing ≥ 0.5), pessoa mapeada e canal verificado — caminho quente é
 * bônus de score, nunca obrigatório (ver "Decisões em aberto" da spec). Para fit ≥ 0.6 com 0 ou 1 peça
 * presente, a spec só define os extremos (3 peças → anel 1, falta exatamente 1 → anel 2, nenhuma → anel 3);
 * tratamos "falta mais de uma" (0 ou 1 peça) como anel 3 por inteiro, já que nenhum dos dois é "quase pronta".
 */
export function calcularAnel(fit: number, sinalRelevante: boolean, f: FatosAcesso): Anel {
  if (fit < 0.6) return 4;
  const pecas = (sinalRelevante ? 1 : 0) + (f.pessoaMapeada ? 1 : 0) + (f.canalVerificado ? 1 : 0);
  if (pecas === 3) return 1;
  if (pecas === 2) return 2;
  return 3;
}

export function pecasFaltantes(sinalRelevante: boolean, f: FatosAcesso, diasDesdeUltimoSinal: number | null): string[] {
  const pecas: string[] = [];
  if (!f.pessoaMapeada) pecas.push('Mapear o dono do problema ou o pagador');
  else if (!f.canalVerificado) pecas.push('Validar e-mail ou LinkedIn do decisor');
  if (!sinalRelevante) {
    pecas.push(diasDesdeUltimoSinal == null ? 'Nenhum sinal registrado ainda' : `Sem sinal há ${diasDesdeUltimoSinal} dias — manter em observação`);
  }
  if (!f.caminhoQuente) pecas.push('Buscar conexão de 1º/2º grau para apresentação');
  return pecas;
}

/** Hash FNV-1a determinístico → [0, 1): a mesma conta cai sempre no mesmo ponto dentro da fatia. */
export function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Muda o raio só quando a diferença supera 0.05, para a nuvem não tremer com ruído de 1 ponto. */
export function suavizarTrajetoria(pontos: number[]): number[] {
  const suave: number[] = [];
  let atual = pontos[0] ?? 0;
  for (const p of pontos) {
    if (Math.abs(p - atual) >= 0.05) atual = p;
    suave.push(atual);
  }
  return suave;
}

export interface PontoTrajetoria {
  diaOffset: number; // 0 = 90 dias atrás, 90 = hoje
  proximity: number;
  anel: Anel;
}

export interface PessoaComite {
  nome: string;
  cargo: string;
  papelIcp: 'dono_problema' | 'pagador' | 'influenciador' | 'guardiao';
  mapeado: boolean;
  canalVerificado: boolean;
}

export interface ContaProximidade {
  id: string;
  nome: string;
  dominio: string;
  braco: Braco;
  subsegmento: string;
  uf: UF;
  potencial: number; // 0-1, tamanho do ponto no radar
  dimensoes: Dimensoes;
  proximity: number;
  anel: Anel;
  sinalRelevante: boolean;
  acesso: FatosAcesso;
  pecasFaltantes: string[];
  ultimoSinal: { tipo: string; rotulo: string; diasAtras: number } | null;
  caminhoQuenteVia: string | null;
  comite: PessoaComite[];
  convertida: boolean;
  trajetoria: PontoTrajetoria[];
}

export interface BaseProximidade {
  geradoEm: string;
  metaZonaAtivacao: number;
  pesos: Record<keyof Dimensoes, number>;
  versaoPesos: string;
  contas: ContaProximidade[];
}
