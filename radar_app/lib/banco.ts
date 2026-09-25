import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EstadoSinal } from './tipos';

/**
 * Grava as ações da tela Hoje (útil, ruído, abordado, adiado, arquivado) no mesmo banco do radar
 * (radar_abm/dados/radar.db): útil/ruído também vira uma linha em `feedback`, para o
 * `manager.py metricas` enxergar o mesmo feedback dado no app.
 *
 * Só funciona rodando com `next start`/`next dev` (servidor Node) ao lado do radar_abm, no mesmo
 * checkout. Sem o banco por perto (ex.: exportação estática, ou antes de rodar os coletores), a tela
 * guarda tudo só no navegador — ver components/hoje/estado.ts.
 */

const CAMINHO_BANCO = path.join(process.cwd(), '..', 'radar_abm', 'dados', 'radar.db');

function abrir() {
  if (!fs.existsSync(CAMINHO_BANCO)) return null;
  // node:sqlite ainda é experimental nesta versão do Node (aviso no log, sem efeito no funcionamento).
  const db = new DatabaseSync(CAMINHO_BANCO);
  db.exec(`create table if not exists app_estados (
    sinal_id  text primary key,
    acao      text check (acao in ('abordado', 'adiado', 'arquivado')),
    ate       date,
    avaliacao text check (avaliacao in ('util', 'ruido')),
    em        date not null
  )`);
  return db;
}

export function lerEstados(): Record<string, EstadoSinal> | null {
  const db = abrir();
  if (!db) return null;
  try {
    const linhas = db.prepare('select sinal_id, acao, ate, avaliacao, em from app_estados').all() as Record<string, unknown>[];
    const saida: Record<string, EstadoSinal> = {};
    for (const l of linhas) {
      saida[l.sinal_id as string] = {
        acao: (l.acao as EstadoSinal['acao']) ?? undefined,
        ate: (l.ate as string) ?? undefined,
        avaliacao: (l.avaliacao as EstadoSinal['avaliacao']) ?? undefined,
        em: l.em as string,
      };
    }
    return saida;
  } finally {
    db.close();
  }
}

export function salvarEstado(sinalId: string, estado: EstadoSinal | null): boolean {
  const db = abrir();
  if (!db) return false;
  try {
    if (!estado) {
      db.prepare('delete from app_estados where sinal_id = ?').run(sinalId);
      return true;
    }
    db.prepare(
      `insert into app_estados (sinal_id, acao, ate, avaliacao, em) values (?, ?, ?, ?, ?)
       on conflict(sinal_id) do update set acao = excluded.acao, ate = excluded.ate, avaliacao = excluded.avaliacao, em = excluded.em`,
    ).run(sinalId, estado.acao ?? null, estado.ate ?? null, estado.avaliacao ?? null, estado.em ?? new Date().toISOString().slice(0, 10));
    if (estado.avaliacao) {
      try {
        // Espelha em `feedback`, para o manager.py metricas enxergar; só funciona quando o sinal existe
        // de verdade em `sinais` (id vindo dos coletores). Sinal fabricado pela base local (sem CNPJ real
        // ligado à coleta) não tem essa linha — não é erro, é a mesma conta ainda sem coleta rodada.
        db.prepare('insert into feedback (sinal_id, avaliacao, comentario, data) values (?, ?, ?, ?)').run(
          sinalId,
          estado.avaliacao,
          'app: Hoje',
          new Date().toISOString(),
        );
      } catch {
        /* sinal não existe em `sinais` (base de demonstração): guarda só em app_estados */
      }
    }
    return true;
  } finally {
    db.close();
  }
}
