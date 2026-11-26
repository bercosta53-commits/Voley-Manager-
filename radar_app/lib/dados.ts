import 'server-only';
import { cache } from 'react';
import { memoComValidade } from './memoria';
import type { Base } from './tipos';
import { MATRIZ_ICP, faixaVscs, statusVscs } from './avaliacao';
import type { DadosClima, Indicador, EstadoClima, SetorImpactado } from './clima';
import type { RegrasIcp } from './icp';
import clima from '../data/clima.json';
import regras from '../data/icp.json';
import removidas from '../data/contas-removidas.json';

/** Por que a base não pôde ser lida. Vai para o log do Worker e para /api/saude, nunca para a tela. */
export type MotivoErroBase = 'nao_configurada' | 'indisponivel' | 'invalida';

export class ErroBase extends Error {
  constructor(
    readonly motivo: MotivoErroBase,
    readonly detalhe: string,
  ) {
    super(`Base do Radar: ${motivo}`);
  }
}

function registrar(evento: string, campos: Record<string, unknown>) {
  // uma linha JSON por evento: o painel de logs do Workers filtra por "evento"
  const linha = JSON.stringify({ evento, em: new Date().toISOString(), ...campos });
  if (evento.endsWith('.erro')) console.error(linha);
  else console.log(linha);
}

/**
 * Lê o snapshot no Supabase e limpa o que não pode aparecer como real. Sem cache: /api/saude chama direto.
 * Nada é gravado: o que sai aqui é só o que a tela recebe, e o diagnóstico conta o que foi retirado.
 */
export async function lerSnapshot(): Promise<Base> {
  const inicio = Date.now();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    registrar('radar.base.erro', { motivo: 'nao_configurada' });
    throw new ErroBase('nao_configurada', 'SUPABASE_URL ou SUPABASE_SECRET_KEY ausente no Worker.');
  }
  const endpoint = new URL('/rest/v1/radar_snapshots', url);
  endpoint.searchParams.set('id', 'eq.current');
  endpoint.searchParams.set('select', 'payload');
  let texto: string;
  try {
    const resposta = await fetch(endpoint, { headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) {
      registrar('radar.base.erro', { motivo: 'indisponivel', http: resposta.status, ms: Date.now() - inicio });
      throw new ErroBase('indisponivel', `Supabase respondeu HTTP ${resposta.status}.`);
    }
    texto = await resposta.text();
  } catch (e) {
    if (e instanceof ErroBase) throw e;
    const tipo = e instanceof Error ? e.name : 'desconhecido';
    registrar('radar.base.erro', { motivo: 'indisponivel', falha: tipo, ms: Date.now() - inicio });
    throw new ErroBase('indisponivel', `Falha de rede ao ler o Supabase (${tipo}).`);
  }

  let base: Base | undefined;
  try {
    base = (JSON.parse(texto) as { payload: Base }[])[0]?.payload;
  } catch {
    base = undefined;
  }
  const problema = !base
    ? 'snapshot "current" não encontrado ou JSON ilegível'
    : base.ficticia
      ? 'snapshot marcado como fictício'
      : !Array.isArray(base.contas) || !base.contas.length
        ? 'sem contas'
        : !Array.isArray(base.sinais)
          ? 'sinais ausentes'
          : !Array.isArray(base.fontes)
            ? 'fontes ausentes'
            : null;
  if (!base || problema) {
    registrar('radar.base.erro', { motivo: 'invalida', problema, bytes: texto.length });
    throw new ErroBase('invalida', `Snapshot inválido: ${problema}.`);
  }

  const dominios: Record<string, string> = removidas.dominios ?? {};
  const fora = new Set(base.contas.filter(c => c.dominio && c.dominio in dominios).map(c => c.id));
  const contas = base.contas
    .filter(c => !fora.has(c.id))
    .map(c => {
      const historico = (c.historico ?? []).filter(h => !h.exemplo);
      // estágio ausente na carga: o rótulo sai do próprio score pelas faixas do VSCS 3.0 (85/70/55/40), como no
      // Panorama — senão Contas mostra "—" e "0 em Atenção" enquanto o Panorama conta as mesmas contas por faixa
      const vscsStatus = c.vscsStatus || (Number.isFinite(c.score) ? statusVscs(c.score) : undefined);
      // idem para a ação: sem acaoRecomendada, a tabela confirmada da matriz ICP × VSCS decide, marcada como derivada,
      // para Contas, Hoje e a tese contarem as mesmas contas "para abordar"
      const tier = (c.v2?.tier ?? c.icp?.tier ?? c.tier) as 'A' | 'B' | 'C';
      const daMatriz = !c.acaoRecomendada && Number.isFinite(c.score) && MATRIZ_ICP[tier] ? MATRIZ_ICP[tier][faixaVscs(c.score)] : undefined;
      if (historico.length === (c.historico ?? []).length && vscsStatus === c.vscsStatus && !daMatriz) return c;
      return { ...c, historico, vscsStatus, ...(daMatriz && { acaoRecomendada: daMatriz, acaoDaMatriz: true }) };
    });
  const ids = new Set(contas.map(c => c.id));
  const historicoExemplo = base.contas.reduce((n, c) => n + (fora.has(c.id) ? 0 : (c.historico ?? []).filter(h => h.exemplo).length), 0);

  // Sinal de exemplo nunca aparece como real; sinal sem conta ou sem data legível quebraria a caixa.
  const descartados = { exemplo: 0, semConta: 0, dataInvalida: 0, historicoExemplo };
  const sinais = base.sinais.filter(s => {
    if (fora.has(s.contaId)) return false; // retirada a pedido: não é descarte, é decisão
    if (s.exemplo) return (descartados.exemplo++, false);
    if (!ids.has(s.contaId)) return (descartados.semConta++, false);
    if (!s.data || Number.isNaN(Date.parse(s.data))) return (descartados.dataInvalida++, false);
    return true;
  });
  // Sem link ou sem veículo o sinal continua na tela, mas conta como evidência incompleta (contrato D2).
  const sinaisSemEvidencia = sinais.filter(s => !s.url || !s.fonte).length;

  const diagnostico = {
    lidoEm: new Date().toISOString(),
    ms: Date.now() - inicio,
    bytes: texto.length,
    descartados,
    sinaisSemEvidencia,
  };
  registrar('radar.base.lida', {
    ms: diagnostico.ms,
    bytes: diagnostico.bytes,
    contas: contas.length,
    sinais: sinais.length,
    atualizadoEm: base.atualizadoEm ?? base.geradoEm,
    descartados,
  });
  return { ...base, contas, sinais, diagnostico };
}

