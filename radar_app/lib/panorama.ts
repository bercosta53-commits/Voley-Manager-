import type { Base, StatusVscs } from './tipos';

/**
 * Panorama da base: o volume e a profundidade do que o Radar monitora, numa leitura. Função pura, sem
 * dependências em tempo de execução (testada em scripts/tests/panorama.test.mjs). Todas as contagens vêm do
 * snapshot; as janelas de 7 e 30 dias contam a partir da data da última carga, como em Movimentos da semana.
 */

export interface Panorama {
  dataCarga: string;
  contas: number;
  decisores: number;
  contasComComite: number;
  /** contas com 2 ou mais pessoas no comitê: dá para conversar com mais de uma pessoa */
  contasComComiteMultiplo: number;
  sinais30d: number;
  sinais7d: number;
  contasComSinal: number;
  /** VSCS ≥ piso da faixa "Oportunidade emergente" */
  emOportunidade: number;
  pisoOportunidade: number;
  porTier: { tier: string; n: number }[];
  porEstagio: { estagio: StatusVscs; piso: number; n: number }[];
  porCategoria30d: { categoria: string; n: number }[];
  fontes: number;
  fontesOk: number;
  /** contas com Conta Qualificada = sim; null enquanto o motor não grava o campo */
  qualificadas: number | null;
}

const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z') / 86_400_000;

/** `faixas` em ordem decrescente de piso, como FAIXAS_VSCS em lib/avaliacao.ts. */
export function panorama(base: Base, faixas: [number, StatusVscs][]): Panorama {
  const dataCarga = (base.atualizadoEm ?? base.geradoEm).slice(0, 10);
  const hoje = dia(dataCarga);
  const idade = (iso: string) => hoje - dia(iso);

  // sinal acionável: notícia setorial sem fato da conta não conta (mesma regra de Hoje)
  const acionaveis = base.sinais.filter(s => s.tipo !== 'noticia_setorial' && !Number.isNaN(dia(s.data)));
  const de30 = acionaveis.filter(s => idade(s.data) >= 0 && idade(s.data) <= 30);
  const de7 = de30.filter(s => idade(s.data) <= 7);

  const categorias = new Map<string, number>();
  for (const s of de30) categorias.set(s.categoria ?? 'contexto', (categorias.get(s.categoria ?? 'contexto') ?? 0) + 1);

  const tiers = new Map<string, number>();
  for (const c of base.contas) if (c.tier) tiers.set(c.tier, (tiers.get(c.tier) ?? 0) + 1);

  const estagioDe = (score: number) => faixas.find(([piso]) => score >= piso) ?? faixas[faixas.length - 1]!;
  const porEstagio = new Map<StatusVscs, number>(faixas.map(([, e]) => [e, 0]));
  for (const c of base.contas) {
    const [, e] = estagioDe(c.score);
    porEstagio.set(e, (porEstagio.get(e) ?? 0) + 1);
  }
  const pisoOportunidade = faixas.find(([, e]) => e === 'Oportunidade emergente')?.[0] ?? 55;

  const comSinal = new Set(base.sinais.map(s => s.contaId));
  return {
    dataCarga,
    contas: base.contas.length,
    decisores: base.contas.reduce((n, c) => n + (c.comite?.length ?? 0), 0),
    contasComComite: base.contas.filter(c => c.comite?.length).length,
    contasComComiteMultiplo: base.contas.filter(c => (c.comite?.length ?? 0) >= 2).length,
    sinais30d: de30.length,
    sinais7d: de7.length,
    contasComSinal: base.contas.filter(c => comSinal.has(c.id)).length,
    emOportunidade: base.contas.filter(c => c.score >= pisoOportunidade).length,
    pisoOportunidade,
    porTier: [...tiers.entries()].map(([tier, n]) => ({ tier, n })).sort((a, b) => a.tier.localeCompare(b.tier)),
    porEstagio: faixas.map(([piso, estagio]) => ({ estagio, piso, n: porEstagio.get(estagio) ?? 0 })),
    porCategoria30d: [...categorias.entries()].map(([categoria, n]) => ({ categoria, n })).sort((a, b) => b.n - a.n),
    fontes: base.fontes.length,
    fontesOk: base.fontes.filter(f => f.status === 'ok').length,
    qualificadas: base.contas.some(c => c.qualificada) ? base.contas.filter(c => c.qualificada?.status === 'sim').length : null,
  };
}
