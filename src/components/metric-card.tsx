import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_STYLE = {
  default: "bg-muted text-foreground",
  success: "bg-emerald-500/15 text-emerald-500",
  warning: "bg-amber-500/15 text-amber-500",
  danger: "bg-red-500/15 text-red-500",
  info: "bg-cyan-500/15 text-cyan-500",
  intelligence: "bg-purple-500/15 text-purple-500",
} as const;

export type MetricTone = keyof typeof TONE_STYLE;

/** Standard KPI/stat tile — the primary visual building block for the
 * Dashboard and other overview surfaces. */
export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <Card className={cn("card-elevated", className)}>
      <CardContent className="flex items-start justify-between gap-3 py-1">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {Icon && (
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE_STYLE[tone])}>
            <Icon className="size-4.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
