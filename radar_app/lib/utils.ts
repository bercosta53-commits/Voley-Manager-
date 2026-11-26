import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const d = (iso: string) => new Date(iso + 'T12:00:00');

/** "17 set" */
export const dataCurta = (iso: string) => `${d(iso).getDate()} ${MESES[d(iso).getMonth()]}`;

/** "sexta, 25 de setembro" */
export const dataLonga = (iso: string) => `${DIAS[d(iso).getDay()]}, ${d(iso).getDate()} de ${MESES_LONGOS[d(iso).getMonth()]}`;

/** "17 set 1998" */
export const dataComAno = (iso: string) => `${d(iso).getDate()} ${MESES[d(iso).getMonth()]} ${d(iso).getFullYear()}`;

export const diasEntre = (de: string, ate: string) => Math.round((d(ate).getTime() - d(de).getTime()) / 86400000);

export const somarDias = (iso: string, n: number) => {
  const x = d(iso);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

/** "hoje", "ontem", "há 5 dias", "17 set" */
export function quando(iso: string, hoje: string) {
  const n = diasEntre(iso, hoje);
  if (n <= 0) return 'hoje';
  if (n === 1) return 'ontem';
  if (n < 7) return `há ${n} dias`;
  return dataCurta(iso);
}

export const iniciais = (nome: string) =>
  nome
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(p => p.length > 2 || /^\p{Lu}/u.test(p))
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('') || '?';

/** Score na tela: inteiro. O valor gravado pelo motor pode ter casas decimais e é usado exato em filtros e faixas. */
export const pontos = (n: number) => (Number.isFinite(n) ? Math.round(n) : n);

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const FORMATO_MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = (n: number) => FORMATO_MOEDA.format(n);

/** O segundo texto só quando acrescenta algo ao primeiro: igual, contido ou começando igual (ignorando caixa,
 * acentos e pontuação) não se repete na tela. */
export function seDiferente(principal: string | undefined | null, segundo: string | undefined | null): string | undefined {
  if (!segundo) return undefined;
  const n = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = n(principal ?? '');
  const b = n(segundo);
  if (!b || (a && (a === b || a.includes(b) || b.startsWith(a.slice(0, Math.max(24, Math.floor(a.length * 0.8))))))) return undefined;
  return segundo;
}
