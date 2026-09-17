import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';
import { controlBase } from './Field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leftIcon, rightSlot, className, id, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
      className={cn(controlBase, 'h-9', leftIcon && 'pl-9', rightSlot && 'pr-9', className)}
      {...rest}
    />
  );
  if (!leftIcon && !rightSlot) return input;
  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 [&>svg]:size-4">
          {leftIcon}
        </span>
      )}
      {input}
      {rightSlot && <span className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, id, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      id={id}
      rows={rows}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
      className={cn(controlBase, 'min-h-20 resize-y py-2 leading-relaxed', className)}
      {...rest}
    />
  );
});
