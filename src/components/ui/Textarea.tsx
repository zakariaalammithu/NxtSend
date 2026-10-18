import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      containerClassName,
      label,
      error,
      hint,
      id,
      disabled,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const hintId = `${textareaId}-hint`;

    return (
      <div className={cn("w-full space-y-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-13 font-medium text-black-300 select-none"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <textarea
            ref={ref}
            id={textareaId}
            rows={rows}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : hint ? hintId : undefined
            }
            className={cn(
              "input-field resize-y min-h-[96px]",
              error &&
                "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/50 text-white",
              disabled && "opacity-50 cursor-not-allowed bg-black-900/50",
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={errorId} className="text-12 text-red-400 font-medium">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-12 text-black-400">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
