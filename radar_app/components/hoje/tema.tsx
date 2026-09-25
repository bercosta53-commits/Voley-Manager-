'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export const SCRIPT_TEMA = `try{var t=localStorage.getItem('vr:tema');if(t==='escuro')document.documentElement.classList.add('dark')}catch(e){}`;

export function BotaoTema({ className }: { className?: string }) {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => setEscuro(document.documentElement.classList.contains('dark')), []);
  function alternar() {
    const prox = !escuro;
    document.documentElement.classList.toggle('dark', prox);
    setEscuro(prox);
    try {
      localStorage.setItem('vr:tema', prox ? 'escuro' : 'claro');
    } catch {}
  }
  return (
    <Tooltip conteudo={escuro ? 'Tema claro' : 'Tema escuro'} lado="bottom">
      <Button variant="ghost" size="icon" onClick={alternar} aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'} className={className}>
        {escuro ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}
