import { cn } from "@/lib/utils";

function scoreColor(score: number): { stroke: string; text: string } {
  if (score >= 80) return { stroke: "stroke-emerald-500", text: "text-emerald-500" };
  if (score >= 60) return { stroke: "stroke-cyan-500", text: "text-cyan-500" };
  if (score >= 40) return { stroke: "stroke-amber-500", text: "text-amber-500" };
  return { stroke: "stroke-red-500", text: "text-red-500" };
}

/** Circular MoneyScore indicator — purely presentational, never recomputes
 * or alters the score itself (that comes from the rule-based Judge). */
export function MoneyScoreGauge({
  score,
  size = "md",
  className,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = size === "lg" ? 96 : size === "md" ? 72 : 52;
  const stroke = size === "lg" ? 8 : size === "md" ? 6 : 5;
  const radius = (dims - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const { stroke: strokeClass, text: textClass } = scoreColor(clamped);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: dims, height: dims }}>
      <svg width={dims} height={dims} viewBox={`0 0 ${dims} ${dims}`} className="-rotate-90">
        <circle cx={dims / 2} cy={dims / 2} r={radius} strokeWidth={stroke} className="stroke-muted" fill="none" />
        <circle
          cx={dims / 2}
          cy={dims / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(strokeClass, "transition-[stroke-dashoffset] duration-500")}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-bold tabular-nums", textClass, size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm")}>
          {Math.round(clamped)}
        </span>
        {size !== "sm" && <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">score</span>}
      </div>
    </div>
  );
}
