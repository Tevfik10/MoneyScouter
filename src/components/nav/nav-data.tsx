import {
  LayoutDashboard,
  Search,
  Target,
  Eye,
  Package,
  Truck,
  Swords,
  History,
  Bot,
  FlaskConical,
  Euro,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Hoofd",
    items: [
      { href: "/", label: "Overzicht", icon: LayoutDashboard },
      { href: "/discover", label: "Ontdekken", icon: Search },
      { href: "/opportunities", label: "Kansen", icon: Target },
      { href: "/watchlist", label: "Volglijst", icon: Eye },
    ],
  },
  {
    label: "Onderzoek",
    items: [
      { href: "/products", label: "Producten", icon: Package },
      { href: "/suppliers", label: "Leveranciers", icon: Truck },
      { href: "/competitors", label: "Concurrenten", icon: Swords },
      { href: "/research-runs", label: "Zoekrondes", icon: History },
    ],
  },
  {
    label: "Intelligentie",
    items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/validation-lab", label: "Validatielab", icon: FlaskConical },
    ],
  },
  {
    label: "Beheer",
    items: [
      { href: "/costs", label: "Kosten", icon: Euro },
      { href: "/settings", label: "Instellingen", icon: Settings },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
