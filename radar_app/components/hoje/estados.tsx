import { CheckCircle2, LockKeyhole, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function ListaEsqueleto({ linhas = 3 }: { linhas?: number }) {
  return (
    <div aria-busy aria-label="Carregando sinais" className="flex flex-col gap-3">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="vr-card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-7 w-20" />
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function Aviso({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-10 place-items-center rounded-full border border-border bg-card text-text-2 shadow-1">{icone}</div>
      <h2 className="text-md font-semibold">{titulo}</h2>
      <div className="mt-1 max-w-sm text-sm text-text-3">{children}</div>
    </div>
  );
}

export function CaixaVazia({ visao }: { visao: 'caixa' | 'adiados' | 'concluidos' }) {
  if (visao === 'adiados')
    return <Aviso icone={<CheckCircle2 className="size-5" strokeWidth={1.5} />} titulo="Nada adiado">Sinais adiados voltam para a caixa na data escolhida.</Aviso>;
  if (visao === 'concluidos')
    return <Aviso icone={<CheckCircle2 className="size-5" strokeWidth={1.5} />} titulo="Nada concluído ainda">O que você abordar ou arquivar aparece aqui.</Aviso>;
  return (
    <Aviso icone={<CheckCircle2 className="size-5 text-ok" strokeWidth={1.5} />} titulo="Caixa zerada">
      Nenhum sinal esperando por você. Os próximos chegam quando os coletores encontrarem novidades.
    </Aviso>
  );
}

export function ErroCarregar({ onTentar }: { onTentar?: () => void }) {
  return (
    <Aviso icone={<TriangleAlert className="size-5 text-risk" strokeWidth={1.5} />} titulo="Não consegui abrir os sinais">
      <p>Pode ser uma falha passageira. Tente de novo em instantes; se continuar, avise quem cuida do Radar.</p>
      <p className="mt-1 text-xs">Detalhe técnico: a base de contas não pôde ser lida (npm run dados gera de novo).</p>
      {onTentar && (
        <button onClick={onTentar} className="mt-3 rounded-control border border-border-strong bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-1 hover:bg-muted">
          Tentar de novo
        </button>
      )}
    </Aviso>
  );
}

export function SemPermissao() {
  return (
    <Aviso icone={<LockKeyhole className="size-5" strokeWidth={1.5} />} titulo="Você não tem acesso a este espaço">
      Peça acesso ao sócio responsável pela conta da Velora. Assim que liberar, os sinais aparecem aqui.
    </Aviso>
  );
}
