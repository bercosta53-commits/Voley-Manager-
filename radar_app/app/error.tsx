'use client';

import { ErroCarregar } from '@/components/hoje/estados';

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pt-20 md:px-6 md:pt-24">
      <ErroCarregar onTentar={reset} />
    </main>
  );
}
