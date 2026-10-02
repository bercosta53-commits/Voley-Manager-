'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EstadoSinal } from '@/lib/tipos';

const CHAVE = 'vr:hoje:v1';

/**
 * O que a pessoa fez com cada sinal (abordou, adiou, arquivou, útil/ruído).
 *
 * Quando o app roda com o banco do radar por perto (`next start`/`next dev` ao lado do radar_abm),
 * lê e grava em /api/estados: útil/ruído também alimenta `manager.py metricas`. Sem o banco (prévia
 * estática, ou antes de os coletores rodarem), guarda tudo só neste navegador.
 */
export function useEstados() {
  const [estados, setEstados] = useState<Record<string, EstadoSinal>>({});
  const [pronto, setPronto] = useState(false);
  const comBanco = useRef(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch('/api/estados');
        if (r.ok) {
          const doBanco = (await r.json()) as Record<string, EstadoSinal>;
          if (cancelado) return;
          comBanco.current = true;
          setEstados(doBanco);
          setPronto(true);
          return;
        }
      } catch {
        /* sem servidor por perto (prévia estática): segue para o navegador */
      }
      if (cancelado) return;
      try {
        setEstados(JSON.parse(localStorage.getItem(CHAVE) || '{}'));
      } catch {
        /* navegador sem armazenamento: começa vazio */
      }
      setPronto(true);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const salvar = useCallback((prox: Record<string, EstadoSinal>) => {
    setEstados(anterior => {
      if (comBanco.current) {
        for (const id of new Set([...Object.keys(anterior), ...Object.keys(prox)])) {
          if (JSON.stringify(anterior[id]) === JSON.stringify(prox[id])) continue;
          fetch('/api/estados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sinalId: id, estado: prox[id] ?? null }),
          }).catch(() => {
            /* melhor esforço: o navegador (abaixo) continua guardando o estado */
          });
        }
      }
      return prox;
    });
    try {
      localStorage.setItem(CHAVE, JSON.stringify(prox));
    } catch {
      /* segue só na memória */
    }
  }, []);

  return { estados, salvar, pronto };
}
