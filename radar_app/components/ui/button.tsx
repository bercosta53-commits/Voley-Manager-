import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Botão no padrão shadcn/ui, com as cores e raios dos tokens. Primário é tinta; o ácido não é cor de botão.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-sm font-semibold select-none ' +
    'transition-[background-color,color,box-shadow,border-color] duration-[var(--vr-dur-hover)] ease-out ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:[stroke-width:1.5]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-1 hover:opacity-90',
        secondary: 'border border-border-strong bg-card text-foreground shadow-1 hover:bg-muted',
        ghost: 'text-text-2 hover:bg-secondary hover:text-foreground',
        pressed: 'bg-secondary text-foreground',
      },
      size: {
        sm: 'h-8 px-2.5 text-sm max-md:h-11 max-md:px-3.5',
        md: 'h-9 px-3.5 max-md:h-11',
        icon: 'size-8 max-md:size-11',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export { buttonVariants };
