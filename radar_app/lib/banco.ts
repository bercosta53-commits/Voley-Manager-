import 'server-only';
import type { EstadoSinal } from './tipos';
// A versão atual em Vercel já usa o fallback do navegador quando não há SQLite.
// Durante a migração, mantém esse comportamento; persistência compartilhada será validada à parte.
export async function lerEstados(): Promise<Record<string, EstadoSinal> | null> { return null; }
export async function salvarEstado(_sinalId: string, _estado: EstadoSinal | null): Promise<boolean> { return false; }
