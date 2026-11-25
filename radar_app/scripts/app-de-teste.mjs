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

/**
 * Sobe o Supabase simulado e o app. Devolve `url(caminho)`, o log do app, as linhas gravadas em radar_acoes e
 * `parar()`. `env` liga recursos do app no teste (por exemplo RADAR_ACOES=1).
 */
export async function subirApp(base, { porta, env = {} } = {}) {
  const corpo = JSON.stringify([{ payload: base }]);
  const acoes = []; // radar_acoes em memória: só inserção, como a tabela real
  const supabase = http.createServer(async (req, res) => {
    const responder = (status, dados) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof dados === 'string' ? dados : JSON.stringify(dados));
    };
    if (req.headers.apikey !== 'chave-de-teste') return responder(401, '{"message":"nao autorizado"}');
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/rest/v1/radar_snapshots') return responder(200, corpo);
    if (u.pathname === '/rest/v1/radar_acoes' && req.method === 'POST') {
      let texto = '';
      for await (const parte of req) texto += parte;
      for (const l of [].concat(JSON.parse(texto))) acoes.push({ nota: null, ...l, id: acoes.length + 1, criado_em: new Date().toISOString() });
      return responder(201, '');
    }
    if (u.pathname === '/rest/v1/radar_acoes') {
      const sinal = u.searchParams.get('sinal_id')?.replace(/^eq\./, '');
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const limite = Number(u.searchParams.get('limit') ?? 1000);
      return responder(200, acoes.filter(l => !sinal || l.sinal_id === sinal).slice(offset, offset + limite));
    }
    return responder(404, '{"message":"rota desconhecida"}');
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
      ...env,
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
      return { url, parar, porta: portaApp, acoes, get log() { return estado.log; } };
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  parar();
  throw new Error('O app não subiu em 30 s.\n' + estado.log);
}
