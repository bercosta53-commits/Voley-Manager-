'use client';

import { Toaster } from 'sonner';

/** Toasts: camada flutuante com glass. Ações destrutivas usam "Desfazer" aqui, não modal de confirmação. */
export function Avisos() {
  return (
    <Toaster
      position="bottom-center"
      duration={5000}
      visibleToasts={1}
      offset={24}
      mobileOffset={{ bottom: 96 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'vr-glass flex w-[min(420px,calc(100vw-24px))] items-center gap-3 rounded-overlay px-4 py-3 text-sm text-foreground shadow-3',
          title: 'flex-1 font-medium',
          icon: 'text-text-2',
          actionButton:
            'shrink-0 rounded-control px-2.5 py-1 text-sm font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:bg-secondary',
        },
      }}
    />
  );
}
