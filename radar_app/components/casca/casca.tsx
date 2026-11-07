'use client';

import { useState } from 'react';
import type { Base } from '@/lib/tipos';
import { Comando } from './comando';
import { NavInferior, NavLateral, TopoCelular } from './navegacao';

/** Moldura comum às telas: menu lateral no computador, navegação inferior no celular, e o Cmd+K. */
export function Casca({ base, novos = 0, children }: { base: Base; novos?: number; children: React.ReactNode }) {
  const [buscar, setBuscar] = useState(false);
  return (
    <>
      <NavLateral base={base} novos={novos} onBuscar={() => setBuscar(true)} />
      <div className="md:pl-16 lg:pl-60">
        <TopoCelular ficticia={!!base.ficticia} onBuscar={() => setBuscar(true)} />
        {children}
      </div>
      <NavInferior novos={novos} />
      <Comando base={base} aberto={buscar} onAberto={setBuscar} />
    </>
  );
}
