import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-brand-600 shadow-sm',
        secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
        ghost: 'text-ink-2 hover:bg-sunken',
        danger: 'bg-down text-white hover:opacity-90',
        dark: 'bg-navy text-white hover:bg-navy-2',
      },
      size: { sm: 'h-8 px-3 text-[12px]', md: 'h-9 px-4 text-[13px]', lg: 'h-11 px-5 text-[14px]', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, ...p },
  ref,
) {
  const C = asChild ? Slot : 'button';
  return <C ref={ref} className={cn(button({ variant, size }), className)} {...p} />;
});
