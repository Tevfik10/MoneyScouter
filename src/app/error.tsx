"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[MoneyScouter] unhandled page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div>
        <p className="text-lg font-semibold">Er ging iets mis</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Deze pagina kon niet worden geladen. Probeer het opnieuw — als het probleem aanhoudt, bekijk dan de
          technische details hieronder.
        </p>
      </div>
      <Button size="sm" onClick={() => reset()}>
        Opnieuw proberen
      </Button>
      {error.message && (
        <details className="mt-2 max-w-md text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Technische details</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2">{error.message}</pre>
        </details>
      )}
    </div>
  );
}
