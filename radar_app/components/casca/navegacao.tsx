'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Building2, Inbox, PlugZap, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { BotaoTema } from '@/components/hoje/tema';

export const SECOES = [
  { href: '/', rotulo: 'Hoje', icone: Inbox },
  { href: '/contas', rotulo: 'Contas', icone: Building2 },
  { href: '/fontes', rotulo: 'Fontes', icone: PlugZap },
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

/** Barra superior (computador): camada flutuante com glass. */
export function NavTopo({ ficticia, onBuscar }: { ficticia: boolean; onBuscar: () => void }) {
  const ativa = useSecaoAtiva();
  return (
    <header className="vr-glass sticky top-3 z-30 mx-auto mt-3 hidden h-12 w-[min(1120px,calc(100%-32px))] items-center gap-4 rounded-overlay px-4 shadow-2 md:flex">
      <Marca />
      <nav aria-label="Seções" className="flex items-center gap-1">
        {SECOES.map(s => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={ativa(s.href) ? 'page' : undefined}
            className={cn(
              'rounded-control px-3 py-1.5 text-sm font-medium text-text-3 transition-colors duration-[var(--vr-dur-hover)] hover:text-foreground',
              ativa(s.href) && 'bg-secondary font-semibold text-foreground',
            )}
          >
            {s.rotulo}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onBuscar}
          className="flex h-8 w-56 items-center gap-2 rounded-control border border-border bg-card/60 px-2.5 text-sm text-text-3 transition-colors duration-[var(--vr-dur-hover)] hover:border-border-strong hover:text-text-2 lg:w-64"
        >
          <Search className="size-4" strokeWidth={1.5} />
          <span className="flex-1 text-left">Buscar ou perguntar</span>
          <Kbd>⌘K</Kbd>
        </button>
        <AvisoExemplo ficticia={ficticia} />
        <BotaoTema />
      </div>
    </header>
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

/** Navegação inferior (celular): camada flutuante com glass. Alvos de toque de 44px ou mais. */
export function NavInferior({ novos }: { novos: number }) {
  const ativa = useSecaoAtiva();
  return (
    <nav
      aria-label="Seções"
      className="vr-glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex h-16 items-stretch rounded-overlay p-1.5 shadow-3 md:hidden"
    >
      {SECOES.map(({ href, rotulo, icone: Icone }) => (
        <Link
          key={href}
          href={href}
          aria-current={ativa(href) ? 'page' : undefined}
          className={cn(
            'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-card text-xs font-medium text-text-3 transition-colors duration-[var(--vr-dur-hover)]',
            ativa(href) && 'bg-card text-foreground shadow-1',
          )}
        >
          <span className="relative">
            <Icone className="size-5" strokeWidth={1.5} />
            {href === '/' && novos > 0 && (
              <span aria-hidden className="absolute -top-0.5 -right-1 size-2 rounded-full bg-acid ring-2 ring-[var(--vr-glass-solid)]" />
            )}
          </span>
          {rotulo}
          {href === '/' && novos > 0 && <span className="sr-only">, {novos} na caixa</span>}
        </Link>
      ))}
    </nav>
  );
}
