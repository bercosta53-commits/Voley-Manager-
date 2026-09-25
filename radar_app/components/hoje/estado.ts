'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EstadoSinal } from '@/lib/tipos';

const CHAVE = 'vr:hoje:v1';

/**
 * O que a pessoa fez com cada sinal (abordou, adiou, arquivou, útil/ruído). Por enquanto fica no navegador;
 * quando o app ligar no radar, vira feedback no banco (útil/ruído alimenta a métrica de precisão).
 */
export function useEstados() {
  const [estados, setEstados] = useState<Record<string, EstadoSinal>>({});
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      setEstados(JSON.parse(localStorage.getItem(CHAVE) || '{}'));
    } catch {
      /* navegador sem armazenamento: começa vazio */
    }
    setPronto(true);
  }, []);

  const salvar = useCallback((prox: Record<string, EstadoSinal>) => {
    setEstados(prox);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(prox));
    } catch {
      /* segue só na memória */
    }
  }, []);

  return { estados, salvar, pronto };
}
