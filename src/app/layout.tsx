import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { MobileNav } from "@/components/nav/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoneyScouter",
  description: "Vind kansrijke producten voordat je er geld in steekt.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider delay={200}>
            <div className="flex min-h-svh w-full">
              <AppSidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-2 md:hidden">
                  <div className="flex items-center gap-1">
                    <MobileNav />
                    <span className="font-semibold text-sm">MoneyScouter</span>
                  </div>
                  <ThemeToggle />
                </header>
                <div className="hidden md:flex md:h-10 md:shrink-0 md:items-center md:justify-end md:border-b md:border-border md:px-4">
                  <ThemeToggle />
                </div>
                <main className="flex-1 overflow-x-hidden">{children}</main>
              </div>
            </div>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
