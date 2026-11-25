'use client';

import { ExternalLink } from 'lucide-react';
import type { PapelAbm } from '@/lib/tipos';
import { rotuloValidacao, type Tese } from '@/lib/tese';
import { primeiraMaiuscula } from '@/lib/contas';
import { COR_PAPEL, rotuloPapel } from '@/lib/papeis';
import { cn, dataCurta, plural, pontos } from '@/lib/utils';
import { COR_STATUS_VSCS } from '@/components/ui/selo-vscs';
import { SeloQualificada } from '@/components/ui/selo-qualificada';

function Linha({ pergunta, children, vazio }: { pergunta: string; children?: React.ReactNode; vazio?: string }) {
  return (
    <div className="grid gap-1 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-5">
      <dt className="text-sm font-medium text-text-3 sm:pt-px">{pergunta}</dt>
      {/* children vazio (null, undefined ou false) mostra o texto de ausência: nada é preenchido por inferência */}
      <dd className="min-w-0 text-sm">{children || <span className="text-text-3">{vazio ?? 'Não identificado na base.'}</span>}</dd>
    </div>
  );
}

const Papel = ({ papel }: { papel?: PapelAbm }) =>
  papel ? <span className={cn('rounded-chip px-1.5 py-0.5 text-xs font-medium', COR_PAPEL[papel])}>{rotuloPapel(papel)}</span> : null;

/**
 * Tese da conta: as seis perguntas de uma oportunidade numa leitura, antes da ação. Cada resposta vem da
 * base (lib/tese.ts); o que falta aparece como "não identificado", nunca preenchido por inferência.
 */
export function TeseConta({ tese, nomeConta }: { tese: Tese; nomeConta: string }) {
  const { empresa, agora, oportunidade, evidencias, fatos90d, quem, comite, acao, scorePendente, qualificada } = tese;
  return (
    <section aria-labelledby="tese-da-conta" className="vr-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="tese-da-conta" className="font-display text-lg font-semibold tracking-tight">
            Tese da conta
          </h2>
          <p className="text-sm text-text-3">Por que agir agora, com quem e o que fazer.</p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          <SeloQualificada conta={{ qualificada }} />
          {scorePendente && (
            <span className="rounded-chip border border-warm bg-warm-bg px-1.5 py-0.5 text-xs text-foreground" title="O motor ainda não certificou o VSCS desta conta">
              Score pendente de certificação
            </span>
          )}
        </span>
      </div>
      <dl className="mt-5 divide-y divide-border">
        <Linha pergunta={`Por que a ${nomeConta}`}>
          {empresa && (
            <>
              <p className="font-medium">
                {empresa.tier ? `Tier ${empresa.tier} do ICP` : 'Fora da classificação de ICP'}
                {empresa.segmento && <span className="font-normal text-text-2"> · {empresa.segmento}</span>}
              </p>
              {empresa.motivos.length > 0 && <p className="mt-0.5 text-text-2">{empresa.motivos.join(' · ')}</p>}
              {qualificada?.status === 'sim' && (
                <p className="mt-0.5 text-xs text-ok">
                  Conta qualificada{qualificada.desde ? ` desde ${dataCurta(qualificada.desde)}` : ''}
                  {qualificada.motivo ? `: ${qualificada.motivo}` : ''}
                </p>
              )}
            </>
          )}
        </Linha>

        <Linha pergunta="Por que agora" vazio="Nenhum fato aberto nesta conta.">
          {agora && (
            <>
              <p className="text-md font-semibold">{agora.sinal.sinal || agora.sinal.rotulo}</p>
              <p className="mt-0.5 text-text-2">{agora.sinal.porQueAgora}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="vr-data rounded-chip border border-border px-1.5 py-0.5 text-text-2">
                  {dataCurta(agora.sinal.data)} · {agora.dias === 0 ? 'hoje' : `há ${plural(agora.dias, 'dia', 'dias')}`}
                </span>
                <span className="vr-data rounded-chip bg-warm-bg px-1.5 py-0.5 font-semibold text-warm">+{pontos(agora.sinal.pontos)} no VSCS</span>
                {agora.estagio && <span className={cn('rounded-chip px-1.5 py-0.5 font-medium', COR_STATUS_VSCS[agora.estagio])}>{agora.estagio}</span>}
                {agora.abertos > 1 && <span className="text-text-3">mais {plural(agora.abertos - 1, 'fato aberto', 'fatos abertos')}</span>}
              </p>
            </>
          )}
        </Linha>

        <Linha pergunta="Qual oportunidade" vazio={agora ? 'Sem leitura comercial escrita para este tipo de fato.' : 'Sem fato aberto, sem oportunidade a ler.'}>
          {oportunidade && <p className="text-text-2">{oportunidade}</p>}
        </Linha>

        <Linha pergunta="Qual evidência" vazio={agora ? 'Fato sem link de fonte registrado.' : undefined}>
          {evidencias.length === 0 ? null : (
            <>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {evidencias.map(e => (
                  <li key={e.url}>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-chip font-medium underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                    >
                      {e.fonte}, {dataCurta(e.data)} <ExternalLink className="size-3" strokeWidth={1.5} />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-0.5 text-xs text-text-3">
                {evidencias.length > 1 ? `${evidencias.length} veículos confirmam o fato` : '1 veículo'} · {plural(fatos90d, 'fato', 'fatos')} da conta em 90 dias
              </p>
            </>
          )}
        </Linha>

        <Linha pergunta="Com quem falar" vazio="Ninguém do comitê de compra identificado ainda.">
          {quem && (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{quem.nome}</span>
                <span className="text-text-2">{quem.cargo}</span>
                <Papel papel={quem.papel} />
              </p>
              <p className="mt-0.5 text-xs text-text-3">
                {quem.statusValidacao && (
                  <span className={cn('font-medium', quem.bloqueado ? 'text-risk' : quem.liberado ? 'text-ok' : 'text-warm')}>
                    {primeiraMaiuscula(rotuloValidacao(quem.statusValidacao) ?? '')} ·{' '}
                  </span>
                )}
                {quem.origem === 'sinal' ? 'Citada no fato' : 'Do comitê mapeado'} · {plural(comite.pessoas, 'pessoa', 'pessoas')} no comitê
                {comite.faltando.length > 0 && ` · falta: ${comite.faltando.map(f => (rotuloPapel(f as PapelAbm) ?? f).toLowerCase()).join(', ')}`}
              </p>
            </>
          )}
        </Linha>

        <Linha pergunta="Próxima ação">
          {/* a resposta que a tela toda prepara: em destaque quando pede contato, neutra quando pede esperar */}
          <div className={cn('rounded-control p-4', acao.abordar ? 'bg-foreground text-background' : 'bg-muted')}>
            <p className="text-md font-semibold">{acao.titulo}</p>
            {acao.texto && <p className={cn('mt-1', acao.abordar ? 'text-background/80' : 'text-text-2')}>{acao.texto}</p>}
            {acao.origem === 'matriz' && (
              <p className={cn('mt-1.5 text-xs', acao.abordar ? 'text-background/70' : 'text-text-3')}>Pela matriz ICP × VSCS; o motor ainda não gravou a ação desta conta.</p>
            )}
            {acao.abordar && (
              <a
                href="#proxima-acao"
                className="mt-3 inline-flex min-h-9 items-center rounded-control bg-background px-3.5 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
              >
                Abrir o rascunho da abordagem
              </a>
            )}
          </div>
        </Linha>
      </dl>
    </section>
  );
}
