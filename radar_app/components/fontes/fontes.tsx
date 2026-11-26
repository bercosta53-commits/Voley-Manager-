'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, KeyRound } from 'lucide-react';
import type { Fonte, StatusFonte } from '@/lib/tipos';
import type { BaseCasca } from '@/lib/casca-dados';
import { cn, dataCurta, plural, quando } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Casca } from '@/components/casca/casca';
import { Aviso, ErroCarregar, SemPermissao } from '@/components/hoje/estados';
import { PlugZap } from 'lucide-react';
import type { ResumoCobertura } from '@/lib/varredura';
import { CoberturaVarredura } from './cobertura-varredura';

type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';
const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

const STATUS: Record<StatusFonte, { rotulo: string; icone: typeof CircleCheck; cor: string; fundo: string }> = {
  ok: { rotulo: 'Funcionando', icone: CircleCheck, cor: 'text-ok', fundo: 'bg-ok-bg' },
  atencao: { rotulo: 'Precisa de atenção', icone: CircleAlert, cor: 'text-warm', fundo: 'bg-warm-bg' },
  erro: { rotulo: 'Com erro', icone: CircleX, cor: 'text-risk', fundo: 'bg-risk-bg' },
};
const ORDEM: Record<StatusFonte, number> = { erro: 0, atencao: 1, ok: 2 };

const frequencia = (dias: number) => (dias <= 1 ? 'todo dia' : dias === 7 ? 'toda semana' : dias >= 28 ? 'todo mês' : `a cada ${dias} dias`);

