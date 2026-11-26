import 'server-only';
import type { LinhaRelacionamento } from './relacionamentos';

/**
 * Tabela privada radar_relacionamentos (db/002_radar_relacionamentos.sql). Desligada por padrão: liga com
 * RADAR_RELACIONAMENTOS=1 no Worker depois de aplicar a migração. Desligada, a API responde 204 e a tela não mostra
 * o campo. Só o servidor lê e grava (chave secreta); o navegador nunca vê o autor de outro registro.
 */
export const relacionamentosLigado = () => process.env.RADAR_RELACIONAMENTOS === '1';

const COLUNAS = 'conta_id,pessoa,nota,autor_email,registrado_em';

function cliente() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase não configurado');
  const endpoint = (busca: Record<string, string>) => {
    const u = new URL('/rest/v1/radar_relacionamentos', url);
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

export async function lerRelacionamentos(contaId?: string): Promise<LinhaRelacionamento[] | null> {
  if (!relacionamentosLigado()) return null;
  try {
    const { endpoint, headers } = cliente();
    const r = await fetch(endpoint({ select: COLUNAS, limit: '5000', ...(contaId ? { conta_id: `eq.${contaId}` } : {}) }), {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`radar_relacionamentos: leitura HTTP ${r.status}`);
    return (await r.json()) as LinhaRelacionamento[];
  } catch (e) {
    registrar('radar.relacionamentos.erro', { operacao: 'ler', detalhe: e instanceof Error ? e.message : 'desconhecido' });
    return null;
  }
}

/** Grava ou atualiza a nota de quem registrou (uma linha por conta, pessoa e autor). */
export async function salvarRelacionamento(contaId: string, pessoa: string, nota: number, autor: string): Promise<'ok' | 'desligado' | 'erro'> {
  if (!relacionamentosLigado()) return 'desligado';
  try {
    const { endpoint, headers } = cliente();
    const r = await fetch(endpoint({ on_conflict: 'conta_id,pessoa,autor_email' }), {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ conta_id: contaId, pessoa, nota, autor_email: autor, registrado_em: new Date().toISOString() }]),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`radar_relacionamentos: gravação HTTP ${r.status}`);
    registrar('radar.relacionamentos.gravado', { contaId, nota }); // sem nome da pessoa no log
    return 'ok';
  } catch (e) {
    registrar('radar.relacionamentos.erro', { operacao: 'gravar', contaId, detalhe: e instanceof Error ? e.message : 'desconhecido' });
    return 'erro';
  }
}
