import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Base } from './tipos';

/**
 * Lê a base do app. A base real (data/contas.local.json, gerada da planilha) fica fora do Git porque o
 * repositório é público; sem ela, o app usa a base de exemplo com empresas fictícias.
 */
export async function lerBase(): Promise<Base> {
  const pasta = path.join(process.cwd(), 'data');
  try {
    return JSON.parse(await readFile(path.join(pasta, 'contas.local.json'), 'utf8')) as Base;
  } catch {
    const base = JSON.parse(await readFile(path.join(pasta, 'contas.exemplo.json'), 'utf8')) as Base;
    return { ...base, ficticia: true };
  }
}
