'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BarChart3, Building2, CloudSun, Crosshair, Inbox, MoreHorizontal, PlugZap, Radar, Search, Target, UsersRound } from 'lucide-react';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { BotaoTema } from '@/components/hoje/tema';
import type { Base } from '@/lib/tipos';

export const SECOES = [
  { href: '/', rotulo: 'Hoje', icone: Inbox },
  { href: '/radar', rotulo: 'Radar', icone: Radar },
  { href: '/aquisicao', rotulo: 'Aquisição', icone: Target },
  { href: '/icp', rotulo: 'ICP', icone: Crosshair },
  { href: '/contas', rotulo: 'Contas', icone: Building2 },
  { href: '/decisores', rotulo: 'Decisores', icone: UsersRound },
  { href: '/fontes', rotulo: 'Fontes', icone: PlugZap },
  { href: '/clima', rotulo: 'Clima', icone: CloudSun },
  { href: '/metricas', rotulo: 'Métricas', icone: BarChart3 },
] as const;

export function useSecaoAtiva() {
  const caminho = usePathname() || '/';
  return (href: string) => (href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(href + '/'));
}

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-chip">
      <span className="text-md font-semibold tracking-tight">velora</span>
      <span className="text-md text-text-3">radar</span>
    </Link>
  );
}

function AvisoExemplo({ ficticia }: { ficticia: boolean }) {
  // base real: não há o que avisar (o selo "Sinais de exemplo" era da fase de demonstração)
  if (!ficticia) return null;
  return (
    <Tooltip
      lado="bottom"
      conteudo={
        ficticia
          ? 'Empresas e sinais fictícios, só para demonstração.'
          : 'Contas reais da sua base. Os sinais marcados "exemplo" são fictícios até os coletores rodarem.'
      }
    >
      <span tabIndex={0} className="rounded-chip border border-border px-2 py-0.5 text-xs whitespace-nowrap text-text-3">
        {ficticia ? 'Base fictícia' : 'Sinais de exemplo'}
      </span>
    </Tooltip>
  );
}

