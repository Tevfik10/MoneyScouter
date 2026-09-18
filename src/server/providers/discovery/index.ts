import { DiscoveryProvider } from "@/server/providers/discovery/types";
import { mockDiscoveryProvider } from "@/server/providers/discovery/mockDiscoveryProvider";

export const discoveryProviders: Record<string, DiscoveryProvider> = {
  mock: mockDiscoveryProvider,
};

// V1 ships only the mock provider wired up. Real adapters (aliexpress,
// alibaba, cjdropshipping, google-shopping, trends, competitor scraping,
// ...) register here later behind the same DiscoveryProvider interface —
// no pipeline code changes required, per docs/ARCHITECTURE.md section F.
export function getEnabledDiscoveryProviders(): DiscoveryProvider[] {
  return [discoveryProviders.mock];
}

export * from "@/server/providers/discovery/types";
