import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "rounded-full bg-white text-black-900 hover:bg-black-600 hover:text-white font-semibold transition-all shadow-sm active:scale-[0.98]",
  secondary:
    "rounded-full bg-purple-600 text-white hover:bg-purple-700 font-semibold transition-all shadow-glow-purple/20 active:scale-[0.98]",
  ghost:
    "rounded-full text-black-400 hover:text-white hover:bg-black-800 font-medium transition-all active:scale-[0.98]",
  danger:
    "rounded-full bg-red-600 text-white hover:bg-red-700 font-semibold transition-all active:scale-[0.98]",
  outline:
    "rounded-full border border-black-600 text-white hover:border-purple-500 hover:text-purple-400 font-medium transition-all active:scale-[0.98]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-4 text-13 gap-1.5",
  md: "h-10 px-5 text-14 gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

const spinnerSizes: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center select-none outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black-900",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <Loader2
            className={cn("animate-spin shrink-0", spinnerSizes[size])}
            aria-hidden="true"
          />
        ) : (
          leftIcon && <span className="inline-flex shrink-0 items-center">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && rightIcon && (
          <span className="inline-flex shrink-0 items-center">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
