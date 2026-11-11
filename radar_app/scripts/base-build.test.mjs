import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepararBase } from './base-build.mjs';

async function ambiente(t) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'velora-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}
const real = JSON.stringify({ contas: [{ id: 'teste' }], sinais: [] });
const env = { VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 'mock-token' };

test('uma leitura Blob alimenta todos os workers; builds seguintes recebem cópias novas', async t => {
  const cwd = await ambiente(t);
  let leituras = 0;
  const obterBlob = async () => {
    leituras++;
    return { stream: new Response(real).body };
  };
  const snapshot = await prepararBase({ cwd, env, obterBlob });
  t.after(snapshot.limpar);
  const textos = await Promise.all(Array.from({ length: 50 }, () => readFile(snapshot.arquivo, 'utf8')));
  assert.ok(textos.every(texto => texto === real));
  assert.equal(leituras, 1);
  const segundo = await prepararBase({ cwd, env, obterBlob });
  t.after(segundo.limpar);
  assert.notEqual(segundo.arquivo, snapshot.arquivo);
  assert.equal(leituras, 2);
  await snapshot.limpar();
  await assert.rejects(readFile(snapshot.arquivo), { code: 'ENOENT' });
});

test('arquivo local válido evita completamente o Blob', async t => {
  const cwd = await ambiente(t);
  await mkdir(path.join(cwd, 'data'));
  await writeFile(path.join(cwd, 'data/contas.local.json'), real);
  const snapshot = await prepararBase({ cwd, env, obterBlob: () => assert.fail('não deve baixar') });
  t.after(snapshot.limpar);
  assert.equal(await readFile(snapshot.arquivo, 'utf8'), real);
});

test('403 não causa retries nem fallback fictício em produção', async t => {
  const cwd = await ambiente(t);
  let leituras = 0;
  await assert.rejects(prepararBase({ cwd, env, obterBlob: async () => {
    leituras++;
    throw new Error('403 Forbidden');
  } }), /403/);
  assert.equal(leituras, 1);
});

test('base ausente, inválida e fictícia bloqueiam publicação', async t => {
  const cwd = await ambiente(t);
  await assert.rejects(prepararBase({ cwd, env: { VERCEL_ENV: 'production' } }), /Base real indisponível/);
  await assert.rejects(prepararBase({ cwd, env, obterBlob: async () => null }), /não encontrada/);
  for (const texto of ['{}', '{', JSON.stringify({ contas: [], sinais: [], ficticia: true })]) {
    await assert.rejects(prepararBase({ cwd, env, obterBlob: async () => ({ stream: new Response(texto).body }) }));
  }
  assert.equal(await prepararBase({ cwd, env: {} }), null);
});
