import 'server-only';
import {
  BRACOS,
  UFS,
  TIPOS_SINAL,
  PESOS_PADRAO,
  VERSAO_PESOS,
  calcularAccess,
  calcularAnel,
  calcularTiming,
  pecasFaltantes,
  proximity,
  suavizarTrajetoria,
  type Anel,
  type BaseProximidade,
  type Braco,
  type ContaProximidade,
  type Dimensoes,
  type FatosAcesso,
  type PessoaComite,
  type PontoTrajetoria,
  type UF,
} from './proximidade';

/** Fase 1 — protótipo: ~400 contas fictícias, determinísticas (mesma seed → mesma base sempre). */
const SEED = 20261105;
const N_CONTAS = 400;
const JANELA_DIAS = 90;
const PASSO_DIAS = 3;

// mulberry32: PRNG simples e determinístico — suficiente para dados sintéticos, não para criptografia.
function criarRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const escolher = <T,>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const entre = (rng: () => number, min: number, max: number) => min + rng() * (max - min);
const chance = (rng: () => number, p: number) => rng() < p;

const PREFIXOS_PJ = [
  'Castro', 'Medeiros', 'Albuquerque', 'Nogueira', 'Teixeira', 'Barbosa', 'Siqueira', 'Cavalcanti',
  'Monteiro', 'Azevedo', 'Pimentel', 'Bastos', 'Lacerda', 'Vasconcelos', 'Guimarães', 'Carneiro',
  'Dantas', 'Moraes', 'Resende', 'Tavares', 'Marinho', 'Queiroz', 'Peixoto', 'Andrade',
];
const REGIOES = ['Vale do Sol', 'Serra Azul', 'Planalto', 'Litoral Sul', 'Campos Gerais', 'Pampa', 'Horizonte', 'Serra Clara', 'Vale Novo', 'Alto da Serra'];
const SILABAS_TECH = ['Nex', 'Vero', 'Orbi', 'Fluxo', 'Dyna', 'Quanta', 'Nimbus', 'Zenith', 'Core', 'Byte', 'Astra', 'Vertex', 'Prisma', 'Lumen', 'Soma', 'Vetta'];
const SUFIXOS_TECH = ['Tech', 'Labs', 'Systems', 'Digital', 'Cloud', 'Data', 'Soft', 'Hub'];
const NOMES_GENERICOS = ['Atlas', 'Bravo', 'Cedro', 'Delta', 'Éter', 'Fenix', 'Girassol', 'Horizonte', 'Ipê', 'Jade', 'Kiron', 'Lume'];

function nomeEmpresa(rng: () => number, braco: Braco, subsegmento: string): string {
  if (braco === 'servicos_profissionais') {
    const socios = `${escolher(rng, PREFIXOS_PJ)} ${escolher(rng, PREFIXOS_PJ)}`;
    const sufixo =
      subsegmento === 'Advocacia' ? 'Advogados Associados' : subsegmento === 'Auditoria' ? 'Auditores Independentes' : subsegmento === 'Contábil' ? 'Contabilidade' : 'Consultoria Tributária';
    return `${socios} ${sufixo}`;
  }
  if (braco === 'servicos_financeiros') {
    if (subsegmento === 'Cooperativas') return `Cooperativa de Crédito ${escolher(rng, REGIOES)}`;
    const stem = escolher(rng, PREFIXOS_PJ);
    if (subsegmento === 'Seguros') return `Seguradora ${stem}`;
    if (subsegmento === 'Previdência') return `${stem} Previdência`;
    return `${stem} Consórcios`;
  }
  if (braco === 'tecnologia') return `${escolher(rng, SILABAS_TECH)}${escolher(rng, SILABAS_TECH).toLowerCase()} ${escolher(rng, SUFIXOS_TECH)}`;
  return `${escolher(rng, NOMES_GENERICOS)} ${escolher(rng, SUFIXOS_TECH)}`;
}

const dominioDe = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) + '.com.br';

const PRIMEIROS_NOMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcelo', 'Natália', 'Otávio', 'Patrícia', 'Rodrigo', 'Sofia', 'Thiago', 'Vanessa', 'William'];

const nomePessoa = (rng: () => number) => `${escolher(rng, PRIMEIROS_NOMES)} ${escolher(rng, PREFIXOS_PJ)}`;

