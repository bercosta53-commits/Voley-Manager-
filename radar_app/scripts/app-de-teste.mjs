// Sobe o app (`next start`) contra um Supabase simulado, para o smoke e o teste de jornada.
//
// Só para CI e máquina local. O Supabase simulado serve a base FICTÍCIA do repositório
// (data/contas.exemplo.json). Ela leva a marca `ficticia: true`, e o app recusa base fictícia de propósito;
// por isso a marca é retirada aqui, apenas dentro do processo de teste. Nada disso roda em produção, e
// nenhum dado real é lido.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Texto de um sinal marcado como exemplo, que nunca pode aparecer em tela (o app descarta). */
export const MARCA_FICTICIA = 'SINAL-EXEMPLO-QUE-NAO-PODE-APARECER';

/**
 * A base fictícia pronta para o teste. Ela marca todos os sinais como `exemplo`, e o app descarta sinal de
 * exemplo (lib/dados.ts); para as telas terem conteúdo, a marca sai aqui, e um único sinal continua marcado
 * para provar o descarte.
 */
export async function baseDeTeste() {
  const base = JSON.parse(await readFile(path.join(raiz, 'data/contas.exemplo.json'), 'utf8'));
  delete base.ficticia;
  base.sinais = base.sinais.map(s => ({ ...s, exemplo: false }));
  base.contas = base.contas.map(c => ({ ...c, historico: (c.historico ?? []).map(h => ({ ...h, exemplo: false })) }));
  base.sinais.push({ ...base.sinais[0], id: 'sinal-exemplo-teste', rotulo: MARCA_FICTICIA, sinal: MARCA_FICTICIA, porQueAgora: MARCA_FICTICIA, exemplo: true });
  return base;
}

/** Sobe o Supabase simulado e o app. Devolve `url(caminho)`, o log do app e `parar()`. */
export async function subirApp(base, { porta } = {}) {
  const corpo = JSON.stringify([{ payload: base }]);
  const supabase = http.createServer((req, res) => {
    const ok = req.url?.startsWith('/rest/v1/radar_snapshots') && req.headers.apikey === 'chave-de-teste';
    res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
    res.end(ok ? corpo : '{"message":"nao autorizado"}');
  });
  await new Promise(r => supabase.listen(0, '127.0.0.1', r));
  const portaApp = porta ?? 3100 + Math.floor(Math.random() * 800);
  const app = spawn(path.join(raiz, 'node_modules/.bin/next'), ['start', '-p', String(portaApp), '-H', '127.0.0.1'], {
    cwd: raiz,
    env: {
      ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${supabase.address().port}`,
      SUPABASE_SECRET_KEY: 'chave-de-teste',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const estado = { log: '' };
  app.stdout.on('data', d => (estado.log += d));
  app.stderr.on('data', d => (estado.log += d));
  const url = p => `http://127.0.0.1:${portaApp}${p}`;
  const parar = () => {
    app.kill('SIGTERM');
    supabase.close();
  };
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url('/api/estados'));
      return { url, parar, porta: portaApp, get log() { return estado.log; } };
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  parar();
  throw new Error('O app não subiu em 30 s.\n' + estado.log);
}
