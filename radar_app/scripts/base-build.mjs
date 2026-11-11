import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// O coordenador termina esta leitura antes de iniciar qualquer worker do Next.
export async function prepararBase({ cwd = process.cwd(), env = process.env, obterBlob } = {}) {
  let texto;
  try {
    texto = await readFile(path.join(cwd, 'data/contas.local.json'), 'utf8');
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
    if (env.BLOB_READ_WRITE_TOKEN) {
      const get = obterBlob ?? (await import('@vercel/blob')).get;
      const resultado = await get('contas.local.json', {
        access: 'private', token: env.BLOB_READ_WRITE_TOKEN,
        abortSignal: AbortSignal.timeout(20000),
      });
      if (!resultado?.stream) throw new Error('Base real não encontrada no Blob.');
      texto = await new Response(resultado.stream).text();
    } else if (env.VERCEL_ENV === 'production') {
      throw new Error('Base real indisponível: configure o Blob antes de publicar.');
    } else {
      // Desenvolvimento sem credenciais continua usando a demonstração.
      return null;
    }
  }
  const base = JSON.parse(texto);
  if (!Array.isArray(base.contas) || !Array.isArray(base.sinais) || base.ficticia) {
    throw new Error('Base real inválida; publicação interrompida.');
  }
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'velora-build-'));
  const arquivo = path.join(pasta, 'base.json');
  try {
    await writeFile(arquivo, texto, { mode: 0o600 });
  } catch (erro) {
    await rm(pasta, { recursive: true, force: true });
    throw erro;
  }
  return { arquivo, limpar: () => rm(pasta, { recursive: true, force: true }) };
}
