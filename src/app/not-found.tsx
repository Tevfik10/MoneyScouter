import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="size-6" />
      </div>
      <div>
        <p className="text-lg font-semibold">Deze pagina bestaat niet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Misschien is dit product of deze pagina verwijderd, of klopt de link niet meer.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ size: "sm" })}>
        Naar het overzicht
      </Link>
    </div>
  );
}
