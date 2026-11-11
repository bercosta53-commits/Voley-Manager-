import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { prepararBase } from './base-build.mjs';

const require = createRequire(import.meta.url);
// Mantém o suporte a .env.local que o comando next build oferece.
require('@next/env').loadEnvConfig(process.cwd());
let snapshot;
try {
  snapshot = await prepararBase();
  if (snapshot) console.log('[build] Base preparada; todos os workers usarão a mesma cópia local.');
  const codigo = await new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build', ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, ...(snapshot ? { VELORA_BUILD_BASE_PATH: snapshot.arquivo } : {}) },
    });
    filho.on('error', reject);
    filho.on('exit', codigo => resolve(codigo ?? 1));
  });
  process.exitCode = codigo;
} catch (erro) {
  console.error('[build] Publicação interrompida:', erro.message);
  process.exitCode = 1;
} finally {
  await snapshot?.limpar();
}
