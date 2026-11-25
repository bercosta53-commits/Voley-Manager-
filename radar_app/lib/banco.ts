import 'server-only';
import type { EstadoSinal } from './tipos';
import { dobrar, linhasDaMudanca, type Dobra, type LinhaAcao } from './acoes';

/**
 * Registro compartilhado das ações do time (tabela radar_acoes, db/001_radar_acoes.sql).
 *
 * Desligado por padrão. Liga com RADAR_ACOES=1 no Worker, e só depois de a migração ser aplicada e de a
 * inteligência confirmar que os IDs de conta e sinal são estáveis entre cargas (docs/contrato-radar-acoes.md).
 * Desligado, a API responde 204 e a tela guarda as marcações só no navegador, como antes.
 */
export const registroLigado = () => process.env.RADAR_ACOES === '1';

const COLUNAS = 'id,conta_id,sinal_id,tipo,ate,relevancia,status,nota,desfaz_id,autor_email,criado_em';
const POR_PAGINA = 1000; // limite padrão de linhas por resposta do PostgREST no Supabase

function cliente() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase não configurado');
  const endpoint = (busca: Record<string, string>) => {
    const u = new URL('/rest/v1/radar_acoes', url);
    for (const [k, v] of Object.entries(busca)) u.searchParams.set(k, v);
    return u;
  };
  return { endpoint, headers: { apikey: key, 'Content-Type': 'application/json' } };
}

function registrar(evento: string, campos: Record<string, unknown>) {
  const linha = JSON.stringify({ evento, em: new Date().toISOString(), ...campos });
  if (evento.endsWith('.erro')) console.error(linha);
  else console.log(linha);
}

/** Lê o registro (os últimos 365 dias), paginado. */
async function lerLinhas(filtro: Record<string, string> = {}): Promise<LinhaAcao[]> {
  const { endpoint, headers } = cliente();
  const desde = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const todas: LinhaAcao[] = [];
  for (let pagina = 0; pagina < 50; pagina++) {
    const u = endpoint({ select: COLUNAS, order: 'id.asc', criado_em: `gte.${desde}`, limit: String(POR_PAGINA), offset: String(pagina * POR_PAGINA), ...filtro });
    const r = await fetch(u, { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`radar_acoes: leitura HTTP ${r.status}`);
    const lote = (await r.json()) as LinhaAcao[];
    todas.push(...lote);
    if (lote.length < POR_PAGINA) break;
  }
  return todas;
}

/** Estado de todos os sinais e status das contas; null quando o registro está desligado ou falhou. */
export async function lerEstados(): Promise<Pick<Dobra, 'estados' | 'status'> | null> {
  if (!registroLigado()) return null;
  try {
    const { estados, status } = dobrar(await lerLinhas());
    return { estados, status };
  } catch (e) {
    registrar('radar.acoes.erro', { operacao: 'ler', detalhe: e instanceof Error ? e.message : 'desconhecido' });
    return null;
  }
}

/**
 * Leva o sinal ao estado pedido. A diferença é calculada contra o estado que está no banco, não contra o que o
 * navegador acha que está: duas pessoas mexendo no mesmo sinal não se apagam, e o último clique vale.
 */
export async function salvarEstado(sinalId: string, contaId: string, para: EstadoSinal | null, autor: string): Promise<'ok' | 'desligado' | 'erro'> {
  if (!registroLigado()) return 'desligado';
  try {
    const { vigentes } = dobrar(await lerLinhas({ sinal_id: `eq.${sinalId}` }));
    const novas = linhasDaMudanca(sinalId, contaId, vigentes[sinalId] ?? {}, para).map(l => ({ ...l, autor_email: autor, origem: 'app' }));
    if (!novas.length) return 'ok';
    const { endpoint, headers } = cliente();
    const r = await fetch(endpoint({}), {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(novas),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`radar_acoes: gravação HTTP ${r.status}`);
    registrar('radar.acoes.gravadas', { sinalId, tipos: novas.map(n => n.tipo) });
    return 'ok';
  } catch (e) {
    registrar('radar.acoes.erro', { operacao: 'gravar', sinalId, detalhe: e instanceof Error ? e.message : 'desconhecido' });
    return 'erro';
  }
}