export function TelaFontes({ base, cobertura }: { base: BaseCasca; cobertura?: ResumoCobertura }) {
  const [estadoTela, setEstadoTela] = useState<EstadoTela>('normal');
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoTela(e);
    setPronto(true);
  }, []);
  const fontes = estadoTela === 'vazio' ? [] : [...base.fontes].sort((a, b) => ORDEM[a.status] - ORDEM[b.status]);
  const ok = fontes.filter(f => f.status === 'ok').length;

  let conteudo: React.ReactNode;
  if (estadoTela === 'carregando' || !pronto)
    conteudo = (
      <div aria-busy aria-label="Carregando fontes" className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-card" />
        ))}
      </div>
    );
  else if (estadoTela === 'erro') conteudo = <ErroCarregar oque="as fontes" onTentar={() => location.reload()} />;
  else if (estadoTela === 'sem-permissao') conteudo = <SemPermissao />;
  else if (!fontes.length)
    conteudo = (
      <Aviso icone={<PlugZap className="size-5" strokeWidth={1.5} />} titulo="Nenhuma fonte ligada">
        Os coletores ainda não foram configurados nesta máquina. O guia CONECTORES.md explica cada um.
      </Aviso>
    );
  else {
    // primeiro as fontes que trazem fatos; as que ainda estão em configuração ficam numa tabela recolhida
    const ativas = fontes.filter(f => f.status === 'ok' || f.sinais > 0).sort((a, b) => b.sinais - a.sinais);
    const emConfiguracao = fontes.filter(f => !ativas.includes(f));
    conteudo = (
      <>
        {ativas.length > 0 && (
          <>
            <h2 className="mb-3 text-md font-semibold">Trazendo fatos</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {ativas.map(f => (
                <CartaoFonte key={f.id} fonte={f} hoje={base.geradoEm} />
              ))}
            </ul>
          </>
        )}
        {emConfiguracao.length > 0 && (
          <details className="vr-card mt-6 p-4">
            <summary className="cursor-pointer text-sm font-semibold select-none">
              Em configuração · {plural(emConfiguracao.length, 'fonte', 'fontes')}
              <span className="ml-2 font-normal text-text-3">cadastro recuperado, coleta ainda não validada na infraestrutura nova</span>
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-3">
                    <th className="py-1.5 pr-3 font-medium">Fonte</th>
                    <th className="py-1.5 pr-3 font-medium">Procura</th>
                    <th className="py-1.5 pr-3 font-medium">Roda</th>
                    <th className="py-1.5 font-medium">Próximo passo</th>
                  </tr>
                </thead>
                <tbody>
                  {emConfiguracao.map(f => (
                    <tr key={f.id} className="border-t border-border/60 align-top">
                      <td className="py-2 pr-3 font-medium">{f.nome}</td>
                      <td className="py-2 pr-3 text-text-2">{f.busca}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-text-3">{frequencia(f.intervaloDias)}</td>
                      <td className="py-2 text-text-3">{f.requisito || f.resumo.split('. ')[1] || f.resumo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </>
    );
  }

  return (
    <Casca base={base}>
      <main className="w-full max-w-[1440px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
        <div className="mb-6 md:mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Fontes</h1>
          <p className="mt-1 max-w-xl text-sm text-text-3">
            {fontes.length && pronto && estadoTela === 'normal'
              ? `De onde o Radar tira os fatos: ${plural(fontes.filter(f => f.status === 'ok' || f.sinais > 0).length, 'fonte trazendo fatos', 'fontes trazendo fatos')} agora. Chaves de acesso entram pelas configurações do ambiente, nunca pelo chat.`
              : 'De onde o radar tira os sinais.'}
          </p>
        </div>
        {cobertura && cobertura.total > 0 && pronto && estadoTela === 'normal' && <CoberturaVarredura resumo={cobertura} />}
        {conteudo}
      </main>
    </Casca>
  );
}

function CartaoFonte({ fonte: f, hoje }: { fonte: Fonte; hoje: string }) {
  const st = STATUS[f.status];
  const Icone = st.icone;
  return (
    <li className="vr-card flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-md font-semibold">{f.nome}</h2>
        {/* fonte que já traz fatos só ganha selo quando está com erro */}
        {(f.status === 'erro' || f.sinais === 0) && (
          <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-medium', st.fundo, st.cor)}>
            <Icone className="size-3.5" strokeWidth={1.5} />
            {st.rotulo}
          </span>
        )}
      </div>
      <dl className="grid gap-2 text-sm">
        <Linha rotulo="Procura">{f.busca}</Linha>
        <Linha rotulo="Onde">{f.onde}</Linha>
        <Linha rotulo="Roda">{frequencia(f.intervaloDias)}</Linha>
        <Linha rotulo="Última coleta">
          {f.ultimaColeta ? (
            <>
              <span className="vr-data text-xs">{quando(f.ultimaColeta.slice(0, 10), hoje)}</span>
              {quando(f.ultimaColeta.slice(0, 10), hoje) !== dataCurta(f.ultimaColeta.slice(0, 10)) && <span className="vr-data text-xs text-text-3"> · {dataCurta(f.ultimaColeta.slice(0, 10))}</span>}
              <span className="text-text-3">
                {' '}
                · {plural(f.itensUltima, 'item encontrado', 'itens encontrados')}
                {f.errosUltima > 0 && <span className="text-risk"> · {plural(f.errosUltima, 'erro', 'erros')}</span>}
              </span>
            </>
          ) : (
            <span className="text-text-3">nunca rodou</span>
          )}
        </Linha>
        <Linha rotulo="Sinais trazidos">
          <span className="vr-data text-xs">{f.sinais}</span>
          <span className="text-text-3"> reais até agora</span>
        </Linha>
        {f.custo && <Linha rotulo="Custo">{f.custo}</Linha>}
      </dl>
      <div className={cn('mt-auto flex items-start gap-2 rounded-control px-3 py-2.5 text-sm', f.status === 'erro' ? cn(st.fundo, 'text-foreground') : 'bg-muted text-text-2')}>
        {f.requisito ? <KeyRound className={cn('mt-0.5 size-4 shrink-0', st.cor)} strokeWidth={1.5} /> : <Icone className={cn('mt-0.5 size-4 shrink-0', st.cor)} strokeWidth={1.5} />}
        <p>
          {f.resumo}
        </p>
      </div>
    </li>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3">
      <dt className="text-text-3">{rotulo}</dt>
      <dd className="min-w-0 text-text-2 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