const CARGOS_POR_PAPEL: Record<PessoaComite['papelIcp'], string[]> = {
  dono_problema: ['Diretor de Operações', 'Head de Produto', 'Gerente de TI', 'Diretor Comercial'],
  pagador: ['CFO', 'Diretor Financeiro', 'CEO'],
  influenciador: ['Coordenador de Marketing', 'Analista Sênior', 'Gerente de Projetos'],
  guardiao: ['Chefe de Gabinete', 'Assistente Executiva da Diretoria'],
};

function gerarComite(rng: () => number, pessoaMapeada: boolean, canalVerificado: boolean): PessoaComite[] {
  if (!pessoaMapeada) return [];
  const papeis: PessoaComite['papelIcp'][] = chance(rng, 0.6) ? ['dono_problema', 'pagador'] : ['pagador'];
  if (chance(rng, 0.4)) papeis.push('influenciador');
  return papeis.map((papelIcp, i) => ({
    nome: nomePessoa(rng),
    cargo: escolher(rng, CARGOS_POR_PAPEL[papelIcp]),
    papelIcp,
    mapeado: true,
    canalVerificado: i === 0 ? canalVerificado : chance(rng, 0.5),
  }));
}

/** Facts "como estavam" num dia qualquer da janela, para a trajetória contar uma história real (não só interpolar números). */
interface LinhaDoTempoConta {
  diaPessoaMapeada: number | null; // offset (0..90) em que a pessoa foi mapeada; null = nunca
  diaCanalVerificado: number | null;
  diaCaminhoQuente: number | null;
  sinais: { tipo: string; diaOffset: number }[]; // dia em que o sinal ocorreu
}

function gerarLinhaDoTempo(rng: () => number, tendencia: 'subindo' | 'estavel' | 'descendo' | 'volatil'): LinhaDoTempoConta {
  const sinais: LinhaDoTempoConta['sinais'] = [];
  const nSinais = tendencia === 'subindo' ? Math.floor(entre(rng, 1, 4)) : tendencia === 'volatil' ? Math.floor(entre(rng, 2, 5)) : Math.floor(entre(rng, 0, 2));
  for (let i = 0; i < nSinais; i++) sinais.push({ tipo: escolher(rng, TIPOS_SINAL).id, diaOffset: Math.floor(entre(rng, 0, JANELA_DIAS)) });

  const pessoaDesdeInicio = chance(rng, tendencia === 'subindo' ? 0.3 : 0.55);
  const pessoaMapeadaNoFim = tendencia === 'subindo' ? chance(rng, 0.85) : tendencia === 'descendo' ? chance(rng, 0.3) : chance(rng, 0.55);
  const diaPessoaMapeada = pessoaDesdeInicio ? 0 : pessoaMapeadaNoFim ? Math.floor(entre(rng, 20, JANELA_DIAS)) : null;

  const canalDesdeInicio = diaPessoaMapeada === 0 && chance(rng, 0.5);
  const canalNoFim = diaPessoaMapeada != null && chance(rng, 0.6);
  const diaCanalVerificado = diaPessoaMapeada == null ? null : canalDesdeInicio ? 0 : canalNoFim ? Math.floor(entre(rng, diaPessoaMapeada, JANELA_DIAS)) : null;

  const diaCaminhoQuente = chance(rng, 0.18) ? Math.floor(entre(rng, 0, JANELA_DIAS)) : null;

  return { diaPessoaMapeada, diaCanalVerificado, diaCaminhoQuente, sinais };
}

function fatosAcessoEm(linha: LinhaDoTempoConta, diaOffset: number): FatosAcesso {
  return {
    pessoaMapeada: linha.diaPessoaMapeada != null && linha.diaPessoaMapeada <= diaOffset,
    canalVerificado: linha.diaCanalVerificado != null && linha.diaCanalVerificado <= diaOffset,
    caminhoQuente: linha.diaCaminhoQuente != null && linha.diaCaminhoQuente <= diaOffset,
  };
}

function timingEm(linha: LinhaDoTempoConta, diaOffset: number): number {
  const ocorridos = linha.sinais.filter(s => s.diaOffset <= diaOffset).map(s => ({ tipo: s.tipo, diasAtras: diaOffset - s.diaOffset }));
  return calcularTiming(ocorridos);
}

