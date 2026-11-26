// Deixa os testes (node:test + --experimental-strip-types) importarem módulos de lib/ que usam imports
// relativos sem extensão ('./contas') e o alias '@/', como o Next resolve. Sem dependência nova.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RAIZ = ${JSON.stringify(new URL('../../', import.meta.url).href)};
export async function resolve(especificador, contexto, proximo) {
  let alvo = especificador.startsWith('@/') ? new URL(especificador.slice(2), RAIZ).href : null;
  if (!alvo && (especificador.startsWith('./') || especificador.startsWith('../')) && contexto.parentURL?.startsWith('file:'))
    alvo = new URL(especificador, contexto.parentURL).href;
  if (alvo && !/\\.[cm]?[jt]sx?$/.test(alvo)) {
    const arquivo = fileURLToPath(alvo);
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (existsSync(arquivo + ext)) return proximo(pathToFileURL(arquivo + ext).href, contexto);
  }
  return proximo(alvo ?? especificador, contexto);
}`),
);
