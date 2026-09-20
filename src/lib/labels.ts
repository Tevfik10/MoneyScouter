// Centralized Dutch display copy for every enum shown in the UI. Database
// values, TypeScript identifiers and logs stay in English — this module is
// the single place that maps them to natural, user-facing Dutch, so every
// page shows the same wording for the same status.
import {
  AgentType,
  ComplianceRisk,
  ProductStatus,
  RunStatus,
  Verdict,
} from "@prisma/client";

export const RUN_STATUS_LABEL_NL: Record<RunStatus, string> = {
  PENDING: "Wachtend",
  RUNNING: "Bezig",
  COMPLETED: "Voltooid",
  FAILED: "Mislukt",
  BUDGET_STOPPED: "Gestopt door budgetlimiet",
};

export const VERDICT_LABEL_NL: Record<Verdict, string> = {
  HIGH_POTENTIAL: "Hoge potentie",
  INTERESTING: "Interessant",
  WATCH: "In de gaten houden",
  REJECT: "Afgewezen",
  PASS: "Geslaagd",
};

export const PRODUCT_STATUS_LABEL_NL: Record<ProductStatus, string> = {
  DISCOVERED: "Gevonden",
  FILTERED_OUT: "Afgevallen bij selectie",
  ENRICHED: "Verrijkt",
  SHORTLISTED: "Op shortlist",
  RESEARCHED: "Onderzocht",
  REJECTED: "Afgewezen",
  WATCHLISTED: "Op volglijst",
  INTERESTING: "Interessant",
  HIGH_POTENTIAL: "Hoge potentie",
};

export const COMPLIANCE_RISK_LABEL_NL: Record<ComplianceRisk, string> = {
  LOW: "Laag risico",
  MEDIUM: "Gemiddeld risico",
  HIGH: "Hoog risico",
};

/** Dutch display name + one-line plain-language description per agent —
 * shown on the Agents page. Internal identifiers (AgentType) stay English. */
export const AGENT_INFO_NL: Record<AgentType, { name: string; description: string }> = {
  SCOUT: {
    name: "Scout Agent",
    description: "Zoekt nieuwe producten en kansen bij leveranciers.",
  },
  DEDUP: {
    name: "Dedup Agent",
    description: "Herkent producten die al eerder zijn gezien, zodat we niet twee keer voor hetzelfde betalen.",
  },
  FILTER: {
    name: "Filter Agent",
    description: "Verwijdert producten die niet aan onze voorwaarden voldoen.",
  },
  COMPETITOR: {
    name: "Concurrentie Agent",
    description: "Onderzoekt prijzen en aanbieders in de markt.",
  },
  MARGIN: {
    name: "Marge Agent",
    description: "Berekent wat er mogelijk overblijft na kosten.",
  },
  SUPPLIER: {
    name: "Leverancier Agent",
    description: "Beoordeelt de betrouwbaarheid en voorwaarden van de leverancier.",
  },
  TREND: {
    name: "Trend Agent",
    description: "Signaleert of een product in opkomst is, op basis van meetbare gegevens.",
  },
  RISK: {
    name: "Risico Agent",
    description: "Controleert mogelijke risico's, zoals regelgeving of aansprakelijkheid.",
  },
  JUDGE: {
    name: "Judge Agent",
    description: "Berekent de uiteindelijke MoneyScore op basis van alle bevindingen.",
  },
  MARKET: {
    name: "Markt Agent",
    description: "Schat de vraag naar een product in.",
  },
  BRAND: {
    name: "Merk Agent",
    description: "Beoordeelt hoe geschikt een product is om als merk te positioneren.",
  },
  ANGLE: {
    name: "Marketing Agent",
    description: "Bedenkt mogelijke invalshoeken om een product te vermarkten.",
  },
  SKEPTIC: {
    name: "Kritische Agent",
    description: "Zoekt actief naar redenen om een kans af te wijzen, voordat wij dat zelf doen.",
  },
};

/** Human, non-technical explanations for known failure/stop reasons. Falls
 * back to the raw technical message (kept visible but secondary) when
 * nothing matches — we never hide real error detail, just lead with
 * something a non-developer can act on. */
export function explainStopReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason.includes("APIFY_API_TOKEN")) {
    return "MoneyScouter kan momenteel geen productdata ophalen. Controleer de Apify-koppeling bij de omgevingsinstellingen.";
  }
  if (reason.includes("budget") || reason.includes("Apify run blocked")) {
    return "Zoekronde gestopt omdat het dagelijkse Apify-budget is bereikt.";
  }
  if (reason.includes("time budget")) {
    return "Zoekronde vroegtijdig afgerond om veilig te kunnen stoppen, in plaats van halverwege te worden onderbroken.";
  }
  if (reason.includes("No search keywords")) {
    return "Er zijn nog geen zoektermen ingesteld. Voeg zoektermen toe bij Instellingen.";
  }
  return null;
}
