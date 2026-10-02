'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import type { Conta, Sinal } from '@/lib/tipos';
import { rascunho } from '@/lib/mensagem';
import { Button } from '@/components/ui/button';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';

/** Abordar: rascunho da mensagem para a pessoa certa do comitê. A pessoa revisa, copia e envia por fora. */
export function Abordar({
  alvo,
  onFechar,
  onAbordado,
}: {
  alvo: { sinal: Sinal; conta: Conta } | null;
  onFechar: () => void;
  onAbordado: (sinal: Sinal) => void;
}) {
  const [texto, setTexto] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (alvo) {
      setTexto(rascunho(alvo.sinal, alvo.conta));
      setCopiado(false);
    }
  }, [alvo]);

  const para = alvo?.sinal.abordar.nome
    ? `${alvo.sinal.abordar.nome}${alvo.sinal.abordar.cargo ? `, ${alvo.sinal.abordar.cargo}` : ''}`
    : `${alvo?.sinal.abordar.cargo ?? ''} (a identificar)`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <PainelFlutuante aberto={!!alvo} onFechar={onFechar} titulo={`Abordar ${alvo?.conta.nome ?? ''}`} descricao={`Para ${para}`}>
      <label className="grid gap-1.5 text-sm">
        <span className="text-text-2">Rascunho da primeira mensagem</span>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={6}
          className="w-full resize-y rounded-control border border-input bg-card p-3 text-base leading-relaxed text-foreground outline-none"
        />
      </label>
      <p className="mt-2 text-xs text-text-3">{texto.length} caracteres · revise antes de enviar; nada é enviado pelo Radar.</p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={copiar}>
          {copiado ? <Check className="text-ok" /> : <Copy />} {copiado ? 'Copiado' : 'Copiar mensagem'}
        </Button>
        <Button variant="primary" onClick={() => alvo && onAbordado(alvo.sinal)}>
          <Send /> Marcar como abordado
        </Button>
      </div>
    </PainelFlutuante>
  );
}
