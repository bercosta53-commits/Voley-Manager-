import { ANEIS, BRACOS, hash01, type Anel, type Braco, type ContaProximidade } from './proximidade';

export interface PontoRadar {
  id: string;
  nome: string;
  braco: Braco;
  subsegmento: string;
  anel: Anel;
  proximity: number;
  potencial: number;
  convertida: boolean;
  temperatura: number; // 0–1: 1 = sinal bem recente, 0 = sem sinal — pinta o ponto
  sinalRelevante: boolean; // contorno sólido (true) vs tracejado (false) — pista secundária, não só cor
}

export function pontoAtual(c: ContaProximidade): PontoRadar {
  return {
    id: c.id,
    nome: c.nome,
    braco: c.braco,
    subsegmento: c.subsegmento,
    anel: c.anel,
    proximity: c.proximity,
    potencial: c.potencial,
    convertida: c.convertida,
    temperatura: c.dimensoes.timing,
    sinalRelevante: c.sinalRelevante,
  };
}

/**
 * Posição histórica (replay): a trajetória só guarda {proximity, anel} por dia, não as 4 dimensões —
 * por isso a cor/contorno aqui é um proxy simplificado (anel 1–2 ~ "esquentando"), não a temperatura exata
 * daquele dia. Suficiente pro "a nuvem se movendo" do replay; o detalhe fino fica na visão de hoje.
 */
export function pontoHistorico(c: ContaProximidade, diaOffset: number): PontoRadar {
  const ponto = c.trajetoria.find(p => p.diaOffset === diaOffset) ?? c.trajetoria[c.trajetoria.length - 1]!;
  const sinalRelevante = ponto.anel <= 2;
  return {
    id: c.id,
    nome: c.nome,
    braco: c.braco,
    subsegmento: c.subsegmento,
    anel: ponto.anel,
    proximity: ponto.proximity,
    potencial: c.potencial,
    convertida: c.convertida && diaOffset >= 90,
    temperatura: sinalRelevante ? 0.75 : 0.1,
    sinalRelevante,
  };
}

/** Geometria do radar polar. Client-safe (sem server-only): recalculada ao vivo com filtro e replay. */

export const CENTRO = 320;
export const RAIO_MAX = 280;
export const GAP_ANEL = 4; // vão sólido entre anéis, para a borda de cada um não se confundir com o próximo

// Bandas de raio por anel (1 = centro ... 4 = borda). O raio interno de cada conta é a sua posição DENTRO da banda.
// Anel 1 ganha a maior banda de propósito: é onde a nuvem mais aperta, e é o anel que sempre rotula.
export const BANDA_ANEL: Record<Anel, [number, number]> = {
  1: [0, 88],
  2: [98, 168],
  3: [178, 238],
  4: [248, RAIO_MAX],
};
export const RAIO_CONVERTIDA = 18; // marcador especial: ainda mais central que o anel 1

const GAP_BRACO_GRAUS = 6;
const GAP_SUBSEGMENTO_GRAUS = 1.5;

/** Ângulo determinístico (radianos): mesma conta sempre no mesmo lugar dentro da fatia do braço/subsegmento. */
export function anguloDaConta(conta: Pick<ContaProximidade, 'id' | 'braco' | 'subsegmento'>): number {
  const nArmos = BRACOS.length;
  const larguraBraco = 360 / nArmos - GAP_BRACO_GRAUS;
  const indiceBraco = BRACOS.findIndex(b => b.id === conta.braco);
  const inicioBraco = indiceBraco * (360 / nArmos) + GAP_BRACO_GRAUS / 2;

  const subsegmentos = BRACOS[indiceBraco]!.subsegmentos;
  const nSub = subsegmentos.length;
  const larguraSub = larguraBraco / nSub - GAP_SUBSEGMENTO_GRAUS;
  const indiceSub = Math.max(0, subsegmentos.indexOf(conta.subsegmento));
  const inicioSub = inicioBraco + indiceSub * (larguraBraco / nSub) + GAP_SUBSEGMENTO_GRAUS / 2;

  const t = hash01(conta.id);
  const grauFinal = inicioSub + t * Math.max(larguraSub, 0.1);
  return ((grauFinal - 90) * Math.PI) / 180; // -90° para o braço 0 começar no topo, sentido horário
}

/** Centro angular de cada fatia de braço, para o rótulo do setor. */
export function anguloCentralBraco(braco: Braco): number {
  const nArmos = BRACOS.length;
  const indice = BRACOS.findIndex(b => b.id === braco);
  const centro = indice * (360 / nArmos) + 360 / nArmos / 2;
  return ((centro - 90) * Math.PI) / 180;
}

/** Posição normalizada [0,1] dentro do anel, pelo proximity relativo ao min/max daquele anel na base inteira (estável: não depende do filtro ativo). */
export function posicaoNoAnel(proximity: number, anel: Anel, faixaPorAnel?: Record<Anel, [number, number]>): number {
  const faixa = faixaPorAnel?.[anel];
  if (!faixa || faixa[1] - faixa[0] < 1e-6) return 0.5;
  return Math.min(1, Math.max(0, (proximity - faixa[0]) / (faixa[1] - faixa[0])));
}

export function faixaProximityPorAnel(contas: Pick<ContaProximidade, 'anel' | 'proximity'>[]): Record<Anel, [number, number]> {
  const faixa = { 1: [1, 0], 2: [1, 0], 3: [1, 0], 4: [1, 0] } as Record<Anel, [number, number]>;
  for (const c of contas) {
    const [min, max] = faixa[c.anel];
    faixa[c.anel] = [Math.min(min, c.proximity), Math.max(max, c.proximity)];
  }
  return faixa;
}

export interface PontoPolar {
  x: number;
  y: number;
}

/** anel 1 = mais perto do centro (raio pequeno); por isso a posição-dentro-do-anel INVERTE t (score alto → raio menor dentro da banda). */
export function raioDaConta(anel: Anel, t: number): number {
  const [min, max] = BANDA_ANEL[anel];
  return min + (1 - t) * (max - min);
}

export function polar(raio: number, anguloRad: number): PontoPolar {
  return { x: CENTRO + raio * Math.cos(anguloRad), y: CENTRO + raio * Math.sin(anguloRad) };
}

export function posicaoConta(conta: Pick<ContaProximidade, 'id' | 'braco' | 'subsegmento' | 'anel' | 'proximity' | 'convertida'>, faixaPorAnel?: Record<Anel, [number, number]>): PontoPolar {
  const angulo = anguloDaConta(conta);
  if (conta.convertida) {
    // Jitter pequeno em torno do centro absoluto, só pra não empilhar todas exatamente no mesmo pixel.
    const r = RAIO_CONVERTIDA * hash01(conta.id + ':r');
    return polar(r, angulo);
  }
  const t = posicaoNoAnel(conta.proximity, conta.anel, faixaPorAnel);
  return polar(raioDaConta(conta.anel, t), angulo);
}

/** Tamanho do ponto (raio do círculo em px) pelo potencial (porte/ticket), 0–1 → 4–12px. */
export const raioPonto = (potencial: number) => 4 + Math.min(1, Math.max(0, potencial)) * 8;

export const ROTULO_ANEL = Object.fromEntries(ANEIS.map(a => [a.id, a.rotulo])) as Record<Anel, string>;