/** Data e hora de atualização da base, em linguagem de gente ("hoje, 14:20", "ontem", "3 nov"). */
function atualizada(iso: string | undefined) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  const hoje = new Date();
  const dias = Math.round((new Date(hoje.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  const hora = iso.length > 10 ? `, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '';
  if (dias <= 0) return `hoje${hora}`;
  if (dias === 1) return `ontem${hora}`;
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
}

/**
 * Menu lateral (computador): fixo, sólido, com contagens e o estado da base — de quando é o dado e se as
 * fontes estão de pé. No md vira trilho de ícones; no lg mostra os rótulos.
 */
export function NavLateral({ base, novos, onBuscar }: { base: Base; novos: number; onBuscar: () => void }) {
  const ativa = useSecaoAtiva();
  const contagem: Record<string, number | undefined> = {
    '/': novos || undefined,
    '/contas': base.contas.length,
    '/decisores': base.contas.reduce((n, c) => n + c.comite.length, 0),
  };
  const fontes = base.fontes ?? [];
  const ok = fontes.filter(f => f.status === 'ok').length;
  const comErro = fontes.some(f => f.status === 'erro');
  return (
    <aside
      aria-label="Navegação principal"
      className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-border bg-[var(--vr-surface)] md:flex lg:w-60"
    >
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b border-border px-4 lg:px-5">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-foreground text-[13px] font-bold text-background">
          v
        </span>
        <span className="hidden items-baseline gap-1.5 lg:flex">
          <span className="text-md font-semibold tracking-tight">velora</span>
          <span className="text-md text-text-3">radar</span>
        </span>
      </Link>

      <div className="px-2.5 pt-3 lg:px-3">
        <button
          onClick={onBuscar}
          aria-label="Buscar ou perguntar"
          className="flex h-8 w-full items-center justify-center gap-2 rounded-control border border-border bg-[var(--vr-surface-2)] px-2.5 text-sm text-text-3 transition-colors duration-[var(--vr-dur-hover)] hover:border-border-strong hover:text-text-2 lg:justify-start"
        >
          <Search className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="hidden flex-1 text-left lg:inline">Buscar</span>
          <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
        </button>
      </div>

      <nav aria-label="Seções" className="mt-3 flex flex-col gap-0.5 px-2.5 lg:px-3">
        {SECOES.map(({ href, rotulo, icone: Icone }) => {
          const n = contagem[href];
          return (
            <Link
              key={href}
              href={href}
              title={rotulo}
              aria-current={ativa(href) ? 'page' : undefined}
              className={cn(
                'relative flex h-9 items-center justify-center gap-2.5 rounded-control px-2.5 text-sm font-medium text-text-2 transition-colors duration-[var(--vr-dur-hover)] hover:bg-[var(--vr-surface-2)] hover:text-foreground lg:justify-start',
                ativa(href) && 'bg-[var(--vr-surface-3)] text-foreground',
              )}
            >
              {ativa(href) && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-foreground" />}
              <Icone className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="hidden flex-1 lg:inline">{rotulo}</span>
              {n !== undefined && <span className="vr-data hidden text-xs text-text-3 lg:inline">{n}</span>}
              {href === '/' && novos > 0 && <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-acid ring-2 ring-[var(--vr-surface)] lg:hidden" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border px-2.5 py-3 lg:px-4">
        <Link
          href="/fontes"
          className="hidden flex-col gap-1 rounded-control px-1 py-1 text-xs text-text-3 transition-colors hover:text-foreground lg:flex"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-1.5 rounded-full', comErro ? 'bg-risk' : 'bg-ok')} />
            Base atualizada {atualizada(base.atualizadoEm ?? base.geradoEm)}
          </span>
          {fontes.length > 0 && (
            <span className="pl-3">
              {ok} de {fontes.length} fontes funcionando
            </span>
          )}
        </Link>
        <div className="mt-2 flex items-center justify-center gap-1 lg:justify-between">
          <span className="hidden lg:inline">
            <AvisoExemplo ficticia={!!base.ficticia} />
          </span>
          <BotaoTema />
        </div>
      </div>
    </aside>
  );
}

/** Topo simples no celular (sem glass: o glass do celular fica na navegação inferior). */
export function TopoCelular({ ficticia, onBuscar }: { ficticia: boolean; onBuscar: () => void }) {
  return (
    <header className="flex h-14 items-center gap-2 px-4 md:hidden">
      <Marca />
      <div className="ml-auto flex items-center gap-1">
        <AvisoExemplo ficticia={ficticia} />
        <Button variant="ghost" size="icon" onClick={onBuscar} aria-label="Buscar ou perguntar">
          <Search />
        </Button>
        <BotaoTema />
      </div>
    </header>
  );
}

/** Navegação inferior (celular): cinco seções + "Mais" com o resto. Alvos de toque de 44px ou mais. */
const NO_CELULAR = ['/', '/radar', '/aquisicao', '/contas', '/decisores'];

export function NavInferior({ novos }: { novos: number }) {
  const ativa = useSecaoAtiva();
  const [mais, setMais] = useState(false);
  const principais = SECOES.filter(s => NO_CELULAR.includes(s.href));
  const resto = SECOES.filter(s => !NO_CELULAR.includes(s.href));
  const restoAtivo = resto.some(s => ativa(s.href));
  const item = 'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-card text-xs font-medium text-text-3 transition-colors duration-[var(--vr-dur-hover)]';
  return (
    <>
      <nav aria-label="Seções" className="vr-glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex h-16 items-stretch rounded-overlay p-1.5 shadow-3 md:hidden">
        {principais.map(({ href, rotulo, icone: Icone }) => (
          <Link key={href} href={href} aria-current={ativa(href) ? 'page' : undefined} className={cn(item, ativa(href) && 'bg-card text-foreground shadow-1')}>
            <span className="relative">
              <Icone className="size-5" strokeWidth={1.5} />
              {href === '/' && novos > 0 && <span aria-hidden className="absolute -top-0.5 -right-1 size-2 rounded-full bg-acid ring-2 ring-[var(--vr-glass-solid)]" />}
            </span>
            {rotulo}
            {href === '/' && novos > 0 && <span className="sr-only">, {novos} na caixa</span>}
          </Link>
        ))}
        <button type="button" onClick={() => setMais(true)} aria-haspopup="dialog" className={cn(item, restoAtivo && 'bg-card text-foreground shadow-1')}>
          <MoreHorizontal className="size-5" strokeWidth={1.5} />
          Mais
        </button>
      </nav>
      <PainelFlutuante aberto={mais} onFechar={() => setMais(false)} titulo="Mais seções">
        <ul className="flex flex-col gap-1">
          {resto.map(({ href, rotulo, icone: Icone }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setMais(false)}
                aria-current={ativa(href) ? 'page' : undefined}
                className={cn('flex min-h-12 items-center gap-3 rounded-control px-3 text-md font-medium', ativa(href) ? 'bg-[var(--vr-surface-3)] text-foreground' : 'text-text-2')}
              >
                <Icone className="size-5" strokeWidth={1.5} />
                {rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </PainelFlutuante>
    </>
  );
}
