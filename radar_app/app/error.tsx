'use client';

import { ErroCarregar } from '@/components/hoje/estados';

// retry() busca de novo no servidor e re-renderiza (Next 16.3+); reset() só re-renderizaria o mesmo erro.
// O motivo real não chega aqui (o Next esconde a mensagem de erros do servidor): o código `digest` liga
// esta tela ao log "radar.base.erro" do Worker, e /api/saude diz o motivo.
export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  const codigo = error instanceof Error && 'digest' in error ? String((error as Error & { digest?: string }).digest ?? '') : '';
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pt-20 md:px-6 md:pt-24">
      <ErroCarregar onTentar={retry} codigo={codigo} />
    </main>
  );
}
