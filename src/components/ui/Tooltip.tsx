"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipPosition;
  className?: string;
  tooltipClassName?: string;
}

const positionStyles: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const arrowStyles: Record<TooltipPosition, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-black-700 border-x-transparent border-b-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-black-700 border-x-transparent border-t-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-black-700 border-y-transparent border-r-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-black-700 border-y-transparent border-l-transparent",
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  className,
  tooltipClassName,
}) => {
  return (
    <div className={cn("relative inline-flex group items-center justify-center", className)}>
      {children}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-black-800 px-2.5 py-1 text-12 font-medium text-white shadow-xl border border-black-600/70",
          "opacity-0 scale-95 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100",
          positionStyles[position],
          tooltipClassName
        )}
      >
        {content}
        <span
          className={cn(
            "absolute h-0 w-0 border-4",
            arrowStyles[position]
          )}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

Tooltip.displayName = "Tooltip";

export default Tooltip;
