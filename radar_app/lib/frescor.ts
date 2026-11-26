/**
 * Frescor da base: quanto tempo se passou desde a última carga diária (00h30) e se isso já é um problema.
 * Sem dependências, para rodar igual no servidor, no navegador e nos testes (scripts/tests/frescor.test.mjs).
 */

/** Acima disso, a carga de uma madrugada falhou: aviso âmbar. */
export const LIMITE_ATENCAO_H = 36;
/** Acima disso, duas ou mais cargas falharam: aviso vermelho. */
export const LIMITE_CRITICO_H = 72;

export type NivelFrescor = 'ok' | 'atencao' | 'critico' | 'desconhecido';

/**
 * Converte a data da base num instante. "AAAA-MM-DD" vira meia-noite em São Paulo; data e hora sem fuso
 * também são lidas no horário de São Paulo (−03:00; o Brasil não tem horário de verão desde 2019).
 */
export function instanteBase(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const texto = iso.trim();
  let normalizado = texto;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) normalizado = `${texto}T00:00:00-03:00`;
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(texto)) normalizado = `${texto.replace(' ', 'T')}-03:00`;
  const d = new Date(normalizado);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function frescor(iso: string | undefined | null, agora: Date): { nivel: NivelFrescor; horas: number | null } {
  const d = instanteBase(iso);
  if (!d) return { nivel: 'desconhecido', horas: null };
  const horas = Math.max(0, (agora.getTime() - d.getTime()) / 3_600_000);
  const nivel = horas > LIMITE_CRITICO_H ? 'critico' : horas > LIMITE_ATENCAO_H ? 'atencao' : 'ok';
  return { nivel, horas };
}

/** "25/11 às 00h41" (ou só "25/11" quando a base traz apenas a data), no horário de São Paulo. */
export function rotuloCarga(iso: string | undefined | null): string {
  const d = instanteBase(iso);
  if (!d) return 'data desconhecida';
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return data;
  const [h, m] = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).split(':');
  return `${data} às ${h}h${m}`;
}

/** "há 5 h", "há 2 dias". */
export function rotuloIdade(horas: number | null): string {
  if (horas === null) return '';
  if (horas < 1) return 'há menos de 1 h';
  if (horas < 48) return `há ${Math.floor(horas)} h`;
  return `há ${Math.floor(horas / 24)} dias`;
}

/** AAAA-MM-DD de hoje em São Paulo, independente do fuso de quem chama (servidor em UTC ou navegador). */
export function hojeEmSaoPaulo(agora: Date): string {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
