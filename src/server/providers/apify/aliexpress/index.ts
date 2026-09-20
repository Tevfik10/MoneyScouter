import { AliExpressDiscoveryProvider } from "@/server/providers/apify/aliexpress/types";
import { crawlerbrosAliExpressProvider } from "@/server/providers/apify/aliexpress/crawlerbros/provider";
import { tortugaAliExpressProvider } from "@/server/providers/apify/aliexpress/tortuga/provider";

export * from "@/server/providers/apify/aliexpress/types";
export { crawlerbrosAliExpressProvider, CRAWLERBROS_ACTOR_ID } from "@/server/providers/apify/aliexpress/crawlerbros/provider";
export { tortugaAliExpressProvider, TORTUGA_ACTOR_ID } from "@/server/providers/apify/aliexpress/tortuga/provider";

/** Every AliExpress discovery Actor MoneyScouter knows how to drive, keyed
 * by provider id — see docs/ARCHITECTURE_V1_1.md section 3 for the cost
 * comparison behind choosing Tortuga as the default. */
export const ALIEXPRESS_PROVIDERS: Record<string, AliExpressDiscoveryProvider> = {
  [tortugaAliExpressProvider.id]: tortugaAliExpressProvider,
  [crawlerbrosAliExpressProvider.id]: crawlerbrosAliExpressProvider,
};

export const DEFAULT_ALIEXPRESS_PROVIDER_ID = tortugaAliExpressProvider.id;

/** Resolves a provider id (e.g. from Settings) to its implementation,
 * falling back to the default if unset/unknown rather than throwing —
 * a stale/typo'd setting should never brick discovery. */
export function getAliExpressProvider(providerId?: string | null): AliExpressDiscoveryProvider {
  if (providerId && ALIEXPRESS_PROVIDERS[providerId]) return ALIEXPRESS_PROVIDERS[providerId];
  return ALIEXPRESS_PROVIDERS[DEFAULT_ALIEXPRESS_PROVIDER_ID];
}