function gerarTrajetoria(linha: LinhaDoTempoConta, fit: number, engagementBase: number): PontoTrajetoria[] {
  const bruta: { diaOffset: number; proximity: number; anel: Anel }[] = [];
  for (let dia = 0; dia <= JANELA_DIAS; dia += PASSO_DIAS) {
    const acesso = fatosAcessoEm(linha, dia);
    const timing = timingEm(linha, dia);
    const dims = { fit, timing, access: calcularAccess(acesso), engagement: engagementBase * (dia / JANELA_DIAS) };
    bruta.push({ diaOffset: dia, proximity: proximity(dims, PESOS_PADRAO), anel: calcularAnel(fit, timing >= 0.5, acesso) });
  }
  const suavizada = suavizarTrajetoria(bruta.map(p => p.proximity));
  return bruta.map((p, i) => ({ diaOffset: p.diaOffset, proximity: suavizada[i]!, anel: p.anel }));
}

export function gerarBaseProximidade(): BaseProximidade {
  const rng = criarRng(SEED);
  const contas: ContaProximidade[] = [];

  for (let i = 0; i < N_CONTAS; i++) {
    const braco = escolher(rng, [...BRACOS.slice(0, 3), ...BRACOS.slice(0, 3), BRACOS[3]!]).id as Braco; // ~30/30/30/10
    const infoBraco = BRACOS.find(b => b.id === braco)!;
    const subsegmento = escolher(rng, infoBraco.subsegmentos);
    const uf = escolher(rng, [...UFS, 'SP', 'SP'] as UF[]); // SP um pouco mais pesado
    const nome = nomeEmpresa(rng, braco, subsegmento);
    const id = `prox-${i.toString(36)}-${dominioDe(nome).replace('.com.br', '')}`;

    const fit = braco === 'adjacente' ? entre(rng, 0.15, 0.55) : entre(rng, 0.35, 1);
    const tendencia = escolher(rng, ['subindo', 'subindo', 'estavel', 'estavel', 'descendo', 'volatil'] as const);
    const linha = gerarLinhaDoTempo(rng, tendencia);
    const acessoAtual = fatosAcessoEm(linha, JANELA_DIAS);
    const timingAtual = timingEm(linha, JANELA_DIAS);
    const engagementBase = entre(rng, 0, 1);
    const dimensoes: Dimensoes = { fit, timing: timingAtual, access: calcularAccess(acessoAtual), engagement: engagementBase };
    const sinalRelevante = timingAtual >= 0.5;
    const anel = calcularAnel(fit, sinalRelevante, acessoAtual);
    const ultimoSinalBruto = linha.sinais.sort((a, b) => b.diaOffset - a.diaOffset)[0];
    const diasDesdeUltimoSinal = ultimoSinalBruto ? JANELA_DIAS - ultimoSinalBruto.diaOffset : null;

    contas.push({
      id,
      nome,
      dominio: dominioDe(nome),
      braco,
      subsegmento,
      uf,
      potencial: Math.min(1, entre(rng, 0, 1) ** 1.6 + entre(rng, 0, 0.15)),
      dimensoes,
      proximity: proximity(dimensoes, PESOS_PADRAO),
      anel,
      sinalRelevante,
      acesso: acessoAtual,
      pecasFaltantes: pecasFaltantes(sinalRelevante, acessoAtual, diasDesdeUltimoSinal),
      ultimoSinal: ultimoSinalBruto ? { tipo: ultimoSinalBruto.tipo, rotulo: TIPOS_SINAL.find(t => t.id === ultimoSinalBruto.tipo)!.rotulo, diasAtras: diasDesdeUltimoSinal! } : null,
      caminhoQuenteVia: acessoAtual.caminhoQuente ? nomePessoa(rng) : null,
      comite: gerarComite(rng, acessoAtual.pessoaMapeada, acessoAtual.canalVerificado),
      convertida: chance(rng, 0.035),
      trajetoria: gerarTrajetoria(linha, fit, engagementBase),
    });
  }

  return { geradoEm: new Date().toISOString().slice(0, 10), metaZonaAtivacao: 100, pesos: PESOS_PADRAO, versaoPesos: VERSAO_PESOS, contas };
}
