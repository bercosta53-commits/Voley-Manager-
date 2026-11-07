import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { get } from '@vercel/blob';
import type { Base } from './tipos';
import type { DadosClima } from './clima';

/**
 * Lê a base do app, nesta ordem:
 * 1. data/contas.local.json — base real gerada localmente da planilha (dev); fora do Git.
 * 2. Vercel Blob privado — a mesma base real, para produção (onde não existe arquivo local
 *    porque o repositório é público e dado real de empresa/pessoa não pode ser commitado).
 * 3. data/contas.exemplo.json — base de exemplo fictícia, se nada mais estiver disponível.
 */
export async function lerBase(): Promise<Base> {
  const base = await lerBaseBruta();
  return base.ficticia ? base : semRemovidas(base);
}

/** Tira as contas de data/contas-removidas.json (e os sinais delas), venha a base de onde vier. */
async function semRemovidas(base: Base): Promise<Base> {
  let dominios: Record<string, string> = {};
  try {
    dominios = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'contas-removidas.json'), 'utf8')).dominios ?? {};
  } catch {
    return base;
  }
  const fora = new Set(base.contas.filter(c => c.dominio && c.dominio in dominios).map(c => c.id));
  if (!fora.size) return base;
  return { ...base, contas: base.contas.filter(c => !fora.has(c.id)), sinais: base.sinais.filter(s => !fora.has(s.contaId)) };
}

async function lerBaseBruta(): Promise<Base> {
  const pasta = path.join(process.cwd(), 'data');
  try {
    return JSON.parse(await readFile(path.join(pasta, 'contas.local.json'), 'utf8')) as Base;
  } catch {
    // sem arquivo local — comum em produção, onde a base real vem do Blob
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const resultado = await get('contas.local.json', { access: 'private', abortSignal: AbortSignal.timeout(8000) });
      if (resultado?.stream) return JSON.parse(await new Response(resultado.stream).text()) as Base;
    } catch {
      // Blob indisponível — cai para a base de exemplo
    }
  }

  const base = JSON.parse(await readFile(path.join(pasta, 'contas.exemplo.json'), 'utf8')) as Base;
  return { ...base, ficticia: true };
}

/** Clima por vertical (aba Clima): data/clima.json, versionado (sem dado pessoal; o motor de clima escreve nele). */
export async function lerClima(): Promise<DadosClima> {
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', 'clima.json'), 'utf8')) as DadosClima;
}
