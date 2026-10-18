import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "./Button";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: ButtonVariant;
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
  children?: React.ReactNode;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      icon,
      title,
      description,
      action,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "glass-card flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-black-600/50",
          className
        )}
        {...props}
      >
        {icon && (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black-700/60 border border-black-600/60 text-purple-400 shadow-inner">
            {icon}
          </div>
        )}

        <h3 className="text-18 font-semibold text-white tracking-tight mb-2">
          {title}
        </h3>

        <p className="text-14 text-black-400 max-w-md mb-6 leading-relaxed">
          {description}
        </p>

        {action && (
          <Button
            variant={action.variant || "secondary"}
            size="md"
            onClick={action.onClick}
            leftIcon={action.icon}
          >
            {action.label}
          </Button>
        )}

        {children && <div className="mt-6 w-full">{children}</div>}
      </div>
    );
  }
);

EmptyState.displayName = "EmptyState";

export default EmptyState;
