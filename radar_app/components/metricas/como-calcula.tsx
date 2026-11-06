import Link from 'next/link';
import type { Base } from '@/lib/tipos';
import { hrefConta } from '@/lib/contas';
import { cn } from '@/lib/utils';
import { FAIXAS_VSCS, MATRIZ_ICP } from '@/lib/avaliacao';

const CATEGORIAS = [
  { nome: 'Mudança de liderança', faixa: '70–95', meiaVida: 60, ex: 'CMO/CRO novo ~95 · diretor comercial ~85' },
  { nome: 'Expansão e investimento', faixa: '75–90', meiaVida: 90, ex: 'Série A+ ~90 · nova filial ~75' },
  { nome: 'Contratações estratégicas', faixa: '65–85', meiaVida: 45, ex: 'Head de Growth/Vendas ~85 · 1 vaga de SDR ~65' },
  { nome: 'Movimentos estratégicos', faixa: '65–85', meiaVida: 60, ex: 'comprou empresa ~85 · fusão ~70 · produto ~65' },
  { nome: 'Intenção e engajamento', faixa: '75–100', meiaVida: 15, ex: 'pedido de diagnóstico ~100 (via rápida, 48h)' },
  { nome: 'Sinal negativo', faixa: 'até −30', meiaVida: 90, ex: 'foi adquirida: a decisão sobe para a compradora' },
];

const FAIXA_COR = ['bg-secondary text-text-2', 'bg-cool-bg text-cool', 'bg-warm-bg text-warm', 'bg-ok-bg text-ok', 'bg-ok text-white'];

/**
 * Como o número é feito (VSCS 3.0), em linguagem de quem vai usar: o que vale cada fato, como o tempo apaga,
 * como os fatos se somam, o que o status significa e o que fazer com ele. O exemplo é uma conta real da base.
 */
export function ComoCalcula({ base }: { base: Base }) {
  const exemplo = [...base.contas]
    .filter(c => (c.v2?.contribuicoes?.length ?? 0) >= 2)
    // exemplo útil: conta dentro do ICP (tier A/B) com o maior score
    .sort((a, b) => Number((a.v2?.tier ?? a.tier) === 'C') - Number((b.v2?.tier ?? b.tier) === 'C') || b.score - a.score)[0];
  const faixas = [...FAIXAS_VSCS].reverse();

  return (
    <section aria-labelledby="como-calcula" className="vr-card mb-6 min-w-0 overflow-hidden p-5 md:p-6">
      <h2 id="como-calcula" className="text-md font-semibold">
        Como o score é calculado
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-text-2">
        O score (VSCS, 0 a 100) é um índice de prioridade pelos fatos observados na conta — não é probabilidade de compra. Ele responde: esta conta está num
        momento de mexer em aquisição e receita agora?
      </p>

      <ol className="mt-5 grid gap-5 md:grid-cols-3">
        <Passo n={1} titulo="Cada fato vira um valor (s)">
          <p>
            <span className="vr-data text-xs">s = base × fonte × tempo × repetição</span>
          </p>
          <p className="mt-1.5">
            <b className="font-medium text-foreground">Base</b>: força do fato para a Velora (tabela abaixo). <b className="font-medium text-foreground">Fonte</b>: 1,00 vaga
            publicada ou site oficial, 0,85 imprensa, 0,60 indício. <b className="font-medium text-foreground">Tempo</b>: cai pela metade a cada meia-vida e zera depois de três.{' '}
            <b className="font-medium text-foreground">Repetição</b>: o 2º fato da mesma categoria vale 70%, do 3º em diante 50%.
          </p>
        </Passo>
        <Passo n={2} titulo="Os fatos se somam, cada um vale menos">
          <p>
            <span className="vr-data text-xs">VSCS = 100 × [1 − Π(1 − 0,5 · s/100)]</span>
          </p>
          <p className="mt-1.5">
            Um fato sozinho chega a no máximo 50. Dois fortes passam de 65; três, de 80. Fatos de categorias diferentes em até 45 dias ganham bônus de convergência (+5 com duas, +8
            com três). Ter sido adquirida tira até 30 pontos.
          </p>
        </Passo>
        <Passo n={3} titulo="O status e o ICP dizem o que fazer">
          <p>O ICP não muda o número, muda a ação. A mesma nota pede abordagem numa conta tier A e só monitoramento numa tier B.</p>
        </Passo>
      </ol>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-3">Quanto vale cada tipo de fato</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-3">
                <th className="py-1 font-normal">Categoria</th>
                <th className="py-1 font-normal">Base</th>
                <th className="py-1 font-normal">Meia-vida</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIAS.map(c => (
                <tr key={c.nome} className="border-t border-border align-top">
                  <td className="py-1.5 pr-2">
                    <span className="text-foreground">{c.nome}</span>
                    <span className="block text-xs text-text-3">{c.ex}</span>
                  </td>
                  <td className="vr-data py-1.5 pr-2 text-xs whitespace-nowrap">{c.faixa}</td>
                  <td className="vr-data py-1.5 text-xs whitespace-nowrap">{c.meiaVida} d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-3">Ação por tier de ICP e faixa de score</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr>
                  <th className="py-1 pr-2 text-left font-normal text-text-3">Tier</th>
                  {faixas.map(([piso, st], i) => (
                    <th key={st} className="px-0.5 py-1 font-normal">
                      <span className={cn('block rounded-chip px-1 py-0.5 text-center text-[10px] leading-tight', FAIXA_COR[i])}>
                        {st}
                        <span className="vr-data block opacity-80">{piso}+</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['A', 'B', 'C'] as const).map(t => (
                  <tr key={t} className="border-t border-border">
                    <td className="py-1.5 pr-2 font-semibold">{t}</td>
                    {MATRIZ_ICP[t].map((acao, i) => (
                      <td key={i} className="px-0.5 py-1.5 text-center leading-tight text-text-2">
                        {acao}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {exemplo && (
        <div className="mt-6 rounded-control bg-muted px-4 py-3 text-sm">
          <p className="text-text-3">
            Exemplo da base:{' '}
            <Link href={hrefConta(exemplo.id)} className="font-medium text-foreground underline decoration-border-strong underline-offset-2">
              {exemplo.nome}
            </Link>{' '}
            · score <span className="vr-data">{exemplo.score}</span> · {exemplo.vscsStatus} · tier {exemplo.v2?.tier ?? exemplo.tier} → {exemplo.acaoRecomendada}
          </p>
          <ul className="mt-2 grid gap-1">
            {exemplo.composicao.map((p, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-text-2">
                  {p.rotulo}
                  {p.detalhe && <span className="text-text-3"> · {p.detalhe}</span>}
                </span>
                <span className={cn('vr-data shrink-0 text-xs', p.pontos < 0 ? 'text-risk' : 'text-foreground')}>
                  {p.pontos < 0 ? `−${Math.abs(p.pontos)}` : `+${p.pontos}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="text-sm text-text-2">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <span className="vr-data grid size-5 place-items-center rounded-full bg-secondary text-[11px]">{n}</span>
        {titulo}
      </p>
      <div className="mt-1.5">{children}</div>
    </li>
  );
}
