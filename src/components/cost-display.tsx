import { cn } from "@/lib/utils";

/** Renders a cost figure with an explicit, unambiguous "actual" vs.
 * "estimated" tag next to it — never lets an estimate look like real
 * spend. Used everywhere Apify/AI cost is shown. */
export function CostDisplay({
  value,
  kind,
  size = "md",
  className,
}: {
  value: string;
  kind: "actual" | "estimated";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-sm",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          kind === "actual" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground",
        )}
      >
        {kind === "actual" ? "werkelijk" : "geschat"}
      </span>
    </span>
  );
}
