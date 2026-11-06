'use client';

import { useState } from 'react';
import type { Base } from '@/lib/tipos';
import { Comando } from './comando';
import { NavInferior, NavTopo, TopoCelular } from './navegacao';

/** Moldura comum às telas: navegação (topo no computador, inferior no celular) e o Cmd+K. */
export function Casca({ base, novos = 0, children }: { base: Base; novos?: number; children: React.ReactNode }) {
  const [buscar, setBuscar] = useState(false);
  return (
    <>
      <NavTopo ficticia={!!base.ficticia} onBuscar={() => setBuscar(true)} />
      <TopoCelular ficticia={!!base.ficticia} onBuscar={() => setBuscar(true)} />
      {children}
      <NavInferior novos={novos} />
      <Comando base={base} aberto={buscar} onAberto={setBuscar} />
    </>
  );
}
