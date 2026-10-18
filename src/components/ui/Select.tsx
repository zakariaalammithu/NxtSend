"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  options?: SelectOption[];
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      containerClassName,
      label,
      error,
      hint,
      leftIcon,
      options,
      children,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const hintId = `${selectId}-hint`;

    return (
      <div className={cn("w-full space-y-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-13 font-medium text-black-300 select-none"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3.5 flex items-center text-black-400 z-10">
              {leftIcon}
            </div>
          )}
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : hint ? hintId : undefined
            }
            className={cn(
              "input-field appearance-none pr-10 cursor-pointer",
              leftIcon && "pl-11",
              error &&
                "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/50 text-white",
              disabled && "opacity-50 cursor-not-allowed bg-black-900/50",
              className
            )}
            {...props}
          >
            {options
              ? options.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="bg-black-800 text-white py-2"
                  >
                    {option.label}
                  </option>
                ))
              : children}
          </select>
          <div className="pointer-events-none absolute right-3.5 flex items-center text-black-400">
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </div>
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

Select.displayName = "Select";

export default Select;
