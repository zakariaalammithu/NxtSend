import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SpinnerSize = "sm" | "md" | "lg" | "xl";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = "md", label = "Loading...", ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn("inline-flex items-center justify-center text-purple-500", className)}
        {...props}
      >
        <Loader2 className={cn("animate-spin shrink-0", sizeStyles[size])} aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
);

Spinner.displayName = "Spinner";

export default Spinner;
