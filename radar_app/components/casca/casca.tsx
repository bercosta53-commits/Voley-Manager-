'use client';

import { useState } from 'react';
import type { BaseCasca } from '@/lib/casca-dados';
import { Comando } from './comando';
import { NavInferior, NavLateral, TopoCelular } from './navegacao';
import { AvisoFrescor } from './aviso-frescor';
import { useParametroApresentacao } from '@/components/ui/use-apresentacao';

/** Moldura comum às telas: menu lateral no computador, navegação inferior no celular, e o Cmd+K. */
export function Casca({ base, novos = 0, children }: { base: BaseCasca; novos?: number; children: React.ReactNode }) {
  const [buscar, setBuscar] = useState(false);
  useParametroApresentacao();
  return (
    <>
      {/* na impressão (briefing de reunião) só o conteúdo sai no papel */}
      <div className="print:hidden">
        <NavLateral base={base} novos={novos} onBuscar={() => setBuscar(true)} />
      </div>
      <div className="md:pl-16 lg:pl-60 print:pl-0">
        <div className="print:hidden">
          <TopoCelular ficticia={!!base.ficticia} onBuscar={() => setBuscar(true)} />
        </div>
        <AvisoFrescor base={base} />
        {children}
      </div>
      <div className="print:hidden">
        <NavInferior novos={novos} />
      </div>
      <Comando base={base} aberto={buscar} onAberto={setBuscar} />
    </>
  );
}
