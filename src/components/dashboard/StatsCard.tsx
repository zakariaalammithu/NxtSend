import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, LucideIcon } from "lucide-react";

export interface StatsCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeType?: "up" | "down";
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  sublabel?: string;
  isDemo?: boolean;
  className?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  label,
  value,
  change,
  changeType = "up",
  icon: Icon,
  sublabel,
  isDemo = true,
  className,
}) => {
  return (
    <div
      className={cn(
        "glass-card-hover relative overflow-hidden p-5 flex flex-col justify-between transition-all duration-300",
        className
      )}
    >
      {/* Top row: Label & Icon */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-13 font-medium text-black-300 truncate">{label}</span>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </div>

      {/* Middle row: Large Value */}
      <div className="my-3 flex items-baseline justify-between gap-2">
        <span className="text-28 sm:text-30 font-bold tracking-tight text-white">
          {value}
        </span>
        {isDemo && (
          <span className="demo-badge text-10 py-0.5 px-2">
            Demo
          </span>
        )}
      </div>

      {/* Bottom row: Trend or sublabel */}
      <div className="flex items-center gap-2 text-12">
        {change !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              changeType === "up" ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {changeType === "up" ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )}
            {change}%
          </span>
        )}
        <span className="text-black-400 truncate">
          {sublabel || "vs last 30 days"}
        </span>
      </div>

      {/* Subtle purple glow in corner */}
      <div className="pointer-events-none absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-purple-600/5 blur-xl" />
    </div>
  );
};

export default StatsCard;
