import 'server-only';
import { readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { get } from '@vercel/blob';
import type { Base } from './tipos';
import type { DadosClima } from './clima';
import type { RegrasIcp } from './icp';

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

const EM_BUILD = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Cópia da base baixada do Blob, compartilhada pelos workers do mesmo build. Sem ela, cada página
 * (uma por conta) baixava a base inteira de novo e o build gastava a cota de transferência do Blob.
 */
const CACHE_BUILD = EM_BUILD
  ? path.join(os.tmpdir(), `velora-radar-base-${process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`)
  : null;

let basePromessa: Promise<Base> | null = null;

function lerBaseBruta(): Promise<Base> {
  // uma leitura por processo; se falhar, a próxima chamada tenta de novo
  basePromessa ??= carregarBase().catch(erro => {
    basePromessa = null;
    throw erro;
  });
  return basePromessa;
}

async function carregarBase(): Promise<Base> {
  // Preparada ANTES de next build: sem corrida entre workers e sem cache de outro build.
  // Se a cópia falhar, não volta ao Blob nem publica a demonstração silenciosamente.
  if (EM_BUILD && process.env.VELORA_BUILD_BASE_PATH) {
    return JSON.parse(await readFile(process.env.VELORA_BUILD_BASE_PATH, 'utf8')) as Base;
  }
  const pasta = path.join(process.cwd(), 'data');
  try {
    return JSON.parse(await readFile(path.join(pasta, 'contas.local.json'), 'utf8')) as Base;
  } catch {
    // sem arquivo local — comum em produção, onde a base real vem do Blob
  }

  if (CACHE_BUILD) {
    try {
      return JSON.parse(await readFile(CACHE_BUILD, 'utf8')) as Base;
    } catch {
      // primeiro worker do build — baixa do Blob abaixo
    }
  }

  let motivo = 'BLOB_READ_WRITE_TOKEN ausente';
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const resultado = await get('contas.local.json', { access: 'private', abortSignal: AbortSignal.timeout(20000) });
      if (resultado?.stream) {
        const texto = await new Response(resultado.stream).text();
        const base = JSON.parse(texto) as Base;
        if (CACHE_BUILD) {
          const temporario = `${CACHE_BUILD}.${process.pid}`;
          await writeFile(temporario, texto).then(() => rename(temporario, CACHE_BUILD)).catch(() => {});
        }
        return base;
      }
      motivo = 'contas.local.json não encontrado no Blob';
    } catch (erro) {
      motivo = `Blob indisponível: ${erro instanceof Error ? erro.message : String(erro)}`;
    }
  }

  // Build de produção não publica empresas fictícias: falha e o Vercel mantém a última versão boa no ar.
  if (EM_BUILD && process.env.VERCEL_ENV === 'production') {
    throw new Error(`Base real indisponível no build de produção (${motivo}). Build interrompido para não publicar a base de exemplo.`);
  }

  console.warn(`[dados] usando a base de exemplo: ${motivo}`);
  const base = JSON.parse(await readFile(path.join(pasta, 'contas.exemplo.json'), 'utf8')) as Base;
  return { ...base, ficticia: true };
}

/** Clima por vertical (aba Clima): data/clima.json, versionado (sem dado pessoal; o motor de clima escreve nele). */
export async function lerClima(): Promise<DadosClima> {
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', 'clima.json'), 'utf8')) as DadosClima;
}

/** Regras do ICP (data/icp.json, versionado): as mesmas que scripts/qualificar_icp.py aplica. */
export async function lerRegrasIcp(): Promise<RegrasIcp> {
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', 'icp.json'), 'utf8')) as RegrasIcp;
}
