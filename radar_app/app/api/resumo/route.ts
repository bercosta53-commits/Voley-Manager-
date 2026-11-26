import { NextResponse } from 'next/server';
import { ErroBase, lerSnapshot } from '@/lib/dados';
import { lerEstados, registroLigado } from '@/lib/banco';
import { resumoDiario } from '@/lib/resumo';
import { destinatarios, enviarEmail, faltando, type ConfigResumo } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };

function config(): ConfigResumo {
  return {
    ligado: process.env.RESUMO_DIARIO === '1',
    para: destinatarios(process.env.RESUMO_PARA).validos,
    de: process.env.RESUMO_DE ?? '',
    chave: process.env.RESEND_API_KEY ?? '',
  };
}

async function montar() {
  const base = await lerSnapshot();
  const registro = registroLigado() ? await lerEstados() : null;
  return resumoDiario(base, {
    agora: new Date(),
    appUrl: process.env.RADAR_URL ?? '',
    estados: registro?.estados,
    status: registro?.status,
    compartilhado: !!registro,
  });
}

/**
 * Prévia do resumo diário no navegador (protegida pelo Cloudflare Access como todo o app): o que seria enviado
 * hoje, e o que falta configurar. ?formato=texto mostra a versão em texto puro.
 */
export async function GET(request: Request) {
  try {
    const r = await montar();
    const falta = faltando(config());
    const status = falta.length ? `Envio desligado. Falta configurar no Worker: ${falta.join(', ')}.` : 'Envio ligado: sai todo dia às 7h.';
    if (new URL(request.url).searchParams.get('formato') === 'texto')
      return new Response(`${status}\n\n${r.texto}`, { headers: { ...SEM_CACHE, 'Content-Type': 'text/plain; charset=utf-8' } });
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Resumo diário · prévia</title><body style="margin:24px;background:#f6f3ee">` +
        `<p style="font-family:sans-serif;font-size:13px;color:#6b665e">Prévia do resumo diário. ${status}</p>${r.html}</body>`,
      { headers: { ...SEM_CACHE, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } catch (e) {
    const motivo = e instanceof ErroBase ? e.motivo : 'erro';
    return NextResponse.json({ status: 'erro', motivo }, { status: 503, headers: SEM_CACHE });
  }
}

/**
 * Envio, chamado só pelo agendamento do Worker (cloudflare-worker.mjs, scheduled). O agendamento grava um token
 * aleatório de uso único no escopo global do isolate e manda no cabeçalho; requisição de fora nunca tem esse
 * token (o Worker também apaga o cabeçalho de toda requisição externa).
 */
export async function POST(request: Request) {
  const esperado = (globalThis as { __radarAgendado?: string }).__radarAgendado;
  if (!esperado || request.headers.get('x-radar-agendado') !== esperado) return NextResponse.json({ status: 'recusado' }, { status: 403, headers: SEM_CACHE });
  const c = config();
  const falta = faltando(c);
  if (falta.length) return NextResponse.json({ status: 'desligado', falta }, { status: 200, headers: SEM_CACHE });
  try {
    const r = await montar();
    const envio = await enviarEmail(c, r);
    const log = { evento: 'resumo_diario', dataCarga: r.dataCarga, atrasada: r.atrasada, contas: r.mudaramTotal, destinatarios: c.para.length, ...envio };
    console.log(JSON.stringify(log));
    return NextResponse.json({ status: envio.ok ? 'enviado' : 'falhou', ...log }, { status: envio.ok ? 200 : 502, headers: SEM_CACHE });
  } catch (e) {
    const motivo = e instanceof ErroBase ? e.motivo : 'erro';
    console.log(JSON.stringify({ evento: 'resumo_diario', status: 'erro', motivo }));
    return NextResponse.json({ status: 'erro', motivo }, { status: 503, headers: SEM_CACHE });
  }
}
