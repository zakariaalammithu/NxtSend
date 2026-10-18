import * as React from "react";
import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarStatus = "online" | "offline" | "busy" | "away";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  online?: boolean; // Convenience prop
  alt?: string;
}

const sizeStyles: Record<AvatarSize, { container: string; text: string; dot: string; pixelSize: number }> = {
  xs: { container: "h-6 w-6", text: "text-10", dot: "h-1.5 w-1.5", pixelSize: 24 },
  sm: { container: "h-8 w-8", text: "text-12", dot: "h-2 w-2", pixelSize: 32 },
  md: { container: "h-10 w-10", text: "text-14", dot: "h-2.5 w-2.5", pixelSize: 40 },
  lg: { container: "h-12 w-12", text: "text-16", dot: "h-3 w-3", pixelSize: 48 },
  xl: { container: "h-16 w-16", text: "text-20", dot: "h-3.5 w-3.5", pixelSize: 64 },
};

const statusColors: Record<AvatarStatus, string> = {
  online: "bg-green-400",
  offline: "bg-black-400",
  busy: "bg-red-400",
  away: "bg-yellow-400",
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      name = "",
      size = "md",
      status,
      online,
      alt,
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = React.useState(false);
    const { container, text, dot, pixelSize } = sizeStyles[size];

    const effectiveStatus: AvatarStatus | undefined =
      status || (online !== undefined ? (online ? "online" : "offline") : undefined);

    const initials = React.useMemo(() => getInitials(name || "?"), [name]);
    const avatarAlt = alt || name || "User avatar";

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 select-none items-center justify-center rounded-full bg-black-700",
          container,
          className
        )}
        {...props}
      >
        {src && !imageError ? (
          <Image
            src={src}
            alt={avatarAlt}
            width={pixelSize}
            height={pixelSize}
            className="h-full w-full rounded-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-brand-purple to-orange-600 font-bold uppercase text-white shadow-inner",
              text
            )}
            aria-label={avatarAlt}
          >
            {initials}
          </div>
        )}

        {effectiveStatus && (
          <span
            className={cn(
              "absolute bottom-0 right-0 rounded-full ring-2 ring-black-900",
              statusColors[effectiveStatus],
              dot
            )}
            aria-label={`Status: ${effectiveStatus}`}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export default Avatar;
