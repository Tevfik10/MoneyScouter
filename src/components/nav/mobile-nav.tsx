"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isNavItemActive } from "@/components/nav/nav-data";

/**
 * Mobile navigation: a hamburger button that opens a slide-over drawer with
 * the same grouped destinations as the desktop sidebar. The underlying
 * base-ui Dialog handles focus trapping, body scroll lock and Escape/
 * backdrop-click-to-close for us.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the drawer automatically on navigation — synchronizing local UI
  // state with the router's pathname genuinely needs an effect here.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the drawer in response to an external pathname change, not derivable during render
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-lg" aria-label="Menu openen" />}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-4/5 max-w-xs bg-sidebar text-sidebar-foreground">
        <SheetHeader className="flex-row items-center gap-2.5 border-b border-sidebar-border">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-sm">
            <Sparkles className="size-3.5" />
          </div>
          <div className="leading-tight">
            <SheetTitle className="text-sidebar-foreground">MoneyScouter</SheetTitle>
            <div className="text-[10px] text-sidebar-foreground/50">Commerce intelligence</div>
          </div>
        </SheetHeader>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/70 active:bg-sidebar-accent/60",
                      )}
                    >
                      <Icon className={cn("size-4.5 shrink-0", active ? "text-primary" : "text-sidebar-foreground/50")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
