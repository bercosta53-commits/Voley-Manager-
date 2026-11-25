'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { EstadoSinal } from '@/lib/tipos';
import type { StatusConta } from '@/lib/acoes';

const CHAVE = 'vr:hoje:v1';

export type StatusPorConta = Record<string, { status: StatusConta; por: string; em: string }>;

/**
 * O que o time fez com cada sinal (abordou, adiou, arquivou, útil/ruído, relevância).
 *
 * Com o registro compartilhado ligado (RADAR_ACOES=1 no Worker), lê e grava em /api/estados, que usa a tabela
 * radar_acoes: o que uma pessoa marca aparece para as outras ao abrir a tela. Desligado (a API responde 204),
 * guarda tudo só neste navegador, como antes. O navegador também guarda uma cópia local nos dois casos.
 */
export function useEstados() {
  const [estados, setEstados] = useState<Record<string, EstadoSinal>>({});
  const [status, setStatus] = useState<StatusPorConta>({});
  const [pronto, setPronto] = useState(false);
  const [compartilhado, setCompartilhado] = useState(false);
  const atual = useRef<Record<string, EstadoSinal>>({});

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch('/api/estados', { cache: 'no-store' });
        if (r.status === 200) {
          const dados = (await r.json()) as { estados?: Record<string, EstadoSinal>; status?: StatusPorConta };
          if (cancelado) return;
          atual.current = dados.estados ?? {};
          setEstados(atual.current);
          setStatus(dados.status ?? {});
          setCompartilhado(true);
          setPronto(true);
          return;
        }
      } catch {
        /* sem servidor por perto: segue para o navegador */
      }
      if (cancelado) return;
      try {
        atual.current = JSON.parse(localStorage.getItem(CHAVE) || '{}');
        setEstados(atual.current);
      } catch {
        /* navegador sem armazenamento: começa vazio */
      }
      setPronto(true);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const salvar = useCallback(
    (prox: Record<string, EstadoSinal>) => {
      // a diferença é calculada fora do setState: o React pode chamar o atualizador duas vezes
      const anterior = atual.current;
      atual.current = prox;
      setEstados(prox);
      try {
        localStorage.setItem(CHAVE, JSON.stringify(prox));
      } catch {
        /* segue só na memória */
      }
      if (!compartilhado) return;
      for (const id of new Set([...Object.keys(anterior), ...Object.keys(prox)])) {
        if (JSON.stringify(anterior[id]) === JSON.stringify(prox[id])) continue;
        const estado = prox[id] ? { acao: prox[id].acao, ate: prox[id].ate, avaliacao: prox[id].avaliacao, relevancia: prox[id].relevancia } : null;
        fetch('/api/estados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sinalId: id, estado }),
        })
          .then(r => {
            if (!r.ok) throw new Error(String(r.status));
          })
          .catch(() => {
            toast('Não consegui registrar no Radar compartilhado.', {
              description: 'A marcação ficou só neste navegador. Tente de novo em instantes.',
            });
          });
      }
    },
    [compartilhado],
  );

  return { estados, status, salvar, pronto, compartilhado };
}
