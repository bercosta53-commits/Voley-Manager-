'use client';

import { CalendarClock, CheckCheck, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { BotaoTema } from './tema';

export type Visao = 'caixa' | 'adiados' | 'concluidos';

export const VISOES: { id: Visao; rotulo: string; icone: typeof Inbox }[] = [
  { id: 'caixa', rotulo: 'Caixa', icone: Inbox },
  { id: 'adiados', rotulo: 'Adiados', icone: CalendarClock },
  { id: 'concluidos', rotulo: 'Concluídos', icone: CheckCheck },
];

function Marca() {
  return (
    <span className="flex items-center gap-2">
      <span className="text-md font-semibold tracking-tight">velora</span>
      <span className="text-md text-text-3">radar</span>
    </span>
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
      <span tabIndex={0} className="rounded-chip border border-border px-2 py-0.5 text-xs text-text-3">
        {ficticia ? 'Base fictícia' : 'Sinais de exemplo'}
      </span>
    </Tooltip>
  );
}

/** Barra superior (computador): camada flutuante com glass. */
export function NavTopo({ ficticia }: { ficticia: boolean }) {
  return (
    <header className="vr-glass sticky top-3 z-30 mx-auto mt-3 hidden h-12 w-[min(1120px,calc(100%-32px))] items-center gap-4 rounded-overlay px-4 shadow-2 md:flex">
      <Marca />
      <nav aria-label="Seções" className="flex items-center gap-1">
        <a aria-current="page" href="/" className="rounded-control bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground">
          Hoje
        </a>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <AvisoExemplo ficticia={ficticia} />
        <BotaoTema />
      </div>
    </header>
  );
}

/** Topo simples no celular (sem glass: o glass do celular fica na navegação inferior). */
export function TopoCelular({ ficticia }: { ficticia: boolean }) {
  return (
    <header className="flex h-14 items-center gap-3 px-4 md:hidden">
      <Marca />
      <div className="ml-auto flex items-center gap-1">
        <AvisoExemplo ficticia={ficticia} />
        <BotaoTema />
      </div>
    </header>
  );
}

/** Navegação inferior (celular): camada flutuante com glass. Alvos de toque de 44px ou mais. */
export function NavInferior({ visao, contagens, onVisao }: { visao: Visao; contagens: Record<Visao, number>; onVisao: (v: Visao) => void }) {
  return (
    <nav
      aria-label="Visões de Hoje"
      className="vr-glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex h-16 items-stretch rounded-overlay p-1.5 shadow-3 md:hidden"
    >
      {VISOES.map(({ id, rotulo, icone: Icone }) => (
        <button
          key={id}
          onClick={() => onVisao(id)}
          aria-current={visao === id ? 'page' : undefined}
          className={cn(
            'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-card text-xs font-medium text-text-3 transition-colors duration-[var(--vr-dur-hover)]',
            visao === id && 'bg-card text-foreground shadow-1',
          )}
        >
          <span className="relative">
            <Icone className="size-5" strokeWidth={1.5} />
            {id === 'caixa' && contagens.caixa > 0 && (
              <span aria-hidden className="absolute -top-0.5 -right-1 size-2 rounded-full bg-acid ring-2 ring-[var(--vr-glass-solid)]" />
            )}
          </span>
          {rotulo}
          <span className="sr-only">, {contagens[id]}</span>
        </button>
      ))}
    </nav>
  );
}
