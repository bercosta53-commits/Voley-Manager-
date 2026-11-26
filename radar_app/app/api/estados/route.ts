import { NextResponse } from 'next/server';
import { lerEstados, registroLigado, salvarEstado, salvarStatus } from '@/lib/banco';
import { emailDoAccess, validarEstado, validarStatus } from '@/lib/acoes';
import { lerSnapshot } from '@/lib/dados';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const semCache = { 'Cache-Control': 'no-store' };

/**
 * Marcações do time sobre os sinais (abordado, adiado, útil/ruído, relevância).
 * 204 = registro compartilhado desligado (RADAR_ACOES ≠ 1): a tela guarda só no navegador.
 * 200 = { estados, status } lidos de radar_acoes.
 */
export async function GET() {
  const dados = await lerEstados();
  if (dados === null) return new NextResponse(null, { status: 204, headers: semCache });
  return NextResponse.json(dados, { headers: semCache });
}

export async function POST(req: Request) {
  if (!registroLigado()) return NextResponse.json({ erro: 'registro compartilhado desligado' }, { status: 404, headers: semCache });

  // Quem marcou: o e-mail do JWT do Access, que o Worker já verificou antes de a requisição chegar aqui.
  // RADAR_AUTOR_TESTE existe só para o CI e a máquina local, onde não há Access.
  const autor = emailDoAccess(req.headers.get('cf-access-jwt-assertion')) ?? process.env.RADAR_AUTOR_TESTE ?? null;
  if (!autor) return NextResponse.json({ erro: 'sem identidade do Access' }, { status: 401, headers: semCache });

  let corpo: { sinalId?: unknown; estado?: unknown; contaId?: unknown; status?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'JSON inválido' }, { status: 400, headers: semCache });
  }
  // andamento da conta: { contaId, status } (status null tira o vigente)
  if (corpo.contaId !== undefined) {
    const contaId = typeof corpo.contaId === 'string' ? corpo.contaId : '';
    const status = validarStatus(corpo.status);
    if (!contaId || status === 'invalido') return NextResponse.json({ erro: 'contaId ou status inválido' }, { status: 400, headers: semCache });
    const baseConta = await lerSnapshot().catch(() => null);
    if (!baseConta?.contas.some(c => c.id === contaId)) return NextResponse.json({ erro: 'conta não encontrada na base' }, { status: 400, headers: semCache });
    const rs = await salvarStatus(contaId, status, autor);
    if (rs !== 'ok') return NextResponse.json({ erro: 'não foi possível gravar' }, { status: 503, headers: semCache });
    return NextResponse.json({ ok: true }, { headers: semCache });
  }

  const sinalId = typeof corpo.sinalId === 'string' ? corpo.sinalId : '';
  const estado = validarEstado(corpo.estado);
  if (!sinalId || estado === 'invalido') return NextResponse.json({ erro: 'sinalId ou estado inválido' }, { status: 400, headers: semCache });

  // a conta vem da base, não do navegador: também garante que o sinal existe
  const base = await lerSnapshot().catch(() => null);
  const contaId = base?.sinais.find(s => s.id === sinalId)?.contaId;
  if (!contaId) return NextResponse.json({ erro: 'sinal não encontrado na base' }, { status: 400, headers: semCache });

  const r = await salvarEstado(sinalId, contaId, estado, autor);
  if (r !== 'ok') return NextResponse.json({ erro: 'não foi possível gravar' }, { status: 503, headers: semCache });
  return NextResponse.json({ ok: true }, { headers: semCache });
}
