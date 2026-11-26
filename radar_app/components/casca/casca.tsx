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
      <NavLateral base={base} novos={novos} onBuscar={() => setBuscar(true)} />
      <div className="md:pl-16 lg:pl-60">
        <TopoCelular ficticia={!!base.ficticia} onBuscar={() => setBuscar(true)} />
        <AvisoFrescor base={base} />
        {children}
      </div>
      <NavInferior novos={novos} />
      <Comando base={base} aberto={buscar} onAberto={setBuscar} />
    </>
  );
}
