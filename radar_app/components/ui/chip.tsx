import { cn } from '@/lib/utils';

/**
 * Selo pequeno (rótulo, contagem, status). Um lugar só para tamanho, raio e tons; a cor de domínio (tier, papel,
 * estágio do VSCS) continua vindo dos mapas de cada área por `className`.
 */
const TONS = {
  /** só contorno: atributos neutros (tier, status) */
  contorno: 'border border-border text-text-2',
  /** fundo cinza: tipo de sinal, categoria */
  neutro: 'bg-secondary text-text-2',
  /** contorno sobre cartão: oferta, rótulo de recomendação */
  cartao: 'border border-border bg-card text-foreground',
  quente: 'bg-warm-bg text-warm',
  ok: 'bg-ok-bg text-ok',
  risco: 'bg-risk-bg text-risk',
  /** sólidos: só para o que pede atenção imediata (novo, abordar) */
  'ok-solido': 'bg-ok text-white',
  'risco-solido': 'bg-risk text-white',
  /** sem tom: a cor vem de className */
  livre: '',
} as const;
export type TomChip = keyof typeof TONS;

export function Chip({
  tom = 'contorno',
  peso = 'normal',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tom?: TomChip; peso?: 'normal' | 'medio' | 'forte' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-xs whitespace-nowrap',
        peso === 'medio' && 'font-medium',
        peso === 'forte' && 'font-semibold',
        TONS[tom],
        className,
      )}
      {...props}
    />
  );
}
