import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Rotulo } from './rotulo';

/**
 * Cartão de seção: o padrão das colunas da Conta e dos painéis laterais. Título pequeno (Rotulo) à esquerda,
 * um complemento opcional à direita (contagem, link) e o conteúdo abaixo; a seção fica rotulada pelo título
 * para leitores de tela.
 */
export function Secao({
  titulo,
  extra,
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & { titulo: React.ReactNode; extra?: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('vr-card p-5', className)} {...props}>
      <div className="flex items-baseline justify-between gap-2">
        <Rotulo id={id}>{titulo}</Rotulo>
        {extra}
      </div>
      {children}
    </section>
  );
}