/**
 * P0-8: a base fica na memória da instância por 5 minutos. A carga é diária; uma carga nova aparece em até
 * 5 minutos. /api/saude e o resumo diário continuam lendo direto (lerSnapshot), para medir a leitura de verdade.
 */
export const VALIDADE_BASE_MS = 5 * 60_000;
const lerSnapshotEmMemoria = memoComValidade(lerSnapshot, VALIDADE_BASE_MS, { congelar: process.env.RADAR_BASE_CONGELADA === '1' });

// Uma leitura por renderização de servidor (React cache), vinda da memória quando ela está válida. Nenhuma consulta
// no build e nenhum fallback fictício.
export const lerBase = cache(lerSnapshotEmMemoria);

function parNumerico(valores: number[], campo: string): [number, number] {
  if (valores.length !== 2 || !valores.every(Number.isFinite)) {
    throw new Error('Clima: par numérico inválido em ' + campo);
  }
  return [valores[0], valores[1]];
}

function opcao<T extends string>(valor: string, opcoes: readonly T[], campo: string): T {
  if (!opcoes.includes(valor as T)) throw new Error('Clima: valor inválido em ' + campo);
  return valor as T;
}

const estados = ['Bom', 'Neutro', 'Ruim', 'Instável'] as const;
function indicador(i: Omit<Indicador, 'faixa' | 'tom' | 'cor' | 'setores'> & {
  faixa: number[]; tom: string; cor: string;
  setores?: (Omit<SetorImpactado, 'efeito'> & { efeito: string })[];
}): Indicador {
  return {
    ...i,
    faixa: parNumerico(i.faixa, i.rotulo),
    tom: opcao(i.tom, ['bom', 'ruim', 'atencao'] as const, 'tom'),
    cor: opcao(i.cor, ['bom', 'ruim', 'atencao', 'neutro'] as const, 'cor'),
    setores: i.setores?.map(s => ({...s, efeito: opcao(s.efeito, ['negativo', 'positivo'] as const, 'efeito')})),
  };
}

export async function lerClima(): Promise<DadosClima> {
  return {
    ...clima,
    indicadoresEmDia: parNumerico(clima.indicadoresEmDia, 'indicadoresEmDia'),
    brasil: {...clima.brasil, estado: opcao<EstadoClima>(clima.brasil.estado, estados, 'brasil.estado')},
    indicadores: clima.indicadores.map(indicador),
    politicaBolsa: clima.politicaBolsa?.map(indicador),
    verticais: clima.verticais.map(v => ({...v, estado: opcao<EstadoClima>(v.estado, estados, 'vertical.estado')})),
  };
}
export async function lerRegrasIcp(): Promise<RegrasIcp> { return regras as RegrasIcp; }
