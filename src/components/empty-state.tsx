import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Standard empty state — friendly Dutch copy plus an optional CTA, used
 * everywhere a list/table has nothing to show yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        {Icon && (
          <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </div>
        )}
        <div className={cn(!Icon && "pt-1")}>
          <p className="font-medium">{title}</p>
          {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
