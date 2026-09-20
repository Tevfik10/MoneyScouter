import { ComplianceRisk, RunStatus, Verdict } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { COMPLIANCE_RISK_LABEL_NL, RUN_STATUS_LABEL_NL, VERDICT_LABEL_NL } from "@/lib/labels";

const VERDICT_STYLE: Record<Verdict, string> = {
  HIGH_POTENTIAL: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  INTERESTING: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  WATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  REJECT: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
  PASS: "bg-muted text-muted-foreground border-border",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", VERDICT_STYLE[verdict], className)}>
      {VERDICT_LABEL_NL[verdict]}
    </Badge>
  );
}

const RISK_STYLE: Record<ComplianceRisk, string> = {
  LOW: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
  HIGH: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
};

export function ComplianceRiskBadge({ risk, className }: { risk: ComplianceRisk; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", RISK_STYLE[risk], className)}>
      {COMPLIANCE_RISK_LABEL_NL[risk]}
    </Badge>
  );
}

const RUN_STATUS_STYLE: Record<RunStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  RUNNING: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  FAILED: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
  BUDGET_STOPPED: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", RUN_STATUS_STYLE[status], className)}>
      {status === "RUNNING" && <span className="size-1.5 animate-pulse rounded-full bg-cyan-500" />}
      {RUN_STATUS_LABEL_NL[status]}
    </Badge>
  );
}

export function moneyScoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-cyan-600 dark:text-cyan-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
