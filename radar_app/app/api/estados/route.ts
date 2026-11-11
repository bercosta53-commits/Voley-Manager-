import { NextResponse } from 'next/server';
import { lerEstados, salvarEstado } from '@/lib/banco';

export const runtime = 'nodejs';

export async function GET() {
  const estados = await lerEstados();
  // sem banco (produção na Vercel): 204 em vez de 404, para não sujar o console; o app guarda no navegador
  if (estados === null) return new NextResponse(null, { status: 204 });
  return NextResponse.json(estados);
}

export async function POST(req: Request) {
  const { sinalId, estado } = (await req.json()) as { sinalId: string; estado: unknown };
  if (!sinalId) return NextResponse.json({ erro: 'sinalId obrigatório' }, { status: 400 });
  const ok = await salvarEstado(sinalId, (estado as Parameters<typeof salvarEstado>[1]) ?? null);
  if (!ok) return NextResponse.json({ erro: 'sem banco' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
