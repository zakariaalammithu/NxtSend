/**
 * Native aurora card backgrounds (CSS gradients) for the pricing
 * cards — deep, dark fields with coloured glows at the edges, in the
 * brand's violet/blue family with one warm corner on the seat card.
 * White card copy sits on top; the gradients keep the centre dark
 * enough for it at every card size.
 */
const AURORAS = {
  seat: "radial-gradient(120% 90% at 85% -10%, rgba(64,76,255,0.55) 0%, transparent 55%), radial-gradient(90% 70% at 105% 105%, rgba(255,122,61,0.45) 0%, rgba(214,64,132,0.22) 42%, transparent 72%), radial-gradient(70% 60% at 100% 45%, rgba(96,120,255,0.32) 0%, transparent 60%), linear-gradient(160deg, #08081a 0%, #05050f 100%)",
  agency:
    "radial-gradient(110% 90% at 12% -10%, rgba(147,51,234,0.5) 0%, transparent 55%), radial-gradient(90% 80% at 100% 110%, rgba(37,99,235,0.45) 0%, transparent 62%), radial-gradient(60% 50% at 92% 8%, rgba(236,72,153,0.26) 0%, transparent 60%), linear-gradient(200deg, #0a0618 0%, #06050f 100%)",
  avatar:
    "radial-gradient(100% 100% at 0% 0%, rgba(14,116,233,0.38) 0%, transparent 55%), radial-gradient(90% 90% at 100% 100%, rgba(124,58,237,0.5) 0%, transparent 62%), radial-gradient(50% 40% at 72% 18%, rgba(45,212,191,0.2) 0%, transparent 60%), linear-gradient(150deg, #070a18 0%, #05060f 100%)",
} as const;

export type AuroraVariant = keyof typeof AURORAS;

export function AuroraBg({
  variant,
  className = "",
}: {
  variant: AuroraVariant;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 ${className}`}
      style={{ background: AURORAS[variant] }}
    />
  );
}
