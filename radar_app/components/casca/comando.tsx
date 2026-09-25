'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CornerDownLeft, MessageCircleQuestion, Search, UserRound } from 'lucide-react';
import type { Base } from '@/lib/tipos';
import { hrefConta, normalizar } from '@/lib/contas';
import { aplicar, interpretar, paraUrl } from '@/lib/filtros';
import { cn, plural } from '@/lib/utils';
import { Kbd } from '@/components/ui/kbd';
import { LogoConta } from '@/components/hoje/logo-conta';
import { SECOES } from './navegacao';

const EASE = [0.16, 1, 0.3, 1] as const;

interface Item {
  id: string;
  grupo: 'Pergunta' | 'Contas' | 'Pessoas' | 'Ir para';
  titulo: React.ReactNode;
  detalhe?: string;
  icone: React.ReactNode;
  href: string;
}

/** Cmd+K: buscar conta ou pessoa, pular para uma tela, ou fazer uma pergunta simples sobre a base. */
export function Comando({ base, aberto, onAberto }: { base: Base; aberto: boolean; onAberto: (a: boolean) => void }) {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function tecla(ev: KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        onAberto(!aberto);
      } else if (ev.key === '/' && !aberto && !(ev.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
        ev.preventDefault();
        onAberto(true);
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, onAberto]);

  useEffect(() => {
    if (!aberto) setQ('');
  }, [aberto]);

  const sinaisPorConta = useMemo(() => {
    const m = new Map<string, typeof base.sinais>();
    for (const s of base.sinais) m.set(s.contaId, [...(m.get(s.contaId) ?? []), s]);
    return m;
  }, [base.sinais]);

  const itens = useMemo<Item[]>(() => {
    const texto = normalizar(q.trim());
    const saida: Item[] = [];
    if (!texto) {
      for (const c of [...base.contas].sort((a, b) => b.tendencia - a.tendencia).slice(0, 4))
        saida.push({
          id: c.id,
          grupo: 'Contas',
          titulo: c.nome,
          detalhe: `esquentando · +${c.tendencia} em 14 dias`,
          icone: <LogoConta nome={c.nome} dominio={c.dominio} tamanho={24} />,
          href: hrefConta(c.id),
        });
      for (const s of SECOES) saida.push({ id: s.href, grupo: 'Ir para', titulo: s.rotulo, icone: <s.icone className="size-4" strokeWidth={1.5} />, href: s.href });
      return saida;
    }

    // Pergunta: só aparece quando reconhece algum filtro na frase.
    const { filtros, entendido } = interpretar(q);
    if (entendido.length) {
      const n = aplicar(base.contas, filtros, sinaisPorConta).length;
      saida.push({
        id: 'pergunta',
        grupo: 'Pergunta',
        titulo: `${plural(n, 'conta', 'contas')}: ${entendido.join(', ')}`,
        detalhe: 'abrir a lista em Contas',
        icone: <MessageCircleQuestion className="size-4" strokeWidth={1.5} />,
        href: paraUrl(filtros),
      });
    }
    const partes = texto.split(/\s+/);
    const casa = (t: string) => partes.every(p => normalizar(t).includes(p));
    for (const c of base.contas.filter(c => casa(`${c.nome} ${c.razaoSocial} ${c.cnpj} ${c.cnpj.replace(/\D/g, '')} ${c.dominio}`)).slice(0, 6))
      saida.push({
        id: c.id,
        grupo: 'Contas',
        titulo: c.nome,
        detalhe: [c.cidade && `${c.cidade}/${c.uf}`, `score ${c.score}`].filter(Boolean).join(' · '),
        icone: <LogoConta nome={c.nome} dominio={c.dominio} tamanho={24} />,
        href: hrefConta(c.id),
      });
    for (const c of base.contas)
      for (const p of c.comite)
        if (casa(`${p.nome} ${p.cargo}`) && saida.filter(i => i.grupo === 'Pessoas').length < 5)
          saida.push({
            id: `${c.id}-${p.nome}`,
            grupo: 'Pessoas',
            titulo: p.nome,
            detalhe: `${p.cargo} · ${c.nome}`,
            icone: <UserRound className="size-4" strokeWidth={1.5} />,
            href: hrefConta(c.id),
          });
    for (const s of SECOES)
      if (casa(s.rotulo)) saida.push({ id: s.href, grupo: 'Ir para', titulo: s.rotulo, icone: <s.icone className="size-4" strokeWidth={1.5} />, href: s.href });
    return saida;
  }, [q, base.contas, sinaisPorConta]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  function ir(item?: Item) {
    if (!item) return;
    onAberto(false);
    router.push(item.href);
  }

  function tecla(ev: React.KeyboardEvent) {
    if (ev.key === 'ArrowDown') ev.preventDefault(), setSel(s => Math.min(itens.length - 1, s + 1));
    else if (ev.key === 'ArrowUp') ev.preventDefault(), setSel(s => Math.max(0, s - 1));
    else if (ev.key === 'Enter') ev.preventDefault(), ir(itens[sel]);
  }

  const grupos = [...new Set(itens.map(i => i.grupo))];

  return (
    <Dialog.Root open={aberto} onOpenChange={onAberto}>
      <AnimatePresence>
        {aberto && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-foreground/15"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2 } }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="vr-glass fixed inset-x-3 top-3 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-overlay shadow-3 outline-none md:inset-x-auto md:top-[14vh] md:left-1/2 md:w-[600px] md:-translate-x-1/2"
                initial={reduzir ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE } }}
                exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
              >
                <Dialog.Title className="sr-only">Buscar ou perguntar</Dialog.Title>
                <div className="flex items-center gap-3 border-b border-border px-4">
                  <Search className="size-4 shrink-0 text-text-3" strokeWidth={1.5} />
                  <input
                    autoFocus
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={tecla}
                    placeholder="Buscar conta, pessoa ou perguntar: tier A esquentando em SC"
                    role="combobox"
                    aria-expanded
                    aria-controls="comando-lista"
                    aria-activedescendant={itens[sel] ? `comando-${sel}` : undefined}
                    className="h-13 min-w-0 flex-1 bg-transparent text-md text-foreground outline-none placeholder:text-text-3 focus-visible:shadow-none"
                  />
                  <Kbd className="hidden md:inline-flex">esc</Kbd>
                </div>
                <div ref={lista} id="comando-lista" role="listbox" className="overflow-y-auto p-2">
                  {!itens.length && (
                    <p className="px-3 py-8 text-center text-sm text-text-3">
                      Nada encontrado para “{q}”.
                      <br />
                      Tente o nome da empresa, um CNPJ, ou uma pergunta como “cooperativas esquentando em SC”.
                    </p>
                  )}
                  {grupos.map(g => (
                    <div key={g} role="group" aria-label={g} className="mb-1">
                      <p className="px-3 pt-2 pb-1 text-xs font-medium text-text-3">{g}</p>
                      {itens.map((item, i) =>
                        item.grupo !== g ? null : (
                          <div
                            key={item.id}
                            id={`comando-${i}`}
                            data-i={i}
                            role="option"
                            aria-selected={i === sel}
                            onMouseMove={() => setSel(i)}
                            onClick={() => ir(item)}
                            className={cn(
                              'flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm md:min-h-10',
                              i === sel && 'bg-secondary',
                            )}
                          >
                            <span className="grid size-6 shrink-0 place-items-center text-text-2">{item.icone}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">{item.titulo}</span>
                              {item.detalhe && <span className="block truncate text-xs text-text-3">{item.detalhe}</span>}
                            </span>
                            {i === sel ? (
                              <CornerDownLeft className="size-4 text-text-3" strokeWidth={1.5} />
                            ) : (
                              <ArrowRight className="size-4 text-transparent" strokeWidth={1.5} />
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  ))}
                </div>
                <p className="hidden items-center gap-3 border-t border-border px-4 py-2 text-xs text-text-3 md:flex">
                  <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> escolher</span>
                  <span className="flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
                  <span className="ml-auto">Perguntas viram filtros: tier, estado, segmento, esquentando, status, com sinal.</span>
                </p>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
