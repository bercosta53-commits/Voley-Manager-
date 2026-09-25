'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from './button';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Camada flutuante (glass): modal centralizado no computador, bottom sheet no celular.
 * Uma das poucas superfícies com glass no app; o fundo sólido de reserva vem de .vr-glass.
 */
export function PainelFlutuante({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  const reduzir = useReducedMotion();
  return (
    <Dialog.Root open={aberto} onOpenChange={a => !a && onFechar()}>
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
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={e => {
                // Abre no primeiro campo de texto, se houver (o rascunho da mensagem); senão, no painel.
                const campo = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('textarea, input');
                if (campo) {
                  e.preventDefault();
                  campo.focus();
                }
              }}
            >
              <motion.div
                className="vr-glass fixed z-50 flex max-h-[88dvh] flex-col overflow-hidden shadow-3 outline-none
                  inset-x-0 bottom-0 rounded-t-overlay border-b-0 pb-[env(safe-area-inset-bottom)]
                  md:inset-x-auto md:top-[14vh] md:bottom-auto md:left-1/2 md:w-[560px] md:-translate-x-1/2 md:rounded-overlay md:border-b md:pb-0"
                initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } }}
                exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 24, transition: { duration: 0.32, ease: EASE } }}
              >
                <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong md:hidden" />
                <div className="flex items-start gap-3 px-5 pt-4 md:px-6 md:pt-5">
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-lg font-semibold">{titulo}</Dialog.Title>
                    {descricao ? (
                      <Dialog.Description className="mt-0.5 text-sm text-text-3">{descricao}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Fechar">
                      <X />
                    </Button>
                  </Dialog.Close>
                </div>
                <div className="overflow-y-auto px-5 pt-3 pb-5 md:px-6 md:pb-6">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
