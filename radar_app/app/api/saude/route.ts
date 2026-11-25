import { NextResponse } from 'next/server';
import { ErroBase, lerSnapshot } from '@/lib/dados';
import { frescor, LIMITE_ATENCAO_H, LIMITE_CRITICO_H } from '@/lib/frescor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Saúde do Radar para quem opera (checagem das 8h, monitor externo). Protegida pelo Cloudflare Access como
 * todo o app. Só contagens e datas: nenhum nome, e-mail ou conteúdo de sinal.
 * 200 = base legível (ok ou desatualizada) · 503 = base não pôde ser lida.
 */
export async function GET() {
  const cabecalhos = { 'Cache-Control': 'no-store' };
  try {
    const base = await lerSnapshot();
    const atualizadoEm = base.atualizadoEm ?? base.geradoEm;
    const { nivel, horas } = frescor(atualizadoEm, new Date());
    return NextResponse.json(
      {
        status: nivel === 'ok' ? 'ok' : 'desatualizada',
        frescor: nivel,
        atualizadoEm,
        idadeHoras: horas === null ? null : Math.round(horas * 10) / 10,
        limitesHoras: { atencao: LIMITE_ATENCAO_H, critico: LIMITE_CRITICO_H },
        contagens: {
          contas: base.contas.length,
          pessoas: base.contas.reduce((n, c) => n + (c.comite?.length ?? 0), 0),
          sinais: base.sinais.length,
          fontes: base.fontes.length,
          fontesOk: base.fontes.filter(f => f.status === 'ok').length,
        },
        qualidade: base.diagnostico && {
          descartados: base.diagnostico.descartados,
          sinaisSemEvidencia: base.diagnostico.sinaisSemEvidencia,
        },
        leitura: base.diagnostico && { ms: base.diagnostico.ms, bytes: base.diagnostico.bytes },
      },
      { headers: cabecalhos },
    );
  } catch (e) {
    const motivo = e instanceof ErroBase ? e.motivo : 'desconhecido';
    const detalhe = e instanceof ErroBase ? e.detalhe : 'Erro inesperado; ver os logs do Worker.';
    return NextResponse.json({ status: 'erro', motivo, detalhe }, { status: 503, headers: cabecalhos });
  }
}
