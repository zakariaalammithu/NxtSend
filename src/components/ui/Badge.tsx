import * as React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "green"
  | "red"
  | "blue"
  | "yellow"
  | "gray"
  | "purple"
  | "orange"
  | "demo";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-black-700 text-black-300 border border-black-600/50",
  success: "bg-green-500/15 text-green-400 border border-green-500/30",
  warning: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  error: "bg-red-500/15 text-red-400 border border-red-500/30",
  green: "bg-green-500/15 text-green-400 border border-green-500/30",
  red: "bg-red-500/15 text-red-400 border border-red-500/30",
  blue: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  yellow: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  gray: "bg-gray-500/15 text-gray-400 border border-gray-500/30",
  purple: "bg-purple-600/15 text-purple-400 border border-purple-600/30",
  orange: "bg-orange-600/15 text-orange-400 border border-orange-600/30",
  demo: "bg-orange-600/15 text-orange-400 border border-orange-600/30",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-black-400",
  success: "bg-green-400",
  warning: "bg-yellow-400",
  error: "bg-red-400",
  green: "bg-green-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
  yellow: "bg-yellow-400",
  gray: "bg-gray-400",
  purple: "bg-purple-400",
  orange: "bg-orange-400",
  demo: "bg-orange-400",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "text-11 px-2 py-0.5 gap-1 font-medium",
  md: "text-12 px-2.5 py-1 gap-1.5 font-semibold",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      dot = false,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full leading-none tracking-normal select-none transition-colors",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {variant === "demo" && (
          <Zap
            className={cn(
              "shrink-0 fill-current",
              size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"
            )}
            aria-hidden="true"
          />
        )}
        {dot && (
          <span
            className={cn(
              "rounded-full shrink-0 animate-pulse",
              dotColors[variant],
              size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
            )}
            aria-hidden="true"
          />
        )}
        <span>{children}</span>
      </span>
    );
  }
);

Badge.displayName = "Badge";

export default Badge;
