import 'server-only';
import { cache } from 'react';
import type { Base } from './tipos';
import type { DadosClima, Indicador, EstadoClima, SetorImpactado } from './clima';
import type { RegrasIcp } from './icp';
import clima from '../data/clima.json';
import regras from '../data/icp.json';
import removidas from '../data/contas-removidas.json';

// Uma leitura por renderização de servidor. Nenhuma consulta no build e nenhum fallback fictício.
export const lerBase = cache(async (): Promise<Base> => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Base privada ainda não configurada.');
  const endpoint = new URL('/rest/v1/radar_snapshots', url);
  endpoint.searchParams.set('id', 'eq.current');
  endpoint.searchParams.set('select', 'payload');
  const resposta = await fetch(endpoint, {
    headers: { apikey: key },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!resposta.ok) throw new Error('Base privada indisponível.');
  const linhas = await resposta.json() as {payload: Base}[];
  const base = linhas[0]?.payload;
  if (!base || base.ficticia || !Array.isArray(base.contas) || !base.contas.length ||
      !Array.isArray(base.sinais) || !Array.isArray(base.fontes)) {
    throw new Error('Snapshot real ausente ou inválido.');
  }
  const dominios: Record<string,string> = removidas.dominios ?? {};
  const fora = new Set(base.contas.filter(c => c.dominio && c.dominio in dominios).map(c => c.id));
  return { ...base, contas: base.contas.filter(c => !fora.has(c.id)), sinais: base.sinais.filter(s => !fora.has(s.contaId)) };
});

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
