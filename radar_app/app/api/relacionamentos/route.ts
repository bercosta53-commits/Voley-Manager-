import { NextResponse } from 'next/server';
import { emailDoAccess } from '@/lib/acoes';
import { lerSnapshot } from '@/lib/dados';
import { agregar, chavePessoa, contasComViaQuente, validarNota } from '@/lib/relacionamentos';
import { lerRelacionamentos, relacionamentosLigado, salvarRelacionamento } from '@/lib/relacionamentos-banco';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const semCache = { 'Cache-Control': 'no-store' };
const autorDe = (req: Request) => emailDoAccess(req.headers.get('cf-access-jwt-assertion')) ?? process.env.RADAR_AUTOR_TESTE ?? null;

/**
 * Relacionamento com pessoas do comitê (privado). 204 = desligado (RADAR_RELACIONAMENTOS ≠ 1).
 * GET ?conta=ID → { pessoas: { chave: { nota, em, minha, registros } } }  (sem autores)
 * GET           → { viaQuente: [contaId] }                                (só as contas, para o selo em Hoje)
 */
export async function GET(req: Request) {
  if (!relacionamentosLigado()) return new NextResponse(null, { status: 204, headers: semCache });
  const contaId = new URL(req.url).searchParams.get('conta') ?? undefined;
  const linhas = await lerRelacionamentos(contaId);
  if (linhas === null) return NextResponse.json({ erro: 'não foi possível ler' }, { status: 503, headers: semCache });
  const agora = new Date();
  if (contaId) return NextResponse.json({ pessoas: agregar(linhas, agora, autorDe(req)) }, { headers: semCache });
  return NextResponse.json({ viaQuente: contasComViaQuente(linhas, agora) }, { headers: semCache });
}

export async function POST(req: Request) {
  if (!relacionamentosLigado()) return NextResponse.json({ erro: 'desligado' }, { status: 404, headers: semCache });
  const autor = autorDe(req);
  if (!autor) return NextResponse.json({ erro: 'sem identidade do Access' }, { status: 401, headers: semCache });
  let corpo: { contaId?: unknown; pessoa?: unknown; nota?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'JSON inválido' }, { status: 400, headers: semCache });
  }
  const contaId = typeof corpo.contaId === 'string' ? corpo.contaId : '';
  const pessoa = typeof corpo.pessoa === 'string' ? corpo.pessoa.trim() : '';
  const nota = validarNota(corpo.nota);
  if (!contaId || !pessoa || nota === null) return NextResponse.json({ erro: 'contaId, pessoa ou nota inválidos' }, { status: 400, headers: semCache });
  // a pessoa precisa estar no comitê da conta na base: o navegador não cria pessoa nova
  const base = await lerSnapshot().catch(() => null);
  const conta = base?.contas.find(c => c.id === contaId);
  const nome = conta?.comite.find(p => chavePessoa(p.nome) === chavePessoa(pessoa))?.nome;
  if (!nome) return NextResponse.json({ erro: 'pessoa não encontrada no comitê da conta' }, { status: 400, headers: semCache });
  const r = await salvarRelacionamento(contaId, nome, nota, autor);
  if (r !== 'ok') return NextResponse.json({ erro: 'não foi possível gravar' }, { status: 503, headers: semCache });
  return NextResponse.json({ ok: true }, { headers: semCache });
}
