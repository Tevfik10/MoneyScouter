import { ComplianceRisk, Verdict } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<Verdict, string> = {
  HIGH_POTENTIAL: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  INTERESTING: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  WATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  REJECT: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
  PASS: "bg-muted text-muted-foreground border-border",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  HIGH_POTENTIAL: "High Potential",
  INTERESTING: "Interesting",
  WATCH: "Watch",
  REJECT: "Reject",
  PASS: "Pass",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", VERDICT_STYLE[verdict], className)}>
      {VERDICT_LABEL[verdict]}
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
      Compliance risk: {risk}
    </Badge>
  );
}

export function moneyScoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-blue-600 dark:text-blue-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
