import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Aviso } from '@/components/hoje/estados';

export default function NaoEncontrada() {
  return (
    <main className="mx-auto max-w-[760px] px-4 pt-16">
      <Aviso icone={<SearchX className="size-5" strokeWidth={1.5} />} titulo="Página não encontrada">
        O endereço pode estar errado, ou a conta saiu da base na última importação.
        <div className="mt-3">
          <Link href="/" className="rounded-control border border-border-strong bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-1 hover:bg-muted">
            Voltar para Hoje
          </Link>
        </div>
      </Aviso>
    </main>
  );
}
