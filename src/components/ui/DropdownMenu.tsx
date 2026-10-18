"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface DropdownMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

export type DropdownMenuAlign = "left" | "right";

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  align?: DropdownMenuAlign;
  className?: string;
  menuClassName?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  align = "right",
  className,
  menuClassName,
}) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = () => setOpen((prev) => !prev);

  const handleItemClick = (item: DropdownMenuItem) => {
    if (item.disabled) return;
    item.onClick?.();
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block text-left", className)}
    >
      {/* Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="inline-flex cursor-pointer outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </div>

      {/* Menu dropdown */}
      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={cn(
            "absolute z-50 mt-2 min-w-[200px] rounded-2xl border border-black-600/70 bg-black-800/95 p-1.5 shadow-2xl backdrop-blur-md animate-slide-down outline-none",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {items.map((item, index) => {
            if (item.divider) {
              return (
                <div
                  key={`divider-${index}`}
                  className="my-1 border-t border-black-700/60"
                  role="separator"
                />
              );
            }

            const itemContent = (
              <>
                {item.icon && (
                  <span
                    className={cn(
                      "shrink-0",
                      item.danger
                        ? "text-red-400"
                        : "text-black-400 group-hover:text-white"
                    )}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </>
            );

            const baseClass = cn(
              "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-13 font-medium transition-colors outline-none select-none text-left",
              item.disabled
                ? "cursor-not-allowed opacity-40 text-black-400"
                : item.danger
                ? "text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                : "text-black-200 hover:bg-black-700 hover:text-white cursor-pointer"
            );

            if (item.href && !item.disabled) {
              return (
                <Link
                  key={`${item.label}-${index}`}
                  href={item.href}
                  role="menuitem"
                  className={baseClass}
                  onClick={() => setOpen(false)}
                >
                  {itemContent}
                </Link>
              );
            }

            return (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => handleItemClick(item)}
                className={baseClass}
              >
                {itemContent}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

DropdownMenu.displayName = "DropdownMenu";

export default DropdownMenu;
